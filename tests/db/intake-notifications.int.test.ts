// D01-P01 Tarea 1: cola agent_lead_notifications (0036), resolve_deal_agent (0035), record_campaign_return,
// record_preferred_contact_time (D14) y notify_agent_client_returned (D19) (migraciones 0035 y 0036).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  RUN, AVA, SERVICE, backendPid, waitPidBlocked, startBench, seedAgents, insertContact, createIntakeDeal, asRole, codeOf, setRrActive,
  type Bench, type Seed, type Identity,
} from './helpers/bench'

describe.skipIf(!RUN)('avisos, hora preferida y cliente que vuelve (Postgres embebido 17.6)', () => {
  let b: Bench
  let seed: Seed

  beforeAll(async () => { b = await startBench() })
  afterAll(async () => { await b?.stop() })
  beforeEach(async () => { seed = await seedAgents(b.sql) })

  const setFlag = (v: string) =>
    b.sql`insert into public.agency_config (key, value) values ('agent_notify_queue_live', ${v})`

  /** Contacto de Maria con deal de intake abierto del agente (por create_intake_deal real). */
  async function withDeal(phone: string, agent = seed.jenny.id, first: string | null = 'Maria') {
    const contact = await insertContact(b.sql, { phone, agent, first })
    const deal = await createIntakeDeal(b.sql, SERVICE, contact, agent)
    if (!deal) throw new Error('create_intake_deal no devolvio deal')
    return { contact, deal }
  }
  const call = <T>(who: Identity, text: string, params: unknown[]) =>
    asRole(b.sql, who, async (t) => (await t.unsafe(text, params as never[]))[0] as unknown as T)
  const countRows = async (table: string, where = 'true') =>
    (await b.sql.unsafe(`select count(*)::int n from public.${table} where ${where}`))[0].n as number
  const queueRows = () => countRows('agent_lead_notifications')

  describe('create_intake_deal: fila de aviso', () => {
    it('sin la bandera agent_notify_queue_live la fila queda skipped', async () => {
      const { deal } = await withDeal('+18095550101')
      expect(await b.sql`select status from public.agent_lead_notifications where deal_id = ${deal}`).toMatchObject([{ status: 'skipped' }])
    })

    it('con la bandera "true" la fila queda pending', async () => {
      await setFlag('true')
      const { deal } = await withDeal('+18095550101')
      expect(await b.sql`select status from public.agent_lead_notifications where deal_id = ${deal}`).toMatchObject([{ status: 'pending' }])
    })

    it('segunda llamada del mismo contacto: devuelve null y sigue 1 fila', async () => {
      const { contact } = await withDeal('+18095550101')
      expect(await createIntakeDeal(b.sql, SERVICE, contact, seed.jenny.id)).toBeNull()
      expect(await queueRows()).toBe(1)
    })
  })

  describe('claim con sesiones reales (SKIP LOCKED)', () => {
    const CLAIM = `select id from public.claim_agent_lead_notifications(1)`
    // Misma sentencia de claim pero con la subconsulta SIN clausula de bloqueo, y con FOR UPDATE a secas.
    const stmt = (lock: string) => `
      update public.agent_lead_notifications
         set status = 'sending', attempts = attempts + 1, claimed_at = now()
       where id in (select id from public.agent_lead_notifications
                     where (status in ('pending','failed') and next_attempt_at <= now())
                        or (status = 'sending' and claimed_at < now() - interval '5 minutes')
                     order by created_at limit 1 ${lock})
       returning id`

    async function twoRows() {
      await setFlag('true')
      await withDeal('+18095550101')
      await withDeal('+18095550102', seed.joanny.id)
      expect(await countRows('agent_lead_notifications', `status = 'pending'`)).toBe(2)
    }

    // La primera sesion ejecuta `first` y NO confirma hasta release(); devuelve sus filas. Si falla, propaga el error real.
    async function holdFirst(first: string, asService: boolean) {
      let release!: () => void
      const gate = new Promise<void>((r) => { release = r })
      let ready!: (rows: Array<{ id: string }>) => void
      const got = new Promise<Array<{ id: string }>>((r) => { ready = r })
      const conn = b.connect()
      const done = conn.begin(async (t) => {
        if (asService) {
          await t.unsafe('set local role service_role')
          await t`select set_config('request.jwt.claims', ${JSON.stringify(SERVICE.claims)}, true)`
        }
        ready((await t.unsafe(first)) as unknown as Array<{ id: string }>)
        await gate
      })
      const rows = await Promise.race([got, done.then(() => { throw new Error('la primera sesion termino sin devolver filas') })])
      return { rows, release: async () => { release(); await done } }
    }

    it('dos sesiones reciben filas distintas (claim real)', async () => {
      await twoRows()
      const h = await holdFirst(CLAIM, true)
      try {
        const second = await asRole(b.connect(), SERVICE, (t) => t.unsafe(CLAIM)) as unknown as Array<{ id: string }>
        expect(h.rows).toHaveLength(1)
        expect(second).toHaveLength(1)
        expect(second[0].id).not.toBe(h.rows[0].id)
      } finally {
        await h.release()
      }
    })

    it('CONTROL NEGATIVO 1 (W3): sin clausula de bloqueo la MISMA fila sale en las dos sesiones', async () => {
      await twoRows()
      const h = await holdFirst(stmt(''), false)
      try {
        const conn = b.connect()
        const pid = await backendPid(conn)
        const second = (conn.begin((t) => t.unsafe(stmt(''))) as unknown as Promise<Array<{ id: string }>>)
          .then((v) => ({ v }), (e: unknown) => ({ e }))
        // La segunda espera de verdad la fila bloqueada por la primera (se mide en pg_locks, no con un sleep).
        expect(await waitPidBlocked(b.sql, pid)).toBe(true)
        await h.release()
        const out = await second
        expect('e' in out ? String((out as { e: unknown }).e) : '').toBe('')
        expect((out as { v: Array<{ id: string }> }).v[0].id).toBe(h.rows[0].id)
      } finally {
        await h.release().catch(() => {})
      }
    })

    it('CONTROL NEGATIVO 2: con FOR UPDATE sin SKIP LOCKED la segunda sesion se bloquea (55P03)', async () => {
      await twoRows()
      const h = await holdFirst(stmt('for update'), false)
      try {
        const code = await codeOf(b.connect().begin(async (t) => {
          await t.unsafe(`set local lock_timeout = '500ms'`)
          return t.unsafe(stmt('for update'))
        }))
        expect(code).toBe('55P03')
      } finally {
        await h.release()
      }
    })
  })

  describe('mark_agent_lead_notification', () => {
    const claim = async () => {
      const rows = await asRole(b.sql, SERVICE, (t) => t`select * from public.claim_agent_lead_notifications(10)`)
      return rows as unknown as Array<{ id: string; attempts: number }>
    }
    const mark = (id: string, ok: boolean, err: string | null = null, email = false) =>
      call<{ r: boolean }>(SERVICE, `select public.mark_agent_lead_notification($1::bigint, $2::boolean, $3::text, $4::text, $5::uuid, $6::boolean) r`,
        [id, ok, err, ok ? 'wamid.TEST1' : null, seed.jenny.id, email])

    beforeEach(async () => { await setFlag('true') })

    it('ok: status sent, wa_message_id, agente notificado y deals.agent_notified_at relleno', async () => {
      const { deal } = await withDeal('+18095550101')
      const [row] = await claim()
      expect((await mark(row.id, true, null, true)).r).toBe(true)
      const [n] = await b.sql`select * from public.agent_lead_notifications where deal_id = ${deal}`
      expect(n).toMatchObject({ status: 'sent', wa_message_id: 'wamid.TEST1', notified_agent_id: seed.jenny.id })
      expect(n.sent_at).not.toBeNull()
      expect(n.email_sent_at).not.toBeNull()
      const [d] = await b.sql`select agent_notified_at from public.deals where id = ${deal}`
      expect(d.agent_notified_at).not.toBeNull()
    })

    it('fallo: status failed con next_attempt_at futuro y last_error recortado a 300', async () => {
      const { deal } = await withDeal('+18095550101')
      const [row] = await claim()
      await mark(row.id, false, 'x'.repeat(500))
      const [n] = await b.sql`select status, next_attempt_at > now() as future, length(last_error) as len
                               from public.agent_lead_notifications where deal_id = ${deal}`
      expect(n).toMatchObject({ status: 'failed', future: true, len: 300 })
    })

    it('al 5o fallo pasa a dead (antes sigue failed)', async () => {
      const { deal } = await withDeal('+18095550101')
      for (let i = 1; i <= 5; i++) {
        await b.sql`update public.agent_lead_notifications set next_attempt_at = now() where deal_id = ${deal}`
        const [row] = await claim()
        expect(Number(row.attempts)).toBe(i)
        await mark(row.id, false, `fallo ${i}`)
        const [n] = await b.sql`select status from public.agent_lead_notifications where deal_id = ${deal}`
        expect(n.status).toBe(i < 5 ? 'failed' : 'dead')
      }
    })

    it('una fila que no esta en sending devuelve false y no cambia', async () => {
      const { deal } = await withDeal('+18095550101')
      const [n0] = await b.sql`select id from public.agent_lead_notifications where deal_id = ${deal}`
      expect((await mark(n0.id, true)).r).toBe(false)
      expect((await b.sql`select status from public.agent_lead_notifications where deal_id = ${deal}`)[0].status).toBe('pending')
    })
  })

  describe('resolve_deal_agent (W4)', () => {
    const rrPointer = () => b.sql`select id, updated_at from public.round_robin_config order by id`
    const resolve = (agent: string) => call<{ r: string | null }>(AVA, `select public.resolve_deal_agent($1::uuid) r`, [agent])

    it('agente con fila activa en RR: el mismo agente y el puntero no se mueve', async () => {
      const before = await rrPointer()
      expect((await resolve(seed.jenny.id)).r).toBe(seed.jenny.id)
      expect(await rrPointer()).toEqual(before)
    })

    it('agente sin fila activa en RR: un agente de RR', async () => {
      const r = (await resolve(seed.admin.id)).r
      expect([seed.jenny.id, seed.joanny.id]).toContain(r)
    })

    it('sin agentes activos: null', async () => {
      await setRrActive(b.sql, false)
      expect((await resolve(seed.jenny.id)).r).toBeNull()
    })
  })

  describe('record_campaign_return (W4)', () => {
    const record = (contact: string, note: string) =>
      call<{ r: string | null }>(AVA, `select public.record_campaign_return($1::uuid, $2::text) r`, [contact, note])
    const notes = (contact: string) =>
      b.sql`select * from public.activities where contact_id = ${contact} and activity_type = 'note' order by created_at`

    it('con deal de intake abierto: 1 nota con deal, contacto, agente del deal y texto sin caracteres de control', async () => {
      const { contact, deal } = await withDeal('+18095550101')
      const r = await record(contact, 'Hola\nquiero\u0007info')
      expect(r.r).not.toBeNull()
      const rows = await notes(contact)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        deal_id: deal, contact_id: contact, agent_id: seed.jenny.id, is_automated: true,
        title: 'Volvio por campana', description: 'Hola quiero info',
      })
    })

    it('la nota de campana (is_automated true) NO marca al contacto como respondido', async () => {
      const { contact } = await withDeal('+18095550101')
      await record(contact, 'Volvio por el anuncio')
      const [c] = await b.sql`select is_responded, first_response_at from public.contacts where id = ${contact}`
      expect(c).toMatchObject({ is_responded: false, first_response_at: null })
    })

    it('el texto se recorta a 300 caracteres', async () => {
      const { contact } = await withDeal('+18095550101')
      await record(contact, 'a'.repeat(400))
      expect((await notes(contact))[0].description).toHaveLength(300)
    })

    it('la misma nota a los 2 minutos no crea otra; a los 11 minutos si; otra nota si', async () => {
      const { contact } = await withDeal('+18095550101')
      await record(contact, 'misma nota')
      await b.sql`update public.activities set created_at = now() - interval '2 minutes' where contact_id = ${contact}`
      await record(contact, 'misma nota')
      expect(await notes(contact)).toHaveLength(1)
      await record(contact, 'otra nota')
      expect(await notes(contact)).toHaveLength(2)
      await b.sql`update public.activities set created_at = now() - interval '11 minutes' where contact_id = ${contact}`
      await record(contact, 'misma nota')
      expect(await notes(contact)).toHaveLength(3)
    })

    it('sin deal abierto: null y 0 actividades', async () => {
      const contact = await insertContact(b.sql, { phone: '+18095550101', agent: seed.jenny.id })
      expect((await record(contact, 'hola')).r).toBeNull()
      expect(await notes(contact)).toHaveLength(0)
    })
  })

  describe('record_preferred_contact_time (D14)', () => {
    const record = (contact: string, text: string) =>
      call<{ r: string | null }>(AVA, `select public.record_preferred_contact_time($1::uuid, $2::text) r`, [contact, text])
    const bell = (deal: string) =>
      b.sql`select * from public.notifications where type = 'preferred_contact_time' and link = ${'/dashboard/pipeline/' + deal}`

    it('con deal de intake abierto: guarda en contacto y deal, 1 campanita al agente y 1 fila para el correo', async () => {
      const { contact, deal } = await withDeal('+18095550101')
      const queueBefore = await queueRows()
      const r = await record(contact, '  Despues de las 6pm\n ')
      expect(r.r).toBe(deal)
      expect((await b.sql`select preferred_contact_time t from public.contacts where id = ${contact}`)[0].t).toBe('Despues de las 6pm')
      expect((await b.sql`select preferred_contact_time t from public.deals where id = ${deal}`)[0].t).toBe('Despues de las 6pm')
      const bells = await bell(deal)
      expect(bells).toHaveLength(1)
      expect(bells[0]).toMatchObject({
        user_id: seed.jenny.id, type: 'preferred_contact_time', title: 'Hora preferida de Maria: Despues de las 6pm',
      })
      const mail = await b.sql`select * from public.agent_time_notifications where deal_id = ${deal}`
      expect(mail).toHaveLength(1)
      expect(mail[0]).toMatchObject({ preferred_contact_time: 'Despues de las 6pm', email_sent_at: null })
      expect(await queueRows()).toBe(queueBefore) // D14: ninguna plantilla
    })

    it('el mismo texto otra vez: null y 0 filas nuevas', async () => {
      const { contact, deal } = await withDeal('+18095550101')
      await record(contact, 'Despues de las 6pm')
      expect((await record(contact, 'Despues de las 6pm')).r).toBeNull()
      expect(await bell(deal)).toHaveLength(1)
      expect(await countRows('agent_time_notifications')).toBe(1)
    })

    it('sin deal abierto: solo el contacto, 0 notificaciones', async () => {
      const contact = await insertContact(b.sql, { phone: '+18095550101', agent: seed.jenny.id, first: 'Maria' })
      const r = await record(contact, 'Por la tarde')
      expect(r.r).toBeNull()
      expect((await b.sql`select preferred_contact_time t from public.contacts where id = ${contact}`)[0].t).toBe('Por la tarde')
      expect(await countRows('notifications', `type = 'preferred_contact_time'`)).toBe(0)
      expect(await countRows('agent_time_notifications')).toBe(0)
    })

    it('texto vacio tras limpiar: 22023', async () => {
      const { contact } = await withDeal('+18095550101')
      expect(await codeOf(record(contact, ' \n\t '))).toBe('22023')
    })
  })

  describe('notify_agent_client_returned (D19)', () => {
    const notify = (contact: string) =>
      call<{ r: string | null }>(AVA, `select public.notify_agent_client_returned($1::uuid) r`, [contact])
    const bells = (deal: string) =>
      b.sql`select * from public.notifications where type = 'client_returned' and link = ${'/dashboard/pipeline/' + deal} order by created_at`

    it('deal de 10 dias: 1 campanita al dueno; 1 h despues 0 nuevas; a las 25 h 1 nueva; sin plantilla', async () => {
      const { contact, deal } = await withDeal('+18095550101')
      await b.sql`update public.deals set created_at = now() - interval '10 days' where id = ${deal}`
      const queueBefore = await queueRows()

      const first = await notify(contact)
      expect(first.r).not.toBeNull()
      let rows = await bells(deal)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        user_id: seed.jenny.id, type: 'client_returned', title: 'Tu cliente Maria volvio a escribir',
        link: `/dashboard/pipeline/${deal}`,
      })

      await b.sql`update public.notifications set created_at = now() - interval '1 hour' where type = 'client_returned'`
      expect((await notify(contact)).r).toBeNull()
      expect(await bells(deal)).toHaveLength(1)

      await b.sql`update public.notifications set created_at = now() - interval '25 hours' where type = 'client_returned'`
      expect((await notify(contact)).r).not.toBeNull()
      rows = await bells(deal)
      expect(rows).toHaveLength(2)
      expect(await queueRows()).toBe(queueBefore)
    })

    it('sin deal abierto: null y 0 filas', async () => {
      const contact = await insertContact(b.sql, { phone: '+18095550101', agent: seed.jenny.id, first: 'Maria' })
      expect((await notify(contact)).r).toBeNull()
      expect(await countRows('notifications', `type = 'client_returned'`)).toBe(0)
    })
  })
})
