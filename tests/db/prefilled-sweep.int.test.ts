// D01-P02 Tarea 3: barrido D18 (lib/prefilled-sweep) contra el Postgres embebido 17.6 con resolve_contact y
// create_intake_deal reales, por el adaptador pg-db (service_role).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { RUN, startBench, seedAgents, insertContact, setRrActive, matchEvents, type Bench, type Seed } from './helpers/bench'
import { pgDb } from './helpers/pg-db'
import { assignStalePrefilledContacts } from '@/lib/prefilled-sweep'

type Db = Parameters<typeof assignStalePrefilledContacts>[0]
const MIN = 60_000
const PREFILLED = 'Enlace:\n\n\n¡Hola! Quiero más información'

describe.skipIf(!RUN)('barrido D18 de contactos con texto prellenado (Postgres embebido 17.6)', () => {
  let b: Bench
  let seed: Seed
  let now: number
  const sweep = () => assignStalePrefilledContacts(pgDb(b.sql) as unknown as Db, { now })

  beforeAll(async () => { b = await startBench({ ingestTables: true }) })
  afterAll(async () => { await b?.stop() })
  beforeEach(async () => {
    seed = await seedAgents(b.sql)
    await b.sql`insert into public.agency_config (key, value) values ('agent_notify_queue_live', 'true')`
    now = Date.now()
  })

  /** Contacto de Ava (ctwa_ad) creado hace `ageMs` con su primer mensaje inbound. */
  async function avaContact(phone: string, ageMs: number, first = PREFILLED, o: { agent?: string; source?: string } = {}) {
    const at = new Date(now - ageMs)
    const id = await insertContact(b.sql, { phone, whatsapp: phone, agent: o.agent ?? null, createdAt: at })
    await b.sql`update public.contacts set source = ${o.source ?? 'ctwa_ad'}::public.lead_source where id = ${id}`
    await b.sql`insert into public.messages (contact_id, direction, content, created_at) values (${id}, 'inbound', ${first}, ${at})`
    return id
  }
  const state = async () => ({
    deals: (await b.sql<{ n: number }[]>`select count(*)::int n from public.deals`)[0].n,
    queue: await b.sql<{ status: string }[]>`select status from public.agent_lead_notifications order by id`,
  })
  const agentOf = async (id: string) => (await b.sql`select agent_id from public.contacts where id = ${id}`)[0].agent_id as string | null

  it('creado hace 14 min -> la pasada no asigna (0 deals)', async () => {
    const c = await avaContact('18095550101', 14 * MIN)
    expect((await sweep()).swept).toBe(0)
    expect(await agentOf(c)).toBeNull()
    expect((await state()).deals).toBe(0)
  })

  it("creado hace 15 min y 1 s -> 1 agente por RR, 1 deal de intake y 1 aviso 'pending'; la segunda pasada no duplica", async () => {
    const c = await avaContact('18095550101', 15 * MIN + 1000)
    expect(await sweep()).toMatchObject({ swept: 1, sweptNoAgent: 0, errors: 0 })
    expect([seed.jenny.id, seed.joanny.id]).toContain(await agentOf(c))
    expect(await state()).toEqual({ deals: 1, queue: [{ status: 'pending' }] })
    expect(await b.sql`select 1 from public.deals where contact_id = ${c} and stage = 'nuevo_sin_contactar'`).toHaveLength(1)
    expect((await sweep()).swept).toBe(0)
    expect(await state()).toEqual({ deals: 1, queue: [{ status: 'pending' }] })
  })

  it('dos pasadas en PARALELO sobre un candidato nuevo -> 1 deal y 1 aviso', async () => {
    const c = await avaContact('18095550101', 20 * MIN)
    const [r1, r2] = await Promise.all([sweep(), sweep()])
    expect(r1.swept + r2.swept).toBe(1)
    expect(r1.errors + r2.errors).toBe(0)
    expect(await state()).toEqual({ deals: 1, queue: [{ status: 'pending' }] })
    expect(await agentOf(c)).not.toBeNull()
  })

  it('no toca: contacto con agente, sin prellenado ("hola"), lead_form ni de mas de 7 dias', async () => {
    const conAgente = await avaContact('18095550101', 20 * MIN, PREFILLED, { agent: seed.jenny.id })
    const hola = await avaContact('18095550102', 20 * MIN, 'hola')
    const form = await avaContact('18095550103', 20 * MIN, PREFILLED, { source: 'lead_form' })
    const viejo = await avaContact('18095550104', 7 * 24 * 60 * MIN + MIN)
    expect((await sweep()).swept).toBe(0)
    expect(await agentOf(conAgente)).toBe(seed.jenny.id)
    expect(await agentOf(hola)).toBeNull()
    expect(await agentOf(form)).toBeNull()
    expect(await agentOf(viejo)).toBeNull()
    expect((await state()).deals).toBe(0)
  })

  it('"hola" primero y el prellenado despues -> no es D18 (manda el PRIMER inbound)', async () => {
    const c = await avaContact('18095550101', 20 * MIN, 'hola')
    await b.sql`insert into public.messages (contact_id, direction, content, created_at)
                values (${c}, 'inbound', ${PREFILLED}, ${new Date(now - 19 * MIN)})`
    expect((await sweep()).swept).toBe(0)
    expect(await agentOf(c)).toBeNull()
    expect((await state()).deals).toBe(0)
  })

  it('sin agentes activos -> no_agent, 0 deals y 1 evento no_agent', async () => {
    await setRrActive(b.sql, false)
    const c = await avaContact('18095550101', 20 * MIN)
    expect(await sweep()).toMatchObject({ swept: 0, sweptNoAgent: 1 })
    expect(await agentOf(c)).toBeNull()
    expect((await state()).deals).toBe(0)
    expect((await matchEvents(b.sql)).map((e) => ({ kind: e.kind, caller: e.caller }))).toEqual([{ kind: 'no_agent', caller: 'crm' }])
  })

  it('sin la bandera no hace nada (nadie avisaria al agente: la fila quedaria skipped)', async () => {
    await b.sql`delete from public.agency_config where key = 'agent_notify_queue_live'`
    const c = await avaContact('18095550101', 20 * MIN)
    expect((await sweep()).skipped).toBe('queue_not_live')
    expect(await agentOf(c)).toBeNull()
  })
})
