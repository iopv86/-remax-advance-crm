// D01-P02: emisor (failed -> dead), correo de hora preferida (D14) y alerta agrupada contra el Postgres embebido
// 17.6 con las tablas, permisos y RPC reales (0035/0036), por el adaptador pg-db como service_role. Los reclamos
// condicionados se prueban con corridas en PARALELO sobre conexiones distintas, no con un doble en memoria.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({ emails: [] as { to: string; subject: string; text: string }[], emailOk: true }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({
  sendAgentEmail: async (a: { to: string; subject: string; text: string }) => { h.emails.push(a); return h.emailOk },
}))

import {
  RUN, SERVICE, startBench, seedAgents, insertContact, createIntakeDeal, asRole, type Bench, type Seed,
} from './helpers/bench'
import { pgDb } from './helpers/pg-db'
import { drainAgentNotifications, drainTimeNotifications } from '@/lib/agent-notifications'
import { sendGroupedMatchAlerts } from '@/lib/match-alerts'

type Db = Parameters<typeof drainAgentNotifications>[0]
const TO = 'alertas@test.local'

describe.skipIf(!RUN)('colas del cron contra tablas reales (Postgres embebido 17.6)', () => {
  let b: Bench
  let seed: Seed
  const db = () => pgDb(b.sql) as unknown as Db
  const fetchMock = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>()

  beforeAll(async () => { b = await startBench({ ingestTables: true }) })
  afterAll(async () => { await b?.stop() })
  beforeEach(async () => {
    seed = await seedAgents(b.sql)
    await b.sql`update public.agents set phone = '+18095550901' where id = ${seed.jenny.id}`
    h.emails.length = 0
    h.emailOk = true
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('META_ACCESS_TOKEN', 'tok-banco')
    vi.stubEnv('META_PHONE_NUMBER_ID', '999')
  })

  const pendingDeal = async (phone = '+18095550101') => {
    await b.sql`insert into public.agency_config (key, value) values ('agent_notify_queue_live', 'true') on conflict do nothing`
    const c = await insertContact(b.sql, { phone, agent: seed.jenny.id, first: 'Maria' })
    const d = await createIntakeDeal(b.sql, SERVICE, c, seed.jenny.id)
    return { contact: c, deal: d as string }
  }

  describe('emisor: 4xx de Meta hasta dead con mark real', () => {
    it("5 respuestas 400 -> failed con backoff y al quinto 'dead'; nunca 'sent' ni agent_notified_at", async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 131026 } }), { status: 400 }))
      const { deal } = await pendingDeal()
      const seen: string[] = []
      for (let i = 1; i <= 5; i++) {
        const r = await drainAgentNotifications(db())
        expect(r.claimed).toBe(1)
        const [row] = await b.sql`select status, attempts, next_attempt_at > now() future, last_error from public.agent_lead_notifications where deal_id = ${deal}`
        seen.push(`${row.status}:${row.attempts}`)
        expect(row.last_error).toBe('meta 400 code=131026')
        if (i < 5) {
          expect(row.future).toBe(true)
          // Sin esperar el backoff: lo adelanta la prueba.
          await b.sql`update public.agent_lead_notifications set next_attempt_at = now() where deal_id = ${deal}`
        }
      }
      expect(seen).toEqual(['failed:1', 'failed:2', 'failed:3', 'failed:4', 'dead:5'])
      expect((await drainAgentNotifications(db())).claimed).toBe(0)
      const [d] = await b.sql`select agent_notified_at from public.deals where id = ${deal}`
      expect(d.agent_notified_at).toBeNull()
      // El correo de respaldo salio una sola vez (email_sent_at), no en cada intento.
      expect(h.emails).toHaveLength(1)
    })

    it('200 con id -> sent, wa_message_id y agent_notified_at; el agente es el del DEAL', async () => {
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.OK' }] }), { status: 200 }))
      const { deal } = await pendingDeal()
      expect((await drainAgentNotifications(db())).sent).toBe(1)
      const [row] = await b.sql`select status, wa_message_id, notified_agent_id from public.agent_lead_notifications where deal_id = ${deal}`
      expect(row).toEqual({ status: 'sent', wa_message_id: 'wamid.OK', notified_agent_id: seed.jenny.id })
      expect((await b.sql`select agent_notified_at from public.deals where id = ${deal}`)[0].agent_notified_at).not.toBeNull()
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).to).toBe('+18095550901')
    })
  })

  describe('correo de hora preferida (D14) con filas de record_preferred_contact_time', () => {
    const recordTime = async (contact: string, text: string) =>
      asRole(b.sql, SERVICE, (t) => t`select public.record_preferred_contact_time(${contact}, ${text}) d`)

    it('1 correo al agente del deal y email_sent_at; dos corridas en PARALELO -> 1 solo correo', async () => {
      const { contact, deal } = await pendingDeal()
      await recordTime(contact, 'manana a las 10 (Madrid)')
      const [a, c] = await Promise.all([drainTimeNotifications(db()), drainTimeNotifications(db())])
      expect(a.sent + c.sent).toBe(1)
      expect(h.emails).toHaveLength(1)
      expect(h.emails[0]).toMatchObject({ to: seed.jenny.email, subject: '[CRM] Hora preferida de Maria' })
      expect(h.emails[0].text).toContain(`/dashboard/pipeline/${deal}`)
      const [row] = await b.sql`select email_sent_at is not null sent, attempts, last_error from public.agent_time_notifications`
      expect(row).toEqual({ sent: true, attempts: 1, last_error: null })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('agente sin email -> se abandona (attempts 5) y la alerta agrupada lo reporta una vez (attempts 6)', async () => {
      // agents.email es NOT NULL en prod: "sin email" solo puede ser la cadena vacia.
      await b.sql`update public.agents set email = '' where id = ${seed.jenny.id}`
      const { contact } = await pendingDeal()
      await recordTime(contact, 'por la tarde')
      await drainTimeNotifications(db())
      expect(h.emails).toHaveLength(0)
      expect((await b.sql`select attempts, last_error from public.agent_time_notifications`)[0])
        .toEqual({ attempts: 5, last_error: 'agent_without_email' })
      const r = await sendGroupedMatchAlerts(db(), { to: TO })
      expect(r).toMatchObject({ ok: true, time: 1 })
      expect(h.emails[0].text).toContain('agent_without_email')
      expect((await b.sql`select attempts from public.agent_time_notifications`)[0].attempts).toBe(6)
    })
  })

  describe('alerta agrupada', () => {
    const event = (kind: string, last4 = '0101') =>
      b.sql`insert into public.contact_match_events (kind, caller, key_last4) values (${kind}, 'crm', ${last4})`

    it("ambiguous/no_agent/dup_group + dead -> 1 correo; alerted_at y match_alert_last_at (TEXT); 'variant' no", async () => {
      await event('ambiguous'); await event('no_agent', '0202'); await event('variant', '0303')
      const { deal } = await pendingDeal()
      await b.sql`update public.agent_lead_notifications set status = 'dead', last_error = 'meta 400 code=131026' where deal_id = ${deal}`
      const r = await sendGroupedMatchAlerts(db(), { to: TO })
      expect(r).toMatchObject({ ok: true, events: 2, dead: 1 })
      expect(h.emails).toHaveLength(1)
      expect(await b.sql`select kind from public.contact_match_events where alerted_at is not null order by kind`)
        .toEqual([{ kind: 'ambiguous' }, { kind: 'no_agent' }])
      expect((await b.sql`select alerted_at is not null a from public.agent_lead_notifications where deal_id = ${deal}`)[0].a).toBe(true)
      const [cfg] = await b.sql`select value, pg_typeof(value)::text t from public.agency_config where key = 'match_alert_last_at'`
      expect(cfg.t).toBe('text')
      expect(Number.isFinite(Date.parse(cfg.value))).toBe(true)
      expect((await sendGroupedMatchAlerts(db(), { to: TO })).reason).toMatch(/cooldown|nothing_to_alert/)
    })

    it('dos corridas en PARALELO (con y sin fila de cooldown previa) -> 1 solo correo', async () => {
      await event('ambiguous')
      await Promise.all([sendGroupedMatchAlerts(db(), { to: TO }), sendGroupedMatchAlerts(db(), { to: TO })])
      expect(h.emails).toHaveLength(1)
      await b.sql`update public.agency_config set value = '2026-01-01T00:00:00.000Z' where key = 'match_alert_last_at'`
      await event('no_agent')
      await Promise.all([sendGroupedMatchAlerts(db(), { to: TO }), sendGroupedMatchAlerts(db(), { to: TO })])
      expect(h.emails).toHaveLength(2)
    })

    it('envio fallido -> nada marcado y el reclamo se devuelve (la corrida siguiente reintenta)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await event('ambiguous')
      h.emailOk = false
      expect((await sendGroupedMatchAlerts(db(), { to: TO })).reason).toBe('send_failed')
      expect((await b.sql`select count(*)::int n from public.contact_match_events where alerted_at is not null`)[0].n).toBe(0)
      h.emailOk = true
      expect((await sendGroupedMatchAlerts(db(), { to: TO })).ok).toBe(true)
    })
  })
})
