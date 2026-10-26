// D01-P02 Tarea 3: processLead y POST /api/leads por resolve_contact, contra el Postgres embebido 17.6 con las
// migraciones reales (0034-0038) y el adaptador pg-db (subconjunto exacto de supabase-js, como service_role).
// Meta, Resend y after() van simulados: ningun mensaje sale de la maquina.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  pendingAfter: [] as Promise<unknown>[],
  emails: [] as { to: string; subject: string; text: string }[],
  db: null as unknown,
}))
vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => { h.pendingAfter.push(Promise.resolve().then(fn)) },
  NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
}))
vi.mock('@/lib/email', () => ({ sendAgentEmail: async (a: { to: string; subject: string; text: string }) => { h.emails.push(a); return true } }))
vi.mock('@/lib/supabase/admin', () => ({ adminClient: () => h.db }))

import {
  RUN, SERVICE, startBench, seedAgents, insertContact, countContacts, setRrActive, createIntakeDeal, matchEvents,
  type Bench, type Seed,
} from './helpers/bench'
import { pgDb } from './helpers/pg-db'
import { processLead, type LeadFormData } from '@/lib/meta-leads'
import { shouldAdvanceWatermark } from '@/lib/lead-poll-watermark'
import { toE164, keyFromE164 } from '@/lib/phone'
import { POST } from '@/app/api/leads/route'

type Db = Parameters<typeof processLead>[0]

const AGENT_PHONE = { jenny: '+18095550901', joanny: '+18095550902' }
const fetchMock = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async (url) =>
  String(url).endsWith('/messages')
    ? new Response(JSON.stringify({ messages: [{ id: `wamid.${Math.random().toString(36).slice(2)}` }] }), { status: 200 })
    : new Response('{}', { status: 404 }))
/** Plantillas enviadas a Graph: destinatario (solo digitos: el emisor manda "+1...", notifyLead y el camino viejo no) y nombre. */
const sends = () => fetchMock.mock.calls
  .filter(([u]) => String(u).endsWith('/messages'))
  .map(([, init]) => JSON.parse(String(init?.body)) as { to: string; template: { name: string } })
  .map((s) => ({ ...s, to: s.to.replace(/\D/g, '') }))
const settle = async () => { while (h.pendingAfter.length) await Promise.all(h.pendingAfter.splice(0)) }

let n = 0
const lead = (phone: string | null, o: Partial<LeadFormData> = {}): LeadFormData => ({
  id: `90000${++n}${Date.now() % 100000}`,
  form_id: 'form-1',
  created_time: new Date().toISOString(),
  field_data: [
    { name: 'full_name', values: ['Maria Perez'] },
    ...(phone === null ? [] : [{ name: 'phone_number', values: [phone] }]),
    { name: 'email', values: ['maria@lead.test'] },
  ],
  ...o,
})

describe.skipIf(!RUN)('processLead y api/leads por resolve_contact (Postgres embebido 17.6)', () => {
  let b: Bench
  let seed: Seed
  let db: ReturnType<typeof pgDb>
  const asDb = () => db as unknown as Db

  beforeAll(async () => { b = await startBench({ ingestTables: true }) })
  afterAll(async () => { await b?.stop() })
  beforeEach(async () => {
    seed = await seedAgents(b.sql)
    await b.sql`update public.agents set phone = ${AGENT_PHONE.jenny} where id = ${seed.jenny.id}`
    await b.sql`update public.agents set phone = ${AGENT_PHONE.joanny} where id = ${seed.joanny.id}`
    db = pgDb(b.sql)
    h.db = db
    h.pendingAfter.length = 0
    h.emails.length = 0
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('META_ACCESS_TOKEN', 'tok-banco')
    vi.stubEnv('META_PHONE_NUMBER_ID', '999')
    vi.stubEnv('META_LEAD_TEMPLATE_NAME', 'lead_tpl')
    vi.stubEnv('ADVANCE_CRM_API_KEY', 'k-banco')
  })

  const setFlag = () => b.sql`insert into public.agency_config (key, value) values ('agent_notify_queue_live', 'true')`
  const ledger = async (leadId: string) =>
    (await b.sql<{ outcome: string }[]>`select outcome from public.meta_lead_ingest where lead_id = ${leadId}`)[0]?.outcome
  const contactRow = async (id: string) =>
    (await b.sql`select phone, whatsapp_number, agent_id, meta_lead_id, source::text, email, first_name, last_name,
                        lead_form_answers is not null as answers from public.contacts where id = ${id}`)[0]
  const deals = () => b.sql<{ id: string; agent_id: string; contact_id: string; agent_notified_at: Date | null }[]>`
    select id, agent_id, contact_id, agent_notified_at from public.deals order by created_at`
  const queue = () => b.sql<{ status: string; wa_message_id: string | null }[]>`
    select status, wa_message_id from public.agent_lead_notifications order by id`
  const avaContact = async (phone: string, agent: string | null, clid: string | null = null) => {
    const id = await insertContact(b.sql, { phone, whatsapp: phone, agent, first: 'Maria' })
    await b.sql`update public.contacts set source = 'ctwa_ad', ctwa_clid = ${clid} where id = ${id}`
    return id
  }

  describe('Caso A (REQ 5): contacto de Ava 18095550101 y formulario 8095550101', () => {
    it('CONTROL NEGATIVO: la busqueda vieja (meta-leads.ts:562, phone exacto) no encuentra el contacto de Ava', async () => {
      await avaContact('18095550101', seed.joanny.id)
      expect(await b.sql`select id from public.contacts where phone = '8095550101'`).toHaveLength(0)
    })

    it('0 contactos nuevos, agente sin cambio, meta_lead_id reclamado, 1 deal y 1 fila de aviso; CAPI con el ctwa_clid', async () => {
      const ava = await avaContact('18095550101', seed.joanny.id, 'clid-A')
      const l = lead('8095550101')
      const r = await processLead(asDb(), l, 'Palmas de San Pedro')
      await settle()
      expect(r).toMatchObject({ reason: 'existing_contact_new_deal', contactId: ava, agentId: seed.joanny.id })
      expect(await countContacts(b.sql)).toBe(1)
      expect(await contactRow(ava)).toMatchObject({ agent_id: seed.joanny.id, meta_lead_id: l.id })
      const d = await deals()
      expect(d).toHaveLength(1)
      expect(d[0].agent_id).toBe(seed.joanny.id)
      expect((await queue()).map((q) => q.status)).toEqual(['skipped'])
      const [capi] = await b.sql`select payload, jsonb_typeof(payload) t from public.capi_outbox where deal_id = ${d[0].id}`
      expect(capi.t).toBe('object')
      expect(capi.payload.user_data.ctwa_clid).toBe('clid-A')
      expect(await ledger(l.id)).toBe('existing_contact_new_deal')
      // Un cliente encontrado (puede estar hablando con Ava) nunca recibe la plantilla al lead.
      expect(sends().filter((s) => s.template.name === 'lead_tpl')).toHaveLength(0)
    })
  })

  it('telefono "809 555 0101" en un lead nuevo -> contacto con +18095550101 y el resto de campos por id', async () => {
    const l = lead('809 555 0101')
    const r = await processLead(asDb(), l, 'Green Valley')
    await settle()
    expect(r.reason).toBe('new_contact')
    expect(await contactRow(r.contactId as string)).toMatchObject({
      phone: '+18095550101', whatsapp_number: '+18095550101', source: 'lead_form', meta_lead_id: l.id,
      email: 'maria@lead.test', first_name: 'Maria', last_name: 'Perez', answers: true,
    })
    expect([seed.jenny.id, seed.joanny.id]).toContain((await contactRow(r.contactId as string)).agent_id)
    const [lfa] = await b.sql`select jsonb_typeof(lead_form_answers) t, lead_form_answers->>'lead_id' lid from public.contacts where id = ${r.contactId}`
    expect(lfa).toEqual({ t: 'object', lid: l.id })
    // Contacto nuevo: la plantilla al lead sale a su numero, una vez.
    expect(sends().filter((s) => s.template.name === 'lead_tpl').map((s) => s.to)).toEqual(['18095550101'])
  })

  it('contacto de Ava SIN agente (creado antes del formulario) -> el formulario lo encuentra, asigna por RR, 1 deal y 1 aviso', async () => {
    const ava = await avaContact('18095550101', null)
    const r = await processLead(asDb(), lead('+1 809 555 0101'), 'Form')
    await settle()
    expect(r).toMatchObject({ reason: 'existing_contact_new_deal', contactId: ava })
    expect(await countContacts(b.sql)).toBe(1)
    const agent = (await contactRow(ava)).agent_id
    expect([seed.jenny.id, seed.joanny.id]).toContain(agent)
    expect((await deals()).map((d) => d.agent_id)).toEqual([agent])
    expect(await queue()).toHaveLength(1)
  })

  it('ambiguous -> 0 contactos, ledger ambiguous, 1 evento y ninguna plantilla', async () => {
    await insertContact(b.sql, { phone: '+543624123456', agent: seed.jenny.id })
    await insertContact(b.sql, { phone: '543624123456', agent: seed.joanny.id })
    expect(toE164('+5493624123456')).toBe('+5493624123456')
    const l = lead('+5493624123456')
    const r = await processLead(asDb(), l, 'Form')
    await settle()
    expect(r.reason).toBe('ambiguous')
    expect(await countContacts(b.sql)).toBe(2)
    expect(await ledger(l.id)).toBe('ambiguous')
    expect((await matchEvents(b.sql)).map((e) => e.kind)).toEqual(['ambiguous'])
    expect(sends()).toHaveLength(0)
    expect(await deals()).toHaveLength(0)
  })

  it('RPC con error -> processLead lanza (fail-closed), 0 contactos y ledger resolve_error', async () => {
    await b.sql.unsafe(`revoke execute on function public.resolve_contact(text, text, text, text, text, text, boolean, boolean) from service_role`)
    try {
      const l = lead('8095550101')
      await expect(processLead(asDb(), l, 'Form')).rejects.toThrow(/resolve_contact failed: 42501/)
      expect(await countContacts(b.sql)).toBe(0)
      expect(await ledger(l.id)).toBe('resolve_error')
    } finally {
      await b.sql.unsafe(`grant execute on function public.resolve_contact(text, text, text, text, text, text, boolean, boolean) to service_role`)
    }
  })

  it('22023 (argumentos rechazados) -> resolve_rejected sin lanzar: no clava el watermark', async () => {
    const reject = { ...db, rpc: (name: string, args?: Record<string, unknown>) =>
      name === 'resolve_contact' ? Promise.resolve({ data: null, error: { code: '22023', message: 'x' } }) : db.rpc(name, args) }
    const l = lead('8095550101')
    const r = await processLead(reject as unknown as Db, l, 'Form')
    expect(r.reason).toBe('resolve_rejected')
    expect(await ledger(l.id)).toBe('resolve_rejected')
  })

  it('no_agent (W6): sin RR no crea nada ni avanza el watermark; con un agente activo la pasada siguiente lo ingiere', async () => {
    await setRrActive(b.sql, false)
    const l = lead('8095550101')
    const r1 = await processLead(asDb(), l, 'Form')
    expect(r1.reason).toBe('no_agent')
    expect(await countContacts(b.sql)).toBe(0)
    expect(await ledger(l.id)).toBe('no_agent')
    expect(shouldAdvanceWatermark({ tokenOk: true, formsOk: true, graphErrors: 0, noAgent: 1 })).toBe(false)
    await setRrActive(b.sql, true)
    const r2 = await processLead(asDb(), l, 'Form')
    await settle()
    expect(r2.reason).toBe('new_contact')
    expect(await deals()).toHaveLength(1)
    expect(await queue()).toHaveLength(1)
  })

  it('dos leads distintos en paralelo con un solo agente activo -> los dos con agente, sin error', async () => {
    await b.sql`update public.round_robin_config set is_active = false where agent_id = ${seed.joanny.id}`
    const [r1, r2] = await Promise.all([processLead(asDb(), lead('8095550101'), 'F'), processLead(asDb(), lead('8095550102'), 'F')])
    await settle()
    expect([r1.reason, r2.reason]).toEqual(['new_contact', 'new_contact'])
    expect([r1.agentId, r2.agentId]).toEqual([seed.jenny.id, seed.jenny.id])
  })

  describe('contacto encontrado: el aviso lleva los datos del formulario actual', () => {
    const withBudget = (phone: string) => lead(phone, { field_data: [
      { name: 'full_name', values: ['Maria Perez'] }, { name: 'phone_number', values: [phone] },
      { name: 'email', values: ['maria@lead.test'] }, { name: 'presupuesto', values: ['50000 a 80000'] },
    ] })

    it('contacto de Ava sin email, presupuesto ni formulario -> se rellenan del lead y la plantilla del emisor los lleva', async () => {
      await setFlag()
      const ava = await avaContact('18095550101', seed.joanny.id)
      await processLead(asDb(), withBudget('8095550101'), 'Palmas de San Pedro')
      await settle()
      const [c] = await b.sql`select email, budget_min::float8 mn, budget_max::float8 mx, meta_form_name from public.contacts where id = ${ava}`
      expect(c).toEqual({ email: 'maria@lead.test', mn: 50000, mx: 80000, meta_form_name: 'Palmas de San Pedro' })
      const tpl = fetchMock.mock.calls.map(([, i]) => JSON.parse(String(i?.body)))
        .find((x) => x.template.name === 'ava_nuevo_lead_agente_v2')
      expect(tpl.template.components[0].parameters.map((p: { text: string }) => p.text).slice(1, 3))
        .toEqual(['Palmas de San Pedro', 'US$50k-80k'])
    })

    it('nunca pisa lo que el contacto ya tenia', async () => {
      const ava = await avaContact('18095550101', seed.joanny.id)
      await b.sql`update public.contacts set email = 'previo@test.local', budget_min = 1000000, meta_form_name = 'Otro' where id = ${ava}`
      await processLead(asDb(), withBudget('8095550101'), 'Palmas de San Pedro')
      const [c] = await b.sql`select email, budget_min::float8 mn, budget_max mx, meta_form_name from public.contacts where id = ${ava}`
      expect(c).toEqual({ email: 'previo@test.local', mn: 1000000, mx: null, meta_form_name: 'Otro' })
    })
  })

  it('falla el update de detalles del contacto nuevo -> lanza (details_error); la pasada siguiente los completa', async () => {
    let fails = 2
    const flaky = { ...db, from: (t: string) => {
      const real = db.from(t)
      if (t !== 'contacts') return real
      const update = real.update.bind(real)
      return Object.assign(real, { update: (p: Record<string, unknown>) => {
        if ('email' in p && fails-- > 0) return { eq: async () => ({ data: null, error: { code: '57014', message: 'x' } }) }
        return update(p)
      } })
    } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const l = lead('8095550101')
    await expect(processLead(flaky as unknown as Db, l, 'Form')).rejects.toThrow(/details/)
    expect(await ledger(l.id)).toBe('details_error')
    expect(await deals()).toHaveLength(0)
    const r = await processLead(asDb(), l, 'Form')
    await settle()
    expect(r.reason).toBe('existing_contact_new_deal')
    const [c] = await b.sql`select email, lead_form_answers is not null answers from public.contacts where id = ${r.contactId}`
    expect(c).toEqual({ email: 'maria@lead.test', answers: true })
    expect(await deals()).toHaveLength(1)
  })

  it('resolve_contact con un outcome desconocido -> resolve_error y lanza (no lo trata como found)', async () => {
    const weird = { ...db, rpc: (name: string, args?: Record<string, unknown>) => name === 'resolve_contact'
      ? Promise.resolve({ data: [{ outcome: 'merged', contact_id: '00000000-0000-0000-0000-000000000001', agent_id: seed.jenny.id, agent_assigned_now: false }], error: null })
      : db.rpc(name, args) }
    const l = lead('8095550101')
    await expect(processLead(weird as unknown as Db, l, 'Form')).rejects.toThrow(/resolve_contact/)
    expect(await ledger(l.id)).toBe('resolve_error')
    expect(await deals()).toHaveLength(0)
  })

  it("lectura del estado del aviso que falla una vez -> se reintenta y una fila 'skipped' sigue por el camino viejo", async () => {
    let failOnce = true
    const flaky = { ...db, from: (t: string) => {
      if (t === 'agent_lead_notifications' && failOnce) {
        failOnce = false
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '57014', message: 'x' } }) }) }) }
      }
      return db.from(t)
    } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await processLead(flaky as unknown as Db, lead('8095550101'), 'Form')
    await settle()
    expect(sends().filter((s) => s.template.name === 'ava_nuevo_lead_agente_v2')).toHaveLength(1)
  })

  describe('un solo emisor por deal (bandera agent_notify_queue_live)', () => {
    it("fila 'pending' -> la envia el emisor via after(): 1 plantilla al agente, 'sent' con wa_message_id y agent_notified_at", async () => {
      await setFlag()
      const r = await processLead(asDb(), lead('8095550101'), 'Form')
      await settle()
      const agentDigits = (r.agentId === seed.jenny.id ? AGENT_PHONE.jenny : AGENT_PHONE.joanny).replace(/\D/g, '')
      expect(sends().filter((s) => s.to === agentDigits && s.template.name === 'ava_nuevo_lead_agente_v2')).toHaveLength(1)
      const [row] = await queue()
      expect(row.status).toBe('sent')
      expect(row.wa_message_id).toMatch(/^wamid\./)
      expect((await deals())[0].agent_notified_at).not.toBeNull()
      expect(h.emails).toHaveLength(1)
    })

    it("el cron reclama la fila entre create_intake_deal y la lectura del estado -> processLead NO usa notifyAgent (sin doble aviso)", async () => {
      await setFlag()
      // El "cron" reclama la fila justo despues de que nace, antes de que processLead lea su estado ('sending').
      const racing = { ...db, rpc: async (name: string, args?: Record<string, unknown>) => {
        const res = await db.rpc(name, args)
        if (name === 'create_intake_deal' && res.data) await db.rpc('claim_agent_lead_notifications', { p_limit: 10 })
        return res
      } }
      await processLead(racing as unknown as Db, lead('8095550101'), 'Form')
      await settle()
      // La fila es del cron (que la enviara); processLead no manda nada por el camino viejo. (La plantilla al lead
      // nuevo, notifyLead, si sale: no es el aviso al agente.)
      expect(sends().filter((s) => s.template.name === 'ava_nuevo_lead_agente_v2')).toHaveLength(0)
      expect((await queue()).map((q) => q.status)).toEqual(['sending'])
    })

    it("fila 'skipped' -> solo el camino anterior (notifyAgent): 1 plantilla y la fila sigue 'skipped' sin reclamar", async () => {
      const r = await processLead(asDb(), lead('8095550101'), 'Form')
      await settle()
      const agentDigits = (r.agentId === seed.jenny.id ? AGENT_PHONE.jenny : AGENT_PHONE.joanny).replace(/\D/g, '')
      expect(sends().filter((s) => s.to === agentDigits)).toHaveLength(1)
      expect((await queue()).map((q) => q.status)).toEqual(['skipped'])
      expect(db.rpcCalls.filter((c) => c.name === 'claim_agent_lead_notifications')).toHaveLength(0)
    })
  })

  describe('D13: cliente con deal de intake abierto', () => {
    it('nota "Lleno el formulario: <form>", sin deal nuevo, sin plantilla y sin gastar turno de RR', async () => {
      const c = await avaContact('18095550101', seed.admin.id)
      const deal = await createIntakeDeal(b.sql, SERVICE, c, seed.admin.id)
      const before = (await queue()).length
      const l = lead('8095550101')
      const r = await processLead(asDb(), l, 'Palmas de San Pedro')
      await settle()
      expect(r.reason).toBe('already_in_pipeline')
      expect((await deals()).map((d) => d.id)).toEqual([deal])
      expect((await queue()).length).toBe(before)
      expect(sends()).toHaveLength(0)
      const notes = await b.sql`select description, is_automated from public.activities where deal_id = ${deal} and activity_type = 'note'`
      expect(notes).toMatchObject([{ description: 'Lleno el formulario: Palmas de San Pedro', is_automated: true }])
      // Policy C no se llega a ejecutar: el admin no esta en el RR y aun asi no se pide agente.
      expect(db.rpcCalls.map((c) => c.name)).not.toContain('assign_next_rr_agent')
    })

    it('contacto sin agente cuyo deal abierto pasa al agente del RR -> nota + campanita client_returned, sin plantilla', async () => {
      const c = await avaContact('18095550101', null)
      const deal = await createIntakeDeal(b.sql, SERVICE, c, seed.admin.id)
      const r = await processLead(asDb(), lead('8095550101'), 'Form')
      await settle()
      expect(r.reason).toBe('already_in_pipeline')
      const owner = (await contactRow(c)).agent_id
      expect([seed.jenny.id, seed.joanny.id]).toContain(owner)
      expect((await deals()).find((d) => d.id === deal)?.agent_id).toBe(owner)
      expect(await b.sql`select 1 from public.notifications where user_id = ${owner} and type = 'client_returned'`).toHaveLength(1)
      expect(sends()).toHaveLength(0)
    })
  })

  it('create_intake_deal con error -> lanza con ledger deal_error; la pasada siguiente crea el deal', async () => {
    await b.sql.unsafe(`revoke execute on function public.create_intake_deal(uuid, uuid) from service_role`)
    const l = lead('8095550101')
    try {
      await expect(processLead(asDb(), l, 'Form')).rejects.toThrow(/create_intake_deal failed/)
      expect(await ledger(l.id)).toBe('deal_error')
      expect(await deals()).toHaveLength(0)
    } finally {
      await b.sql.unsafe(`grant execute on function public.create_intake_deal(uuid, uuid) to service_role`)
    }
    const r = await processLead(asDb(), l, 'Form')
    await settle()
    expect(r.reason).toBe('existing_contact_new_deal')
    expect(await deals()).toHaveLength(1)
    expect(await countContacts(b.sql)).toBe(1)
  })

  it('la clave TS (keyFromE164(toE164(x))) es exactamente phone_key de la BD', async () => {
    const raws = ['809 555 0101', '(829) 555-0101', '+34612345678', '+1 305 555 0101', '888 888 8888', '+5493624123456',
      '+525512345678', '+33 3 33 33 33 33', '+7 777 777 7777', '1234567890', '612345678', '+44 20 7946 0958']
    for (const raw of raws) {
      const e164 = toE164(raw)
      const [row] = await b.sql<{ k: string | null }[]>`select public.phone_key(${e164}) k`
      expect({ raw, key: keyFromE164(e164) }).toEqual({ raw, key: row.k })
    }
  })

  describe('POST /api/leads', () => {
    const post = (body: unknown) => POST(new Request('https://crm.test/api/leads', {
      method: 'POST', headers: { authorization: 'Bearer k-banco', 'content-type': 'application/json' }, body: JSON.stringify(body),
    }) as never)

    it('telefono valido de un contacto existente (otro formato) -> 200 con su id, sin tocar el agente', async () => {
      const c = await insertContact(b.sql, { phone: '+18095550101', agent: seed.jenny.id })
      const res = await post({ name: 'Ana Lopez', phone: '809-555-0101' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, id: c })
      expect((await contactRow(c)).agent_id).toBe(seed.jenny.id)
      expect(await countContacts(b.sql)).toBe(1)
    })

    it('nuevo -> 201 y source_detail/agent_notes por id; sin agente (no hay RR en esta ruta)', async () => {
      const res = await post({ name: 'Ana Lopez', phone: '809 555 0101', source: 'amh', notes: 'nota' })
      expect(res.status).toBe(201)
      const { id } = await res.json() as { id: string }
      const [row] = await b.sql`select phone, source::text, source_detail, agent_notes, agent_id from public.contacts where id = ${id}`
      expect(row).toMatchObject({ phone: '+18095550101', source: 'social_media', source_detail: 'amh', agent_notes: 'nota', agent_id: null })
    })

    it('ambiguous -> 409 {ok:false, error:"ambiguous"} y nada creado', async () => {
      await insertContact(b.sql, { phone: '+543624123456' })
      await insertContact(b.sql, { phone: '543624123456' })
      const res = await post({ name: 'Ana', phone: '+5493624123456' })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ ok: false, error: 'ambiguous' })
      expect(await countContacts(b.sql)).toBe(2)
    })

    it('telefono invalido -> se crea sin telefono (R8) y la respuesta lo dice', async () => {
      const res = await post({ name: 'Ana', phone: '[numero de contacto del cliente]' })
      expect(res.status).toBe(201)
      const body = await res.json() as { id: string; phone_invalid?: boolean }
      expect(body.phone_invalid).toBe(true)
      expect((await contactRow(body.id)).phone).toBeNull()
    })

    it('22023 de la RPC (argumentos rechazados) -> 422, no 500 (el integrador no debe reintentar en bucle)', async () => {
      h.db = { ...db, rpc: () => Promise.resolve({ data: null, error: { code: '22023', message: 'x' } }) }
      const res = await post({ name: 'Ana', phone: '809 555 0101' })
      expect(res.status).toBe(422)
    })
  })
})
