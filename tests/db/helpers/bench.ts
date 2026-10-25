// Banco aislado de D01-P01: Postgres embebido 17.6 (= prod) con el esquema REAL de prod
// (tests/db/fixtures/prod-schema.sql, generado) y despues las migraciones 0034-0037 que existan.
// Opt-in: PG_INTEGRATION=1 npm run test:int. Las dependencias (embedded-postgres, postgres) viven en
// tests/db/node_modules y NO en la raiz: por eso todo import de ellas es dinamico o `import type`.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Sql, TransactionSql } from 'postgres'

export const RUN = process.env.PG_INTEGRATION === '1'
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const MIGRATIONS = [
  '0034_contacts_phone_key.sql',
  '0035_resolve_contact.sql',
  '0036_agent_lead_notifications.sql',
  '0037_contacts_phone_check.sql',
] as const

// Binarios de @embedded-postgres/windows-x64@17.6.0-beta.15 auditados el 2026-10-14 (mismas constantes que
// advance-finance/lib/__tests__/ncf-reserve.int.test.ts). Si un hash difiere NO se ejecuta nada.
const WIN_BIN_DIR_SHA256 = '43a9bd5ebcc56a1ab225fb9fa99279b1420afc8dc8fb52f036499cac315eb6ad'
// native/lib (93 dlls, medido el 2026-10-25): misma forma de listado que native/bin.
const WIN_LIB_DIR_SHA256 = '1a7b333e4dd9494f3b087e2b257885d54785f973767a3a7f16bfd60601fee1ec'
const WIN_BIN_SHA256: Record<string, string> = {
  'postgres.exe': '54e7e05939e61f3462e3fd295bc12292623ad3cf010c02ae9cc3295a64b0770f',
  'initdb.exe': '96da800ec12faed19209c7f9e21231c3dca2dcb12d2215751e18b0b9df20cec1',
  'pg_ctl.exe': '4343536036689feb178461c559cc71c1003d11d9a7b9191ddd13e1fb835481f4',
}

export function verifyWindowsBinaries(): void {
  if (process.platform !== 'win32') throw new Error(`BINARIO_NO_AUDITADO_PLATAFORMA ${process.platform}`)
  const req = createRequire(import.meta.url)
  const epgMain = req.resolve('embedded-postgres')
  const bin = createRequire(epgMain)('@embedded-postgres/windows-x64') as Record<string, string>
  const dir = path.dirname(bin.postgres)
  const sha = (f: string) => createHash('sha256').update(readFileSync(path.join(dir, f))).digest('hex')
  for (const [file, expected] of Object.entries(WIN_BIN_SHA256)) {
    if (sha(file) !== expected) throw new Error(`BINARIO_NO_AUDITADO ${file}`)
  }
  const listingSha = (d: string) => {
    const files = readdirSync(d).filter((f) => statSync(path.join(d, f)).isFile()).sort()
    const sha1 = (f: string) => createHash('sha256').update(readFileSync(path.join(d, f))).digest('hex')
    return createHash('sha256').update(files.map((f) => `${f}\t${sha1(f)}\n`).join('')).digest('hex')
  }
  if (listingSha(dir) !== WIN_BIN_DIR_SHA256) throw new Error('BINARIO_NO_AUDITADO native/bin')
  if (listingSha(path.join(path.dirname(dir), 'lib')) !== WIN_LIB_DIR_SHA256) throw new Error('BINARIO_NO_AUDITADO native/lib')
}

// Fin de linea LF, como se aplican en prod (con core.autocrlf un clon en Windows las trae en CRLF).
export const readSql = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
export const migrationPath = (f: string) => path.join(REPO, 'migrations', f)
export const fixturePath = (f: string) => path.join(REPO, 'tests', 'db', 'fixtures', f)

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

export interface Bench {
  /** Conexion de superusuario (postgres): siembra y comprueba saltandose RLS. */
  sql: Sql
  /** Conexion nueva (max 1) propia de un worker; la cierra stop(). */
  connect: () => Sql
  applied: string[]
  skipped: string[]
  stop: () => Promise<void>
}

export interface StartOptions {
  /** Migraciones que NO se cargan (p.ej. 0037 para probar el CHECK sobre filas previas). */
  without?: readonly string[]
}

export async function applyMigration(sql: Sql, file: string): Promise<void> {
  const text = readSql(migrationPath(file))
  await sql.begin((t) => t.unsafe(text))
}

export async function startBench(opts: StartOptions = {}): Promise<Bench> {
  verifyWindowsBinaries()
  const { default: EmbeddedPostgres } = await import('embedded-postgres')
  const { default: postgres } = await import('postgres')
  const port = await freePort()
  const password = randomBytes(18).toString('hex')
  const databaseDir = await mkdtemp(path.join(tmpdir(), 'crm-pg-'))
  const instance = new EmbeddedPostgres({
    databaseDir,
    port,
    user: 'postgres',
    password,
    authMethod: 'scram-sha-256',
    persistent: false,
    // UTF8 explicito: en Windows initdb toma la codepage (WIN1252) y md5(prosrc) de cuerpos con acentos difiere de prod.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'max_connections=120'],
    onLog: () => {},
  })
  try {
    await instance.initialise()
    await instance.start()
  } catch (e) {
    await instance.stop().catch(() => {})
    await rm(databaseDir, { recursive: true, force: true })
    throw e
  }
  const mk = (max: number) =>
    postgres({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', max, onnotice: () => {} })
  const sql = mk(30)
  const extra: Sql[] = []
  const applied: string[] = []
  const skipped: string[] = []
  const stop = async () => {
    await Promise.all(extra.map((c) => c.end({ timeout: 2 }).catch(() => {})))
    await sql.end({ timeout: 5 }).catch(() => {})
    await instance.stop().catch(() => {})
    await rm(databaseDir, { recursive: true, force: true }).catch(() => {})
  }
  try {
    await sql.unsafe(readSql(fixturePath('prod-schema.sql')))
    for (const f of MIGRATIONS) {
      if (opts.without?.includes(f)) {
        skipped.push(f)
        continue
      }
      if (!existsSync(migrationPath(f))) throw new Error(`falta la migracion ${f} (no esta en "without")`)
      await applyMigration(sql, f)
      applied.push(f)
    }
  } catch (e) {
    await stop()
    throw e
  }
  console.log(`[bench] migraciones aplicadas: ${applied.join(', ') || '(ninguna)'}; omitidas: ${skipped.join(', ') || '(ninguna)'}`)
  return { sql, connect: () => { const c = mk(1); extra.push(c); return c }, applied, skipped, stop }
}

// ---- Identidades de llamador (hecho 8) ----------------------------------------------------------------
export interface Identity { role: 'anon' | 'authenticated' | 'service_role'; claims: Record<string, string> }
export const AVA: Identity = { role: 'authenticated', claims: { role: 'authenticated', email: 'info@remaxadvance.com' } }
export const SERVICE: Identity = { role: 'service_role', claims: { role: 'service_role' } }
export const ANON: Identity = { role: 'anon', claims: { role: 'anon' } }
export const AGENTE = (email: string, id?: string): Identity => ({
  role: 'authenticated',
  claims: { role: 'authenticated', email, ...(id ? { sub: id } : {}) },
})

/** begin; set local role; set local request.jwt.claims; fn; commit. */
export async function asRole<T>(sql: Sql, who: Identity, fn: (t: TransactionSql) => Promise<T>): Promise<T> {
  const result = await sql.begin(async (t) => {
    await t.unsafe(`set local role ${who.role}`)
    await t`select set_config('request.jwt.claims', ${JSON.stringify(who.claims)}, true)`
    return fn(t)
  })
  return result as T
}

/** SQLSTATE del error que lanza p (o null si no lanza). Un fallo sin code devuelve el mensaje. */
export async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return err.code ?? `SIN_CODE: ${err.message}`
  }
}

// ---- Datos ----------------------------------------------------------------------------------------------
export interface Person { id: string; email: string; name: string }
export interface Seed { jenny: Person; joanny: Person; admin: Person; all: Person[] }

const person = (name: string): Person => ({
  id: randomUUID(),
  email: `${name.toLowerCase().replace(/\s+/g, '.')}@test.local`,
  name,
})

/** Vacia todo y siembra Jenny y Joanny activas en RR (posiciones 1 y 2) y un admin fuera del RR. */
export async function seedAgents(sql: Sql): Promise<Seed> {
  const present = await sql<{ name: string }[]>`
    select n as name from unnest(array['contact_match_events','agent_lead_notifications','agent_time_notifications']) n
     where to_regclass('public.' || n) is not null`
  const extra = present.map((r) => `public.${r.name}`)
  const tables = ['public.contacts', 'public.deals', 'public.activities', 'public.messages', 'public.notifications',
    'public.deal_stage_history', 'public.round_robin_config', 'public.agents', 'public.agency_config', 'auth.users', ...extra]
  await sql.unsafe(`truncate ${tables.join(', ')} restart identity cascade`)
  const jenny = person('Jenny Rojas')
  const joanny = person('Joanny Mejia')
  const admin = person('Admin Prueba')
  const all = [jenny, joanny, admin]
  for (const p of all) {
    await sql`insert into auth.users (id) values (${p.id})`
    await sql`insert into public.agents (id, email, full_name, role, is_active)
              values (${p.id}, ${p.email}, ${p.name}, ${p === admin ? 'admin' : 'agent'}::public.agent_role, true)`
  }
  await sql`insert into public.round_robin_config (agent_id, position, is_active) values (${jenny.id}, 1, true), (${joanny.id}, 2, true)`
  return { jenny, joanny, admin, all }
}

export async function setRrActive(sql: Sql, active: boolean): Promise<void> {
  await sql`update public.round_robin_config set is_active = ${active}`
}

export async function insertContact(
  sql: Sql,
  f: { phone?: string | null; whatsapp?: string | null; agent?: string | null; meta?: string | null;
       status?: string; archivedAt?: Date | null; first?: string | null; createdAt?: Date },
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.contacts (phone, whatsapp_number, agent_id, meta_lead_id, lead_status, archived_at, first_name, created_at)
    values (${f.phone ?? null}, ${f.whatsapp ?? null}, ${f.agent ?? null}, ${f.meta ?? null},
            ${f.status ?? 'new'}::public.lead_status, ${f.archivedAt ?? null}, ${f.first ?? null},
            ${f.createdAt ?? new Date()})
    returning id`
  return row.id
}

export async function countContacts(sql: Sql): Promise<number> {
  const [r] = await sql<{ n: number }[]>`select count(*)::int n from public.contacts`
  return r.n
}

// ---- Concurrencia ---------------------------------------------------------------------------------------
/** Sesion que toma pg_advisory_xact_lock(ns, hashtext(key)) y no confirma hasta release(). */
export async function holdLock(client: Sql, ns: number, key: string): Promise<{ release: () => Promise<void> }> {
  if (!Number.isInteger(ns) || !/^\d+$/.test(key)) throw new Error('holdLock: ns entero y key numerica')
  let open!: () => void
  const gate = new Promise<void>((r) => { open = r })
  let ready!: () => void
  const locked = new Promise<void>((r) => { ready = r })
  const done = client.begin(async (t) => {
    await t.unsafe(`select pg_advisory_xact_lock(${ns}, hashtext('${key}'))`)
    ready()
    await gate
  })
  await Promise.race([locked, done])
  return { release: async () => { open(); await done } }
}

/** Sesiones esperando un cerrojo advisory de dos claves (classid = ns, objsubid = 2) en ESTA base. */
export async function waitingLocks(sql: Sql, ns = 73010): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int n from pg_locks
     where locktype = 'advisory' and not granted and classid = ${ns} and objsubid = 2
       and database = (select oid from pg_database where datname = current_database())`
  return r.n
}

/** Sondea cada 10 ms hasta que waitingLocks == target o pasan maxMs; devuelve el ultimo valor visto. */
export async function waitForWaiting(sql: Sql, target: number, maxMs = 2000, ns = 73010): Promise<number> {
  const t0 = Date.now()
  let n = await waitingLocks(sql, ns)
  while (n !== target && Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, 10))
    n = await waitingLocks(sql, ns)
  }
  return n
}

export async function backendPid(conn: Sql): Promise<number> {
  const [r] = await conn<{ pid: number }[]>`select pg_backend_pid() pid`
  return r.pid
}

/** Espera (maxMs) a que el backend `pid` tenga algun lock sin conceder; devuelve true si lo vio. */
export async function waitPidBlocked(sql: Sql, pid: number, maxMs = 3000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) {
    const [r] = await sql<{ n: number }[]>`select count(*)::int n from pg_locks where pid = ${pid} and not granted`
    if (r.n > 0) return true
    await new Promise((res) => setTimeout(res, 10))
  }
  return false
}

/** resolve_contact con la firma completa; devuelve la unica fila. */
export interface ResolveArgs {
  phone: string | null; key: string | null; meta?: string | null; first?: string | null; last?: string | null
  source?: string | null; rr?: boolean; noAgent?: boolean; fn?: string
}
export interface ResolveRow {
  outcome: string; contact_id: string | null; agent_id: string | null; agent_assigned_now: boolean
  matched_by: string | null; candidate_ids: string[]
}
export async function resolveContact(sql: Sql, who: Identity, a: ResolveArgs): Promise<ResolveRow> {
  const fn = a.fn ?? 'resolve_contact'
  if (!/^[a-z_]+$/.test(fn)) throw new Error('resolveContact: nombre de funcion invalido')
  const rows = await asRole(sql, who, (t) =>
    t.unsafe(
      `select * from public.${fn}($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::boolean, $8::boolean)`,
      [a.phone, a.key, a.meta ?? null, a.first ?? null, a.last ?? null, a.source ?? null, a.rr ?? false, a.noAgent ?? false],
    ))
  return rows[0] as unknown as ResolveRow
}

export async function createIntakeDeal(sql: Sql, who: Identity, contactId: string, agentId: string | null): Promise<string | null> {
  const rows = await asRole(sql, who, (t) =>
    t<{ d: string | null }[]>`select public.create_intake_deal(${contactId}, ${agentId}) d`)
  return rows[0].d
}

export interface MatchEvent {
  kind: string; caller: string; key_last4: string | null; contact_id: string | null; candidate_ids: string[]
}
export async function matchEvents(sql: Sql): Promise<MatchEvent[]> {
  return sql<MatchEvent[]>`
    select kind, caller, key_last4, contact_id, candidate_ids from public.contact_match_events order by id`
}
