// D01-P01: pruebas de reproduccion de los hallazgos de la revision (R1-R12). Cada una describe el comportamiento
// ESPERADO despues del arreglo del SQL; contra el SQL anterior al arreglo fallan. Los nombres llevan el codigo R<n>.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  RUN, AVA, SERVICE, MIGRATIONS, startBench, seedAgents, insertContact, createIntakeDeal, resolveContact, asRole,
  codeOf, matchEvents, backendPid, waitPidBlocked, readSql, migrationPath, type Bench, type Seed,
} from './helpers/bench'

describe.skipIf(!RUN)('hallazgos de la revision (Postgres embebido 17.6)', () => {
  let b: Bench
  let seed: Seed
  let n = 0

  beforeAll(async () => { b = await startBench() })
  afterAll(async () => { await b?.stop() })
  beforeEach(async () => { seed = await seedAgents(b.sql); n = 0 })

  const phone = () => `+1809555${String(4000 + ++n)}`
  const keyOf = (p: string) => p.slice(1)
  const countContacts = async () => (await b.sql`select 1 from public.contacts`).length
  const pointer = () => b.sql`select id, updated_at from public.round_robin_config order by id`
  const call = <T>(sqlText: string, params: unknown[]) =>
    asRole(b.sql, SERVICE, async (t) => (await t.unsafe(sqlText, params as never[]))[0] as unknown as T)
  const mark = (id: string, ok: boolean, err: string | null) =>
    call<{ r: boolean }>(
      'select public.mark_agent_lead_notification($1::bigint, $2::boolean, $3::text, $4::text, $5::uuid, $6::boolean) r',
      [id, ok, err, null, seed.jenny.id, false])
  async function queueRow(): Promise<string> {
    const p = phone()
    const contact = await insertContact(b.sql, { phone: p, agent: seed.jenny.id, first: 'Maria' })
    const deal = await createIntakeDeal(b.sql, SERVICE, contact, seed.jenny.id)
    const [r] = await b.sql`select id from public.agent_lead_notifications where deal_id = ${deal}`
    return String(r.id)
  }

  it('R1: el camino 23505 ejecuta el paso (7): desarchiva y asigna RR al contacto que la otra sesion acaba de crear', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    let ready!: (id: string) => void
    const inserted = new Promise<string>((r) => { ready = r })
    const uiTx = b.connect().begin(async (t) => {
      const [{ id }] = await t<{ id: string }[]>`
        insert into public.contacts (phone, whatsapp_number, agent_id, lead_status)
        values ('+18095550199', '+18095550199', null, 'archived') returning id`
      ready(id)
      await gate
    })
    const otherId = await Promise.race([inserted, uiTx.then(() => '')])
    const workerConn = b.connect()
    const pid = await backendPid(workerConn)
    const pending = resolveContact(workerConn, AVA, { phone: '+18095550199', key: '18095550199', rr: true })
      .then((v) => ({ v }), (e: unknown) => ({ e }))
    try {
      expect(await waitPidBlocked(b.sql, pid, 3000)).toBe(true)
    } finally {
      release()
      await uiTx
    }
    const out = await pending
    expect('e' in out ? String(out.e) : '').toBe('')
    const r = (out as { v: Awaited<ReturnType<typeof resolveContact>> }).v
    expect(r).toMatchObject({ outcome: 'found', contact_id: otherId, agent_assigned_now: true })
    expect(r.agent_id).not.toBeNull()
    const [c] = await b.sql`select agent_id, lead_status, archived_at from public.contacts where id = ${otherId}`
    expect(c).toMatchObject({ agent_id: r.agent_id, lead_status: 'new', archived_at: null })
    expect((await matchEvents(b.sql)).filter((e) => e.kind === 'unarchived')).toHaveLength(1)
  })

  describe('R2: contacto sin agente pero con deal de intake abierto', () => {
    it('conserva al dueno del deal (Joanny, activa en RR) aunque RR elegiria a Jenny; el puntero no se mueve', async () => {
      for (let i = 0; i < 3; i++) await insertContact(b.sql, { phone: phone(), agent: seed.joanny.id })
      const p = phone()
      const contact = await insertContact(b.sql, { phone: p })
      const [deal] = await b.sql`
        insert into public.deals (contact_id, agent_id, stage) values (${contact}, ${seed.joanny.id}, 'nuevo_sin_contactar') returning id`
      const before = await pointer()
      const r = await resolveContact(b.sql, AVA, { phone: p, key: keyOf(p), rr: true })
      expect(r).toMatchObject({ outcome: 'found', contact_id: contact, agent_id: seed.joanny.id, agent_assigned_now: true })
      expect((await b.sql`select agent_id from public.contacts where id = ${contact}`)[0].agent_id).toBe(seed.joanny.id)
      expect((await b.sql`select agent_id from public.deals where id = ${deal.id}`)[0].agent_id).toBe(seed.joanny.id)
      expect(await pointer()).toEqual(before)
    })

    it('dueno del deal fuera de RR (admin): se asigna un agente de RR y el deal abierto lo sigue (Policy C)', async () => {
      const p = phone()
      const contact = await insertContact(b.sql, { phone: p })
      const [deal] = await b.sql`
        insert into public.deals (contact_id, agent_id, stage) values (${contact}, ${seed.admin.id}, 'nuevo_sin_contactar') returning id`
      const r = await resolveContact(b.sql, AVA, { phone: p, key: keyOf(p), rr: true })
      expect([seed.jenny.id, seed.joanny.id]).toContain(r.agent_id)
      expect(r.agent_assigned_now).toBe(true)
      expect((await b.sql`select agent_id from public.deals where id = ${deal.id}`)[0].agent_id).toBe(r.agent_id)
    })
  })

  it('R3: un telefono valido debe venir con su clave: p_key nulo + p_meta_lead_id da 22023 y no crea nada', async () => {
    const code = await codeOf(resolveContact(b.sql, SERVICE, { phone: '+18095550101', key: null, meta: 'L-X', rr: true }))
    expect(code).toBe('22023')
    expect(await countContacts()).toBe(0)
  })

  it('R4: p_source fuera del enum da 22023 (no 22P02) y no crea nada', async () => {
    const p = phone()
    const code = await codeOf(resolveContact(b.sql, AVA, { phone: p, key: keyOf(p), source: 'no_existe', rr: true }))
    expect(code).toBe('22023')
    expect(await countContacts()).toBe(0)
  })

  describe('R5: los eventos se deduplican en 24 h por clase y contacto', () => {
    it('dup_group: dos llamadas -> 1 evento', async () => {
      await insertContact(b.sql, { phone: '+18095550101', agent: seed.jenny.id, createdAt: new Date('2026-01-01') })
      await insertContact(b.sql, { phone: '8095550101', agent: seed.joanny.id, createdAt: new Date('2026-06-01') })
      for (let i = 0; i < 2; i++) await resolveContact(b.sql, AVA, { phone: '+18095550101', key: '18095550101', rr: true })
      expect((await matchEvents(b.sql)).filter((e) => e.kind === 'dup_group')).toHaveLength(1)
    })

    it('variant: dos llamadas -> 1 evento', async () => {
      await insertContact(b.sql, { phone: '655501234', agent: seed.jenny.id })
      for (let i = 0; i < 2; i++) await resolveContact(b.sql, AVA, { phone: '+34655501234', key: '34655501234', rr: true })
      expect((await matchEvents(b.sql)).filter((e) => e.kind === 'variant')).toHaveLength(1)
    })
  })

  it('R6: la hora preferida pedida antes del deal se avisa cuando el deal existe (una sola vez)', async () => {
    const contact = await insertContact(b.sql, { phone: phone(), agent: seed.jenny.id, first: 'Maria' })
    const record = () => call<{ r: string | null }>('select public.record_preferred_contact_time($1::uuid, $2::text) r', [contact, '10am'])
    const bells = () => b.sql`select 1 from public.notifications where type = 'preferred_contact_time'`
    const mail = () => b.sql`select 1 from public.agent_time_notifications`

    expect((await record()).r).toBeNull()
    expect((await b.sql`select preferred_contact_time t from public.contacts where id = ${contact}`)[0].t).toBe('10am')
    expect(await bells()).toHaveLength(0)

    const deal = await createIntakeDeal(b.sql, SERVICE, contact, seed.jenny.id)
    expect((await record()).r).toBe(deal)
    expect((await b.sql`select preferred_contact_time t from public.deals where id = ${deal}`)[0].t).toBe('10am')
    expect(await bells()).toHaveLength(1)
    expect(await mail()).toHaveLength(1)

    expect((await record()).r).toBeNull()
    expect(await bells()).toHaveLength(1)
    expect(await mail()).toHaveLength(1)
  })

  describe('R7: cola de avisos', () => {
    const claim = () =>
      asRole(b.sql, SERVICE, (t) => t`select * from public.claim_agent_lead_notifications(10)`) as unknown as Promise<Array<{ id: string; attempts: number }>>

    it('claim no devuelve una fila sending con 5 intentos agotada: termina dead con last_error; con 2 intentos la devuelve con 3', async () => {
      const a = await queueRow()
      const c = await queueRow()
      await b.sql`update public.agent_lead_notifications set status = 'sending', attempts = 5, claimed_at = now() - interval '6 minutes' where id = ${a}`
      await b.sql`update public.agent_lead_notifications set status = 'sending', attempts = 2, claimed_at = now() - interval '6 minutes' where id = ${c}`
      const got = await claim()
      expect(got.map((r) => String(r.id))).toEqual([c])
      expect(Number(got[0].attempts)).toBe(3)
      const [dead] = await b.sql`select status, last_error from public.agent_lead_notifications where id = ${a}`
      expect(dead.status).toBe('dead')
      expect(dead.last_error).not.toBeNull()
    })

    it('mark con fallo sobre una fila con 40 intentos no desborda el entero: queda dead', async () => {
      const id = await queueRow()
      await b.sql`update public.agent_lead_notifications set status = 'sending', attempts = 40 where id = ${id}`
      expect(await codeOf(mark(id, false, 'boom'))).toBeNull()
      expect((await b.sql`select status from public.agent_lead_notifications where id = ${id}`)[0].status).toBe('dead')
    })

    it('mark con fallo y p_error NULL guarda un last_error no nulo', async () => {
      const id = await queueRow()
      await b.sql`update public.agent_lead_notifications set status = 'sending', attempts = 1 where id = ${id}`
      await mark(id, false, null)
      expect((await b.sql`select last_error from public.agent_lead_notifications where id = ${id}`)[0].last_error).not.toBeNull()
    })
  })

  it('R8: create_intake_deal escribe en public.deals aunque la sesion tenga una tabla temporal deals', async () => {
    const contact = await insertContact(b.sql, { phone: phone(), agent: seed.jenny.id })
    const out = await asRole(b.sql, SERVICE, async (t) => {
      await t.unsafe(`create temp table deals (id uuid default gen_random_uuid(), contact_id uuid, agent_id uuid, stage text, currency text)`)
      await t`select public.create_intake_deal(${contact}, ${seed.jenny.id})`
      const [d] = await t`select count(*)::int n from public.deals where contact_id = ${contact}`
      const [q] = await t`select count(*)::int n from public.agent_lead_notifications`
      return { deals: d.n as number, queue: q.n as number }
    })
    expect(out).toEqual({ deals: 1, queue: 1 })
  })

  it.each(['TRUE', ' true '])('R9: agent_notify_queue_live = %j deja la fila en pending', async (value) => {
    await b.sql`insert into public.agency_config (key, value) values ('agent_notify_queue_live', ${value})`
    const contact = await insertContact(b.sql, { phone: phone(), agent: seed.jenny.id })
    const deal = await createIntakeDeal(b.sql, SERVICE, contact, seed.jenny.id)
    expect((await b.sql`select status from public.agent_lead_notifications where deal_id = ${deal}`)[0].status).toBe('pending')
  })

  it('R10: si el deal cambia de dueno, el aviso de cliente que vuelve llega al nuevo dueno dentro de las 24 h', async () => {
    const contact = await insertContact(b.sql, { phone: phone(), agent: seed.jenny.id, first: 'Maria' })
    const deal = await createIntakeDeal(b.sql, SERVICE, contact, seed.jenny.id)
    const notify = () => asRole(b.sql, AVA, (t) => t`select public.notify_agent_client_returned(${contact}) r`)
    await notify()
    await b.sql`update public.deals set agent_id = ${seed.joanny.id} where id = ${deal}`
    await notify()
    const rows = await b.sql`select user_id from public.notifications where type = 'client_returned' order by created_at`
    expect(rows.map((r) => r.user_id)).toEqual([seed.jenny.id, seed.joanny.id])
  })

  describe('R12: ACL y RLS de las tablas nuevas (T-D01-03)', () => {
    const TABLES = ['contact_match_events', 'agent_lead_notifications', 'agent_time_notifications'] as const
    const PRIVS = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']

    it('anon y authenticated no tienen ningun privilegio sobre tablas ni secuencias; RLS activa', async () => {
      const bad: string[] = []
      for (const t of TABLES) {
        for (const role of ['anon', 'authenticated']) {
          for (const p of PRIVS) {
            const [r] = await b.sql`select has_table_privilege(${role}, ${'public.' + t}, ${p}) ok`
            if (r.ok) bad.push(`${role} ${p} ${t}`)
          }
          const [{ seq }] = await b.sql`select pg_get_serial_sequence(${'public.' + t}, 'id') seq`
          for (const p of ['usage', 'select', 'update']) {
            const [r] = await b.sql`select has_sequence_privilege(${role}, ${seq}, ${p}) ok`
            if (r.ok) bad.push(`${role} ${p} secuencia de ${t}`)
          }
        }
        const [rls] = await b.sql`select relrowsecurity from pg_class where oid = ${'public.' + t}::regclass`
        if (!rls.relrowsecurity) bad.push(`RLS apagada en ${t}`)
      }
      expect(bad).toEqual([])
    })

    it('service_role: select+insert+update en las dos primeras, select+update en agent_time_notifications, nunca delete ni truncate', async () => {
      const want: Record<string, string[]> = {
        contact_match_events: ['select', 'insert', 'update'],
        agent_lead_notifications: ['select', 'insert', 'update'],
        agent_time_notifications: ['select', 'update'],
      }
      const bad: string[] = []
      for (const t of TABLES) {
        for (const p of PRIVS) {
          const [r] = await b.sql`select has_table_privilege('service_role', ${'public.' + t}, ${p}) ok`
          if (r.ok !== want[t].includes(p)) bad.push(`service_role ${p} ${t}: ${String(r.ok)}`)
        }
      }
      expect(bad).toEqual([])
    })

    it('CONTROL NEGATIVO: una tabla nueva sin revoke SI queda abierta a anon (la trampa de ALTER DEFAULT PRIVILEGES esta activa)', async () => {
      await b.sql.unsafe('create table public.zz_trap(id int)')
      try {
        const [r] = await b.sql`select has_table_privilege('anon', 'public.zz_trap', 'select') ok`
        expect(r.ok).toBe(true)
      } finally {
        await b.sql.unsafe('drop table public.zz_trap')
      }
    })
  })
})

describe.skipIf(!RUN)('R11: 0034 con lock_timeout (Postgres embebido 17.6)', () => {
  let b: Bench
  beforeAll(async () => { b = await startBench({ without: MIGRATIONS }) })
  afterAll(async () => { await b?.stop() })

  it('con un lector sosteniendo contacts, aplicar 0034 falla con 55P03 en menos de 8 s (no espera indefinidamente)', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    let ready!: () => void
    const held = new Promise<void>((r) => { ready = r })
    const holder = b.connect().begin(async (t) => {
      await t.unsafe('lock table public.contacts in access share mode')
      ready()
      await gate
    })
    await Promise.race([held, holder])
    const text = readSql(migrationPath('0034_contacts_phone_key.sql'))
    const attempt = b.connect().begin((t) => t.unsafe(text)).then(() => 'OK', (e: { code?: string }) => e.code ?? 'ERROR')
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<string>((r) => { timer = setTimeout(() => r('TIMEOUT_8S'), 8000) })
    let outcome: string
    try {
      outcome = await Promise.race([attempt, timeout])
    } finally {
      clearTimeout(timer)
      release()
      await holder
    }
    await attempt
    expect(outcome).toBe('55P03')
  })
})
