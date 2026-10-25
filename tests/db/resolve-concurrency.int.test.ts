// D01-P01 Tarea 1: concurrencia REAL de resolve_contact (cerrojos B2, 23505, RR con reintento N3).
// Cada worker concurrente usa su propia conexion. Controles negativos por el MISMO arnes:
//  - mutante de B2 (sin cerrojo + pg_sleep) DEBE duplicar en paralelo y NO en serie;
//  - rr_agent_with_retry limitado a 1 intento DEBE dejar contactos sin agente.
// La MEDICION N3 documenta cuantas llamadas a assign_next_rr_agent de prod reciben NULL por SKIP LOCKED.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Sql } from 'postgres'
import {
  RUN, AVA, SERVICE, startBench, seedAgents, resolveContact, createIntakeDeal, holdLock, waitForWaiting, backendPid, waitPidBlocked,
  setRrActive, asRole, matchEvents, type Bench, type Seed, type Identity, type ResolveRow,
} from './helpers/bench'
import { loadMutantFrom0035, MUTANT_NAME } from './helpers/mutant'

interface Worker { who: Identity; phone: string; meta?: string }
const KEY = '18095550101'
// 4 Ava con +, 2 CRM con + y meta_lead_id, 2 CRM sin + (formato local de 10 digitos).
const WORKERS: Worker[] = [
  ...Array.from({ length: 4 }, () => ({ who: AVA, phone: '+18095550101' })),
  ...Array.from({ length: 2 }, () => ({ who: SERVICE, phone: '+18095550101', meta: 'L-QA' })),
  ...Array.from({ length: 2 }, () => ({ who: SERVICE, phone: '8095550101' })),
]

describe.skipIf(!RUN)('resolve_contact concurrente (Postgres embebido 17.6)', () => {
  let b: Bench
  let seed: Seed

  beforeAll(async () => { b = await startBench() })
  afterAll(async () => { await b?.stop() })
  beforeEach(async () => { seed = await seedAgents(b.sql) })

  const contactsByKey = async () =>
    b.sql<{ k: string | null; n: number }[]>`select phone_key k, count(*)::int n from public.contacts group by 1 order by 2 desc`

  // resolve_contact (o su mutante) + create_intake_deal en la conexion propia del worker.
  async function runWorker(conn: Sql, w: Worker, fn = 'resolve_contact'): Promise<ResolveRow> {
    const r = await resolveContact(conn, w.who, {
      phone: w.phone, key: KEY, meta: w.meta ?? null, rr: true, noAgent: true, fn,
    })
    if (r.contact_id && r.agent_id) await createIntakeDeal(conn, w.who, r.contact_id, r.agent_id)
    return r
  }

  async function warmConnections(n: number): Promise<Sql[]> {
    const conns = Array.from({ length: n }, () => b.connect())
    await Promise.all(conns.map((c) => c`select 1`))
    return conns
  }

  describe('N3: medicion de assign_next_rr_agent de prod (SKIP LOCKED) con 2 agentes activos', () => {
    it('MEDICION: 6 transacciones en paralelo que sostienen 100 ms -> cuantas reciben NULL', async () => {
      const conns = await warmConnections(6)
      const out = await Promise.all(conns.map((c) => c.begin(async (t) => {
        const [{ a }] = await t<{ a: string | null }[]>`select public.assign_next_rr_agent() a`
        await t`select pg_sleep(0.1)`
        return a
      })))
      const nulls = out.filter((a) => a === null).length
      console.log(`[N3 medicion] 6 en paralelo, 2 agentes activos: ${nulls} NULL por SKIP LOCKED, ${6 - nulls} con agente`)
      expect(out.filter((a) => a !== null).length).toBeGreaterThanOrEqual(1)
      expect(nulls).toBeGreaterThanOrEqual(1)
      expect(new Set(out.filter((a) => a !== null)).size).toBe(out.filter((a) => a !== null).length)
    })
  })

  describe('RR concurrente (W6, N3)', () => {
    const numbers = Array.from({ length: 6 }, (_, i) => `+1809555020${i}`)
    const keyOfNumber = (n: string) => n.slice(1)

    it('6 numeros distintos en paralelo con p_assign_rr: 6 contactos, todos con agente, sin error', async () => {
      const conns = await warmConnections(6)
      const res = await Promise.allSettled(numbers.map((n, i) =>
        resolveContact(conns[i], AVA, { phone: n, key: keyOfNumber(n), rr: true, noAgent: true })))
      expect(res.map((r) => (r.status === 'rejected' ? String(r.reason) : 'ok'))).toEqual(Array(6).fill('ok'))
      const rows = await b.sql`select agent_id from public.contacts`
      expect(rows).toHaveLength(6)
      expect(rows.every((r) => r.agent_id !== null)).toBe(true)
      expect((await matchEvents(b.sql)).filter((e) => e.kind === 'no_agent')).toHaveLength(0)
    })

    // Mismo arnes que la prueba anterior (6 numeros, mismas conexiones, sin retencion): solo cambia el numero de
    // intentos. Medido el 2026-10-24: 1 intento deja 4 de 6 sin agente (5 de 5 repeticiones); 3 intentos, 0 de 6.
    it('CONTROL NEGATIVO: el MISMO arnes con rr_agent_with_retry de 1 intento deja contactos sin agente y evento no_agent', async () => {
      const [{ def }] = await b.sql<{ def: string }[]>`select pg_get_functiondef('public.rr_agent_with_retry()'::regprocedure) def`
      try {
        await b.sql.unsafe(`
          create or replace function public.rr_agent_with_retry() returns uuid
          language plpgsql security definer set search_path = '' as $f$
          begin
            return public.assign_next_rr_agent();
          end $f$`)
        const conns = await warmConnections(6)
        const res = await Promise.allSettled(numbers.map((n, i) =>
          resolveContact(conns[i], AVA, { phone: n, key: keyOfNumber(n), rr: true, noAgent: true })))
        expect(res.every((r) => r.status === 'fulfilled')).toBe(true)
        const rows = await b.sql`select agent_id from public.contacts`
        expect(rows).toHaveLength(6)
        expect(rows.filter((r) => r.agent_id === null).length).toBeGreaterThanOrEqual(1)
        expect((await matchEvents(b.sql)).filter((e) => e.kind === 'no_agent').length).toBeGreaterThanOrEqual(1)
      } finally {
        await b.sql.unsafe(def)
      }
    })

    it('con 0 filas activas en round_robin_config el reintento no espera (NULL al primer intento)', async () => {
      await setRrActive(b.sql, false)
      const ms = await asRole(b.sql, SERVICE, async (t) => {
        const [{ t0 }] = await t<{ t0: Date }[]>`select clock_timestamp() t0`
        const [{ a }] = await t<{ a: string | null }[]>`select public.rr_agent_with_retry() a`
        const [{ t1 }] = await t<{ t1: Date }[]>`select clock_timestamp() t1`
        expect(a).toBeNull()
        return t1.getTime() - t0.getTime()
      })
      expect(ms).toBeLessThan(80)
    })
  })

  describe('23505: una sesion inserta sin cerrojo (como la UI) y no confirma', () => {
    it('resolve_contact del mismo numero espera, recibe 23505 y devuelve found con el id de la otra sesion', async () => {
      let release!: () => void
      const gate = new Promise<void>((r) => { release = r })
      let ready!: (id: string) => void
      const inserted = new Promise<string>((r) => { ready = r })
      const ui = b.connect()
      const uiTx = ui.begin(async (t) => {
        const [{ id }] = await t<{ id: string }[]>`
          insert into public.contacts (phone, whatsapp_number, agent_id)
          values ('+18095550199', '+18095550199', ${seed.jenny.id}) returning id`
        ready(id)
        await gate
      })
      const otherId = await Promise.race([inserted, uiTx.then(() => '')])
      const workerConn = b.connect()
      const workerPid = await backendPid(workerConn)
      const pending = resolveContact(workerConn, AVA, { phone: '+18095550199', key: '18095550199', rr: true })
      const settled = pending.then((v) => ({ v }), (e: unknown) => ({ e }))
      try {
        // Espera el PID del worker (no cualquier lock): tiene que estar bloqueado esperando a la sesion UI.
        expect(await waitPidBlocked(b.sql, workerPid, 3000)).toBe(true)
      } finally {
        release()
        await uiTx
      }
      const out = await settled
      expect('e' in out ? String(out.e) : '').toBe('')
      const r = (out as { v: ResolveRow }).v
      expect(r).toMatchObject({ outcome: 'found', contact_id: otherId })
      expect((await b.sql`select 1 from public.contacts`).length).toBe(1)
    })
  })

  describe('cerrojos B2: 8 workers contra un cerrojo retenido', () => {
    it('las 8 sesiones esperan de verdad (N8) y al soltar queda 1 contacto, 1 agente, 1 deal y 1 aviso', async () => {
      const conns = await warmConnections(WORKERS.length)
      const hold = await holdLock(b.sql, 73010, KEY.slice(-8))
      let runs: Promise<PromiseSettledResult<ResolveRow>[]> | undefined
      let waiting = -1
      try {
        runs = Promise.allSettled(WORKERS.map((w, i) => runWorker(conns[i], w)))
        waiting = await waitForWaiting(b.sql, 8, 5000)
        expect(waiting).toBe(8)
      } finally {
        await hold.release()
      }
      const settled = await runs!
      expect(settled.map((s) => (s.status === 'rejected' ? String(s.reason) : 'ok'))).toEqual(Array(8).fill('ok'))
      const contacts = await b.sql`select id, agent_id from public.contacts`
      expect(contacts).toHaveLength(1)
      expect(contacts[0].agent_id).not.toBeNull()
      expect(await b.sql`select 1 from public.deals`).toHaveLength(1)
      expect(await b.sql`select 1 from public.agent_lead_notifications`).toHaveLength(1)
    })

    it('dos mensajes simultaneos de Ava del mismo numero nuevo -> 1 contacto', async () => {
      const conns = await warmConnections(2)
      const out = await Promise.all(conns.map((c) =>
        resolveContact(c, AVA, { phone: '+18095550301', key: '18095550301', rr: true, noAgent: true })))
      expect(out.map((o) => o.outcome).sort()).toEqual(['created', 'found'])
      expect(out[0].contact_id).toBe(out[1].contact_id)
      expect(await b.sql`select 1 from public.contacts`).toHaveLength(1)
    })
  })

  describe('CONTROL NEGATIVO de concurrencia (B2): el mutante sin cerrojo SI duplica', () => {
    async function installMutant(): Promise<void> {
      const m = loadMutantFrom0035()
      // El texto cambia exactamente en estos puntos y en ningun otro.
      expect(m.removedLockLines).toBe(2)
      expect(m.sleepInsertions).toBe(1)
      expect(m.renamedHeaders).toBe(1)
      expect(m.lineDelta).toBe(-1)
      expect(m.sql).toContain(MUTANT_NAME)
      expect(m.sql).not.toContain('pg_advisory_xact_lock')
      expect(m.sql).toContain('perform pg_sleep(0.05);')
      await b.sql.unsafe(m.sql)
    }

    it('el mutante se construye desde 0035 cambiando solo los puntos esperados', async () => {
      await installMutant()
    })

    it('MISMOS 8 workers y formatos en PARALELO -> 2 o mas contactos con la misma phone_key', async () => {
      await installMutant()
      const conns = await warmConnections(WORKERS.length)
      const res = await Promise.allSettled(WORKERS.map((w, i) => runWorker(conns[i], w, MUTANT_NAME)))
      expect(res.map((s) => (s.status === 'rejected' ? String(s.reason) : 'ok'))).toEqual(Array(8).fill('ok'))
      const groups = await contactsByKey()
      expect(groups[0]?.k).toBe(KEY)
      expect(groups[0]?.n).toBeGreaterThanOrEqual(2)
    })

    it('el MISMO mutante con los 8 workers en SERIE -> 1 contacto', async () => {
      await installMutant()
      const conn = b.connect()
      for (const w of WORKERS) await runWorker(conn, w, MUTANT_NAME)
      const groups = await contactsByKey()
      expect(groups).toEqual([{ k: KEY, n: 1 }])
    })
  })
})
