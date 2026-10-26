// Doble en memoria del subconjunto de supabase-js que usan lib/agent-notifications, lib/match-alerts y
// lib/prefilled-sweep. Ejecuta los filtros de verdad (no graba un guion de llamadas), asi que una prueba
// afirma el estado final. Una cadena o un operador no soportado lanza: nunca devuelve vacio en silencio.
type Row = Record<string, unknown>;
export interface FakeError { code?: string; message: string }
type Result = { data: unknown; error: FakeError | null };
type RpcFn = (args: Record<string, unknown>) => Result | Promise<Result>;

export interface FakeDbOptions {
  tables?: Record<string, Row[]>;
  /** Columnas unicas por tabla: un insert que repite valor devuelve 23505. */
  unique?: Record<string, string[]>;
  rpc?: Record<string, RpcFn>;
  /** Error inyectado por tabla y operacion (select/update/insert/upsert). */
  fail?: (q: { table: string; op: string }) => FakeError | null;
}

type Filter = (r: Row) => boolean;

export function fakeDb(opts: FakeDbOptions = {}) {
  const tables: Record<string, Row[]> = structuredClone(opts.tables ?? {});
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  let seq = 1000;

  const table = (t: string) => (tables[t] ??= []);
  // Numeros como numeros y fechas ISO por instante (no por texto: "Z" frente a "+00:00").
  const cmp = (a: unknown, b: unknown) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    const da = typeof a === "string" ? Date.parse(a) : NaN;
    const dbt = typeof b === "string" ? Date.parse(b) : NaN;
    if (Number.isFinite(da) && Number.isFinite(dbt) && /^\d{4}-\d{2}-\d{2}T/.test(String(a)) && /^\d{4}-\d{2}-\d{2}T/.test(String(b))) {
      return da - dbt;
    }
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  };

  class Query implements PromiseLike<Result> {
    private op: "select" | "update" | "insert" | "upsert" = "select";
    private filters: Filter[] = [];
    private payload: Row | Row[] | null = null;
    private onConflict: string | null = null;
    private returning = false;
    private singleMode: "maybe" | "one" | null = null;
    private orderBy: { col: string; asc: boolean } | null = null;
    private lim: number | null = null;

    constructor(private readonly t: string) {}

    // Las columnas no se proyectan: el doble devuelve la fila entera.
    select(cols?: string) { void cols; if (this.op !== "select") this.returning = true; return this; }
    update(p: Row) { this.op = "update"; this.payload = p; return this; }
    insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
    upsert(p: Row, o: { onConflict: string }) { this.op = "upsert"; this.payload = p; this.onConflict = o.onConflict; return this; }
    // PostgREST: eq.null compara con el TEXTO "null" y no casa filas NULL; hay que usar is().
    eq(c: string, v: unknown) {
      if (v === null || v === undefined) throw new Error(`UNSUPPORTED_CHAIN eq(${c}, null): usar is()`);
      this.filters.push((r) => r[c] === v);
      return this;
    }
    is(c: string, v: null) {
      if (v !== null) throw new Error(`UNSUPPORTED_CHAIN is(${c}, ${String(v)})`);
      this.filters.push((r) => r[c] === null || r[c] === undefined);
      return this;
    }
    not(c: string, op: string, v: unknown) {
      if (op !== "is" || v !== null) throw new Error(`UNSUPPORTED_CHAIN not(${c}, ${op})`);
      this.filters.push((r) => r[c] !== null && r[c] !== undefined);
      return this;
    }
    in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
    lt(c: string, v: unknown) { this.filters.push((r) => cmp(r[c], v) < 0); return this; }
    lte(c: string, v: unknown) { this.filters.push((r) => cmp(r[c], v) <= 0); return this; }
    gte(c: string, v: unknown) { this.filters.push((r) => cmp(r[c], v) >= 0); return this; }
    filter(c: string, op: string, v: string) {
      if (op !== "imatch") throw new Error(`UNSUPPORTED_CHAIN filter(${c}, ${op})`);
      const re = new RegExp(v, "i");
      this.filters.push((r) => typeof r[c] === "string" && re.test(r[c] as string));
      return this;
    }
    order(c: string, o?: { ascending?: boolean }) { this.orderBy = { col: c, asc: o?.ascending !== false }; return this; }
    limit(n: number) { this.lim = n; return this; }
    maybeSingle() { this.singleMode = "maybe"; return this; }
    single() { this.singleMode = "one"; return this; }

    then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null) {
      // Un microtask de espera, como una red: dos llamadas en paralelo se intercalan de verdad.
      return Promise.resolve().then(() => this.run()).then(ok, ko);
    }

    private match(): Row[] {
      return table(this.t).filter((r) => this.filters.every((f) => f(r)));
    }

    private run(): Result {
      const injected = opts.fail?.({ table: this.t, op: this.op });
      if (injected) return { data: null, error: injected };
      if (this.op === "select") {
        let rows = this.match().map((r) => ({ ...r }));
        if (this.orderBy) {
          const { col, asc } = this.orderBy;
          rows.sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]));
        }
        if (this.lim !== null) rows = rows.slice(0, this.lim);
        return this.shape(rows);
      }
      if (this.op === "update") {
        const hit = this.match();
        for (const r of hit) Object.assign(r, this.payload);
        return this.returning ? this.shape(hit.map((r) => ({ ...r }))) : { data: null, error: null };
      }
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const written: Row[] = [];
      for (const p of rows) {
        const uniq = this.onConflict ? [this.onConflict] : opts.unique?.[this.t] ?? [];
        const clash = table(this.t).find((r) => uniq.some((c) => p[c] !== undefined && r[c] === p[c]));
        if (clash && this.op === "insert") return { data: null, error: { code: "23505", message: "duplicate key" } };
        if (clash) { Object.assign(clash, p); written.push(clash); }
        else { const r = { id: p.id ?? seq++, ...p }; table(this.t).push(r); written.push(r); }
      }
      return this.returning ? this.shape(written.map((r) => ({ ...r }))) : { data: null, error: null };
    }

    /** maybeSingle(): 0 o 1 fila; single(): exactamente 1; si no, la lista. Como supabase-js (PGRST116). */
    private shape(rows: Row[]): Result {
      if (this.singleMode === "one" && rows.length !== 1) {
        return { data: null, error: { code: "PGRST116", message: `expected 1 row, got ${rows.length}` } };
      }
      if (this.singleMode) {
        if (rows.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    }
  }

  return {
    tables,
    rpcCalls,
    from: (t: string) => new Query(t),
    rpc: async (name: string, args: Record<string, unknown> = {}): Promise<Result> => {
      rpcCalls.push({ name, args });
      const fn = opts.rpc?.[name];
      if (!fn) throw new Error(`UNSUPPORTED_CHAIN rpc ${name}`);
      return fn(args);
    },
  };
}
