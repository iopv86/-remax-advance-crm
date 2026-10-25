// D01-P01 Tarea 1: comportamiento de public.resolve_contact (0035) en un solo hilo.
// La concurrencia (N3, 23505, cerrojos, mutante B2) esta en resolve-concurrency.int.test.ts.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  RUN, AVA, SERVICE, startBench, seedAgents, insertContact, resolveContact, codeOf, countContacts,
  matchEvents, setRrActive, type Bench, type Seed,
} from './helpers/bench'

describe.skipIf(!RUN)('resolve_contact (Postgres embebido 17.6)', () => {
  let b: Bench
  let seed: Seed

  beforeAll(async () => { b = await startBench() })
  afterAll(async () => { await b?.stop() })
  beforeEach(async () => { seed = await seedAgents(b.sql) })

  const contact = async (id: string) =>
    (await b.sql`select * from public.contacts where id = ${id}`)[0]

  describe('alta minima', () => {
    it('p_first_name nulo o en blanco deja first_name NULL (no "Lead") y source cae al default other', async () => {
      const a = await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', first: null, rr: true })
      const c = await resolveContact(b.sql, AVA, { phone: '+18095550102', key: '18095550102', first: '   ', rr: true })
      expect(a.outcome).toBe('created')
      expect(c.outcome).toBe('created')
      for (const r of [a, c]) {
        const row = await contact(r.contact_id!)
        expect(row.first_name).toBeNull()
        expect(row.source).toBe('other')
        expect(row.lead_status).toBe('new')
        expect(row.phone).toBe(row.whatsapp_number)
      }
    })

    it.each(['ctwa_ad', 'lead_form'])('p_source %s se guarda tal cual y el nombre se recorta', async (source) => {
      const r = await resolveContact(b.sql, AVA, {
        phone: '+18095550103', key: '18095550103', first: '  Maria ', last: ' Perez ', source, rr: true,
      })
      const row = await contact(r.contact_id!)
      expect(row).toMatchObject({ first_name: 'Maria', last_name: 'Perez', source })
    })

    it('un contacto nuevo con rr recibe agente de RR y assigned_at; agent_assigned_now = true', async () => {
      const r = await resolveContact(b.sql, AVA, { phone: '+18095550104', key: '18095550104', rr: true })
      expect(r).toMatchObject({ outcome: 'created', agent_assigned_now: true })
      expect([seed.jenny.id, seed.joanny.id]).toContain(r.agent_id)
      expect((await contact(r.contact_id!)).assigned_at).not.toBeNull()
    })
  })

  describe('busqueda', () => {
    it('variante: 1 evento variant con los ultimos 4 digitos y el llamador', async () => {
      const stored = await insertContact(b.sql, { phone: '655501234', agent: seed.jenny.id })
      const r = await resolveContact(b.sql, SERVICE, { phone: '+34655501234', key: '34655501234', rr: true })
      expect(r).toMatchObject({ outcome: 'found', matched_by: 'variant', contact_id: stored })
      const ev = await matchEvents(b.sql)
      expect(ev).toHaveLength(1)
      expect(ev[0]).toMatchObject({ kind: 'variant', caller: 'crm', key_last4: '1234', contact_id: stored })
    })

    it('ambiguous: dos candidatos por variante -> sin contactos nuevos y 1 evento con los 2 candidate_ids', async () => {
      const a = await insertContact(b.sql, { phone: '+543624123456', agent: seed.jenny.id })
      const c = await insertContact(b.sql, { phone: '543624123456', agent: seed.joanny.id })
      const r = await resolveContact(b.sql, AVA, { phone: '+5493624123456', key: '5493624123456', rr: true })
      expect(r.outcome).toBe('ambiguous')
      expect(r.contact_id).toBeNull()
      expect([...r.candidate_ids].sort()).toEqual([a, c].sort())
      expect(await countContacts(b.sql)).toBe(2)
      const ev = await matchEvents(b.sql)
      expect(ev).toHaveLength(1)
      expect(ev[0].kind).toBe('ambiguous')
      expect([...ev[0].candidate_ids].sort()).toEqual([a, c].sort())
    })

    it('dup_group: gana el contacto cuyo agente esta activo en RR, aunque sea el mas nuevo', async () => {
      const old = await insertContact(b.sql, { phone: '+18095550101', agent: seed.admin.id, createdAt: new Date('2026-01-01') })
      const fresh = await insertContact(b.sql, { phone: '8095550101', agent: seed.jenny.id, createdAt: new Date('2026-06-01') })
      const r = await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', rr: true })
      expect(r).toMatchObject({ outcome: 'found', matched_by: 'dup_group', contact_id: fresh })
      const ev = await matchEvents(b.sql)
      expect(ev).toHaveLength(1)
      expect(ev[0].kind).toBe('dup_group')
      expect([...ev[0].candidate_ids].sort()).toEqual([old, fresh].sort())
    })

    it('dup_group: si empatan en RR gana el mas antiguo', async () => {
      const old = await insertContact(b.sql, { phone: '+18095550101', agent: seed.jenny.id, createdAt: new Date('2026-01-01') })
      await insertContact(b.sql, { phone: '8095550101', agent: seed.joanny.id, createdAt: new Date('2026-06-01') })
      const r = await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', rr: true })
      expect(r).toMatchObject({ outcome: 'found', matched_by: 'dup_group', contact_id: old })
      expect(await matchEvents(b.sql)).toHaveLength(1)
    })

    it('meta_lead_id: p_key nulo y meta_lead_id existente -> found/meta_lead_id', async () => {
      const stored = await insertContact(b.sql, { phone: '+18095550177', meta: 'LEAD-1', agent: seed.jenny.id })
      const r = await resolveContact(b.sql, SERVICE, { phone: null, key: null, meta: 'LEAD-1', rr: true })
      expect(r).toMatchObject({ outcome: 'found', matched_by: 'meta_lead_id', contact_id: stored })
    })

    it('22023: p_key distinto de phone_key(p_phone)', async () => {
      const code = await codeOf(resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550199', rr: true }))
      expect(code).toBe('22023')
    })

    it('22023: p_key y p_meta_lead_id nulos', async () => {
      const code = await codeOf(resolveContact(b.sql, AVA, { phone: '+18095550101', key: null, meta: null, rr: true }))
      expect(code).toBe('22023')
    })

    it('22023: p_key que no son 8 a 15 digitos', async () => {
      const code = await codeOf(resolveContact(b.sql, AVA, { phone: '+1234', key: '1234', rr: true }))
      expect(code).toBe('22023')
    })
  })

  describe('R7: un contacto con agente nunca vuelve a RR', () => {
    it('agent_id = X con p_assign_rr: sigue con X, agent_assigned_now = false y el puntero de RR no se mueve', async () => {
      const stored = await insertContact(b.sql, { phone: '+18095550101', agent: seed.admin.id })
      const before = await b.sql`select id, updated_at from public.round_robin_config order by id`
      const r = await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', rr: true })
      expect(r).toMatchObject({ outcome: 'found', contact_id: stored, agent_id: seed.admin.id, agent_assigned_now: false })
      expect((await contact(stored)).agent_id).toBe(seed.admin.id)
      expect(await b.sql`select id, updated_at from public.round_robin_config order by id`).toEqual(before)
    })

    it('contacto encontrado SIN agente y p_assign_rr: se asigna ahora (agent_assigned_now = true)', async () => {
      const stored = await insertContact(b.sql, { phone: '+18095550101' })
      const r = await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', rr: true })
      expect(r).toMatchObject({ outcome: 'found', contact_id: stored, agent_assigned_now: true })
      expect([seed.jenny.id, seed.joanny.id]).toContain(r.agent_id)
      expect((await contact(stored)).agent_id).toBe(r.agent_id)
    })

    it('trg_contact_reassigned (prod): cambiar agent_id fija assigned_at, previous_agent_id y limpia la respuesta', async () => {
      const id = await insertContact(b.sql, { phone: '+18095550101', agent: seed.jenny.id })
      await b.sql`update public.contacts set is_responded = true, first_response_at = now() where id = ${id}`
      await b.sql`update public.contacts set agent_id = ${seed.joanny.id} where id = ${id}`
      expect(await contact(id)).toMatchObject({
        previous_agent_id: seed.jenny.id, is_responded: false, first_response_at: null,
      })
    })
  })

  describe('D16/D17: el cliente archivado que vuelve se desarchiva', () => {
    const archived = (extra: Parameters<typeof insertContact>[1]) =>
      insertContact(b.sql, { status: 'archived', archivedAt: null, agent: seed.jenny.id, ...extra })
    const unarchivedCount = async () => (await matchEvents(b.sql)).filter((e) => e.kind === 'unarchived').length

    it('encontrado por exacta (archivado como en prod: lead_status archived, archived_at NULL)', async () => {
      const id = await archived({ phone: '+18095550101' })
      const r = await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', rr: true })
      expect(r).toMatchObject({ outcome: 'found', matched_by: 'exact', contact_id: id })
      expect(await contact(id)).toMatchObject({ lead_status: 'new', archived_at: null })
      expect(await unarchivedCount()).toBe(1)
      expect(await countContacts(b.sql)).toBe(1)
    })

    it('encontrado por variante', async () => {
      const id = await archived({ phone: '655501234' })
      const r = await resolveContact(b.sql, AVA, { phone: '+34655501234', key: '34655501234', rr: true })
      expect(r).toMatchObject({ outcome: 'found', matched_by: 'variant', contact_id: id })
      expect(await contact(id)).toMatchObject({ lead_status: 'new', archived_at: null })
      expect(await unarchivedCount()).toBe(1)
      expect(await countContacts(b.sql)).toBe(1)
    })

    it('encontrado por meta_lead_id', async () => {
      const id = await archived({ phone: '+18095550188', meta: 'LEAD-9' })
      const r = await resolveContact(b.sql, SERVICE, { phone: null, key: null, meta: 'LEAD-9', rr: true })
      expect(r).toMatchObject({ outcome: 'found', matched_by: 'meta_lead_id', contact_id: id })
      expect(await contact(id)).toMatchObject({ lead_status: 'new', archived_at: null })
      expect(await unarchivedCount()).toBe(1)
      expect(await countContacts(b.sql)).toBe(1)
    })

    it('lead_status archived Y archived_at no nulo: los dos campos se limpian en el mismo UPDATE', async () => {
      const id = await archived({ phone: '+18095550101', archivedAt: new Date('2026-09-01') })
      await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', rr: true })
      expect(await contact(id)).toMatchObject({ lead_status: 'new', archived_at: null })
      expect(await unarchivedCount()).toBe(1)
    })

    it('archived_at no nulo con otro lead_status tambien cuenta como archivado', async () => {
      const id = await insertContact(b.sql, {
        phone: '+18095550101', status: 'contacted', archivedAt: new Date('2026-09-01'), agent: seed.jenny.id,
      })
      await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', rr: true })
      expect(await contact(id)).toMatchObject({ lead_status: 'new', archived_at: null })
      expect(await unarchivedCount()).toBe(1)
    })

    it('un contacto NO archivado no cambia ni genera evento', async () => {
      const id = await insertContact(b.sql, { phone: '+18095550101', status: 'contacted', agent: seed.jenny.id })
      await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', rr: true })
      expect((await contact(id)).lead_status).toBe('contacted')
      expect(await matchEvents(b.sql)).toHaveLength(0)
    })
  })

  describe('no_agent: round_robin_config sin agentes activos', () => {
    beforeEach(async () => { await setRrActive(b.sql, false) })

    it('llamada del CRM (p_create_without_agent = false): no_agent, 0 contactos y 1 evento', async () => {
      const r = await resolveContact(b.sql, SERVICE, { phone: '+18095550101', key: '18095550101', rr: true, noAgent: false })
      expect(r.outcome).toBe('no_agent')
      expect(r.contact_id).toBeNull()
      expect(await countContacts(b.sql)).toBe(0)
      const ev = await matchEvents(b.sql)
      expect(ev).toHaveLength(1)
      expect(ev[0]).toMatchObject({ kind: 'no_agent', caller: 'crm' })
    })

    it('llamada de Ava (p_create_without_agent = true): contacto sin agente, outcome no_agent y 1 evento', async () => {
      const r = await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', rr: true, noAgent: true })
      expect(r.outcome).toBe('no_agent')
      expect(r.contact_id).not.toBeNull()
      expect((await contact(r.contact_id!)).agent_id).toBeNull()
      expect(await countContacts(b.sql)).toBe(1)
      const ev = await matchEvents(b.sql)
      expect(ev).toHaveLength(1)
      expect(ev[0]).toMatchObject({ kind: 'no_agent', caller: 'ava' })
    })
  })
})
