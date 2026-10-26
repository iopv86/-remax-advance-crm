// D01-P02: adaptador con el subconjunto EXACTO de supabase-js que usan processLead, recordLeadIngest,
// enqueueCapiEvent, resolveDealAgent/assignRrAgent, el emisor (lib/agent-notifications) y el barrido D18
// (lib/prefilled-sweep), ejecutado contra el Postgres embebido como service_role (una transaccion por llamada,
// como una peticion de PostgREST). Los resultados pasan por jsonb, igual que PostgREST: timestamptz como texto,
// numeric como numero, uuid como texto. Cualquier cadena u operador no soportado LANZA `UNSUPPORTED_CHAIN ...`:
// nunca devuelve vacio en silencio.
import type { Sql } from 'postgres'
import { asRole, SERVICE } from './bench'

type PgErr = { code?: string; message: string }
type Result = { data: unknown; error: PgErr | null }

const IDENT = /^[a-z_][a-z0-9_]*$/
const q = (s: string) => {
  if (!IDENT.test(s)) throw new Error(`UNSUPPORTED_CHAIN identificador ${JSON.stringify(s)}`)
  return `"${s}"`
}
const asError = (e: unknown): Result => {
  const err = e as { code?: string; message?: string }
  return { data: null, error: { code: err.code, message: err.message ?? String(e) } }
}

class Params {
  readonly values: unknown[] = []
  /**
   * Placeholder para un valor; los objetos van como jsonb (lead_form_answers, payload de CAPI). El objeto se pasa
   * SIN serializar: postgres.js describe la sentencia, ve `$n::jsonb` y aplica su propio JSON.stringify (pasarle
   * texto ya serializado lo codificaba dos veces y guardaba una cadena JSON en vez de un objeto).
   */
  add(v: unknown): string {
    if (v === undefined || v === null) { this.values.push(null); return `$${this.values.length}` }
    if (v instanceof Date) { this.values.push(v.toISOString()); return `$${this.values.length}` }
    if (Array.isArray(v)) throw new Error('UNSUPPORTED_CHAIN array como valor de columna')
    if (typeof v === 'object') { this.values.push(v); return `$${this.values.length}::jsonb` }
    this.values.push(v)
    return `$${this.values.length}`
  }
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'update' | 'insert' | 'upsert' = 'select'
  private cols = '*'
  private returning: string | null = null
  private readonly where: ((p: Params) => string)[] = []
  private payload: Record<string, unknown> | null = null
  private conflict: string | null = null
  private orderBy: string | null = null
  private lim: number | null = null
  private singleMode: 'maybe' | 'one' | null = null

  constructor(private readonly sql: Sql, private readonly table: string) { q(table) }

  private colList(cols: string): string {
    const parts = cols.split(',').map((c) => c.trim()).filter(Boolean)
    if (parts.length === 1 && parts[0] === '*') return '*'
    return parts.map(q).join(', ')
  }

  select(cols = '*') {
    if (this.op === 'select') this.cols = this.colList(cols)
    else this.returning = this.colList(cols)
    return this
  }
  update(p: Record<string, unknown>) { this.op = 'update'; this.payload = p; return this }
  insert(p: Record<string, unknown> | Record<string, unknown>[]) {
    if (Array.isArray(p)) throw new Error('UNSUPPORTED_CHAIN insert de varias filas')
    this.op = 'insert'; this.payload = p; return this
  }
  upsert(p: Record<string, unknown>, o?: { onConflict?: string }) {
    if (!o?.onConflict) throw new Error('UNSUPPORTED_CHAIN upsert sin onConflict')
    this.op = 'upsert'; this.payload = p; this.conflict = o.onConflict; return this
  }
  eq(c: string, v: unknown) {
    if (v === null || v === undefined) throw new Error(`UNSUPPORTED_CHAIN eq(${c}, null): usar is()`)
    this.where.push((p) => `${q(c)} = ${p.add(v)}`); return this
  }
  is(c: string, v: null) {
    if (v !== null) throw new Error(`UNSUPPORTED_CHAIN is(${c}, ${String(v)})`)
    this.where.push(() => `${q(c)} is null`); return this
  }
  not(c: string, op: string, v: unknown) {
    if (op !== 'is' || v !== null) throw new Error(`UNSUPPORTED_CHAIN not(${c}, ${op})`)
    this.where.push(() => `${q(c)} is not null`); return this
  }
  in(c: string, vs: unknown[]) {
    if (!Array.isArray(vs)) throw new Error(`UNSUPPORTED_CHAIN in(${c}) sin array`)
    this.where.push((p) => `${q(c)}::text = any(array(select jsonb_array_elements_text(${p.add({ v: vs.map(String) })}->'v')))`)
    return this
  }
  lt(c: string, v: unknown) { this.where.push((p) => `${q(c)} < ${p.add(v)}`); return this }
  lte(c: string, v: unknown) { this.where.push((p) => `${q(c)} <= ${p.add(v)}`); return this }
  gte(c: string, v: unknown) { this.where.push((p) => `${q(c)} >= ${p.add(v)}`); return this }
  filter(c: string, op: string, v: string) {
    if (op !== 'imatch') throw new Error(`UNSUPPORTED_CHAIN filter(${c}, ${op})`)
    this.where.push((p) => `${q(c)} ~* ${p.add(v)}`); return this
  }
  order(c: string, o?: { ascending?: boolean }) {
    this.orderBy = `${q(c)} ${o?.ascending === false ? 'desc' : 'asc'}`; return this
  }
  limit(n: number) {
    if (!Number.isInteger(n) || n < 0) throw new Error(`UNSUPPORTED_CHAIN limit(${n})`)
    this.lim = n; return this
  }
  maybeSingle() { this.singleMode = 'maybe'; return this }
  /** Como supabase-js: exactamente 1 fila o error PGRST116. */
  single() { this.singleMode = 'one'; return this }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, ko)
  }

  private build(): { text: string; values: unknown[] } {
    const p = new Params()
    const t = `public.${q(this.table)}`
    const where = this.where.length ? ` where ${this.where.map((w) => w(p)).join(' and ')}` : ''
    if (this.op === 'select') {
      const tail = `${this.orderBy ? ` order by ${this.orderBy}` : ''}${this.lim !== null ? ` limit ${this.lim}` : ''}`
      return { text: `select coalesce(jsonb_agg(r), '[]'::jsonb) j from (select ${this.cols} from ${t}${where}${tail}) r`, values: p.values }
    }
    if (this.orderBy || this.lim !== null) throw new Error(`UNSUPPORTED_CHAIN order/limit en ${this.op}`)
    const payload = this.payload ?? {}
    const keys = Object.keys(payload)
    if (keys.length === 0) throw new Error(`UNSUPPORTED_CHAIN ${this.op} sin columnas`)
    let stmt: string
    if (this.op === 'update') {
      stmt = `update ${t} set ${keys.map((k) => `${q(k)} = ${p.add(payload[k])}`).join(', ')}${where}`
    } else {
      if (this.where.length) throw new Error(`UNSUPPORTED_CHAIN filtros en ${this.op}`)
      stmt = `insert into ${t} (${keys.map(q).join(', ')}) values (${keys.map((k) => p.add(payload[k])).join(', ')})`
      if (this.op === 'upsert') {
        const conflict = q(this.conflict as string)
        const set = keys.filter((k) => k !== this.conflict).map((k) => `${q(k)} = excluded.${q(k)}`)
        stmt += set.length ? ` on conflict (${conflict}) do update set ${set.join(', ')}` : ` on conflict (${conflict}) do nothing`
      }
    }
    if (this.returning) {
      return { text: `with w as (${stmt} returning ${this.returning}) select coalesce(jsonb_agg(w), '[]'::jsonb) j from w`, values: p.values }
    }
    return { text: stmt, values: p.values }
  }

  private async run(): Promise<Result> {
    const { text, values } = this.build()
    try {
      const rows = await asRole(this.sql, SERVICE, (t) => t.unsafe(text, values as never[]))
      if (this.op !== 'select' && !this.returning) return { data: null, error: null }
      const list = ((rows[0] as unknown as { j: unknown[] }).j ?? []) as Record<string, unknown>[]
      if (this.singleMode === 'one' && list.length !== 1) {
        return { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${list.length}` } }
      }
      if (this.singleMode) {
        if (list.length > 1) return { data: null, error: { code: 'PGRST116', message: 'more than one row' } }
        return { data: list[0] ?? null, error: null }
      }
      return { data: list, error: null }
    } catch (e) {
      return asError(e)
    }
  }
}

interface ProcInfo { retset: boolean; names: string[]; types: string[] }

/** Cliente con la forma de supabase-js sobre el banco. `rpcCalls` registra cada rpc (nombre y argumentos). */
export function pgDb(sql: Sql) {
  const procs = new Map<string, ProcInfo>()
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []

  async function info(name: string): Promise<ProcInfo> {
    const hit = procs.get(name)
    if (hit) return hit
    const rows = await sql<{ retset: boolean; names: string[] | null; types: string[]; n: number }[]>`
      select p.proretset retset, p.proargnames names, p.pronargs n,
             array(select format_type(a, null) from unnest(p.proargtypes::oid[]) with ordinality u(a, i) order by i) types
        from pg_proc p where p.proname = ${name} and p.pronamespace = 'public'::regnamespace`
    if (rows.length !== 1) throw new Error(`UNSUPPORTED_CHAIN rpc ${name}: ${rows.length} funciones con ese nombre`)
    const r = rows[0]
    const got = { retset: r.retset, names: (r.names ?? []).slice(0, r.n), types: r.types }
    procs.set(name, got)
    return got
  }

  return {
    rpcCalls,
    from: (table: string) => new Query(sql, table),
    rpc: async (name: string, args: Record<string, unknown> = {}): Promise<Result> => {
      rpcCalls.push({ name, args })
      const fn = await info(name)
      const p = new Params()
      // supabase-js serializa con JSON.stringify: una clave undefined no viaja y PostgREST usa el DEFAULT.
      const parts = Object.keys(args).filter((k) => args[k] !== undefined).map((k) => {
        const i = fn.names.indexOf(k)
        if (i < 0) throw new Error(`UNSUPPORTED_CHAIN rpc ${name}: argumento ${k} inexistente`)
        p.add(args[k])
        return `${q(k)} => $${p.values.length}::${fn.types[i]}`
      })
      const call = `public.${q(name)}(${parts.join(', ')})`
      const text = fn.retset
        ? `select coalesce(jsonb_agg(r), '[]'::jsonb) j from ${call} r`
        : `select to_jsonb(${call}) j`
      try {
        const rows = await asRole(sql, SERVICE, (t) => t.unsafe(text, p.values as never[]))
        return { data: (rows[0] as unknown as { j: unknown }).j ?? null, error: null }
      } catch (e) {
        return asError(e)
      }
    },
  }
}
