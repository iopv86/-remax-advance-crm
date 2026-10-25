// D01-P01 Tarea 1: permisos de las RPC nuevas, funciones puras (W1) y columnas generadas.
// Identidades (hecho 8): anon, agente (authenticated + email de agente), Ava (authenticated + info@remaxadvance.com),
// service_role. RPC "de llamador" (guard del cuerpo): anon sin EXECUTE (42501), agente 42501 por el guard, Ava y
// service_role pasan. RPC "solo service_role": todo lo demas 42501 por falta de EXECUTE.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  RUN, AVA, SERVICE, ANON, AGENTE, startBench, seedAgents, insertContact, asRole, codeOf,
  type Bench, type Seed, type Identity,
} from './helpers/bench'

type Who = 'anon' | 'agente' | 'ava' | 'service'
const ALL: Who[] = ['anon', 'agente', 'ava', 'service']
interface Ctx { contact: string; agent: string; phone: string }
interface Case { fn: string; sql: string; params: (c: Ctx) => unknown[]; open: Who[] }

const CALLER: Who[] = ['ava', 'service']
const SERVICE_ONLY: Who[] = ['service']
const CASES: Case[] = [
  { fn: 'create_intake_deal', sql: 'select public.create_intake_deal($1::uuid, $2::uuid)', params: (c) => [c.contact, c.agent], open: CALLER },
  { fn: 'resolve_contact', sql: 'select * from public.resolve_contact($1::text, $2::text, null, null, null, null, false, true)', params: (c) => [c.phone, c.phone.slice(1)], open: CALLER },
  { fn: 'resolve_deal_agent', sql: 'select public.resolve_deal_agent($1::uuid)', params: (c) => [c.agent], open: CALLER },
  { fn: 'record_campaign_return', sql: 'select public.record_campaign_return($1::uuid, $2::text)', params: (c) => [c.contact, 'nota'], open: CALLER },
  { fn: 'record_preferred_contact_time', sql: 'select public.record_preferred_contact_time($1::uuid, $2::text)', params: (c) => [c.contact, 'por la tarde'], open: CALLER },
  { fn: 'notify_agent_client_returned', sql: 'select public.notify_agent_client_returned($1::uuid)', params: (c) => [c.contact], open: CALLER },
  { fn: 'claim_agent_lead_notifications', sql: 'select * from public.claim_agent_lead_notifications(1)', params: () => [], open: SERVICE_ONLY },
  { fn: 'mark_agent_lead_notification', sql: 'select public.mark_agent_lead_notification(0::bigint, false, null::text, null::text, null::uuid, false)', params: () => [], open: SERVICE_ONLY },
  { fn: 'rr_agent_with_retry', sql: 'select public.rr_agent_with_retry()', params: () => [], open: SERVICE_ONLY },
  { fn: 'contact_survivor', sql: 'select public.contact_survivor(array[]::uuid[])', params: () => [], open: SERVICE_ONLY },
]

describe.skipIf(!RUN)('permisos y columnas generadas (Postgres embebido 17.6)', () => {
  let b: Bench
  let seed: Seed
  let counter = 0

  beforeAll(async () => { b = await startBench() })
  afterAll(async () => { await b?.stop() })
  beforeEach(async () => { seed = await seedAgents(b.sql) })

  const identity = (w: Who): Identity =>
    w === 'anon' ? ANON : w === 'agente' ? AGENTE(seed.jenny.email, seed.jenny.id) : w === 'ava' ? AVA : SERVICE

  describe.each(CASES)('$fn', (c) => {
    it(`solo ${c.open.join(' y ')} pueden ejecutarla; el resto recibe 42501`, async () => {
      const got: Record<Who, string | null> = { anon: null, agente: null, ava: null, service: null }
      for (const w of ALL) {
        // Un contacto y un telefono nuevos por llamador: ninguna llamada depende del efecto de otra.
        counter += 1
        const phone = `+1809555${String(2000 + counter)}`
        const contact = await insertContact(b.sql, { phone, agent: seed.jenny.id, first: 'Maria' })
        const ctx: Ctx = { contact, agent: seed.jenny.id, phone: `+1809555${String(6000 + counter)}` }
        got[w] = await codeOf(asRole(b.sql, identity(w), (t) => t.unsafe(c.sql, c.params(ctx) as never[])))
      }
      const expected = Object.fromEntries(ALL.map((w) => [w, c.open.includes(w) ? null : '42501'])) as Record<Who, string | null>
      expected.anon = '42501'
      expected.agente = '42501'
      expect(got).toEqual(expected)
    })
  })

  describe('W1: funciones puras', () => {
    it.each([['anon', ANON], ['authenticated', AGENTE('x@test.local')], ['service_role', SERVICE]] as const)(
      'phone_key("+18095550101") funciona como %s',
      async (_n, who) => {
        const [{ k }] = await asRole(b.sql, who, (t) => t`select public.phone_key('+18095550101') k`)
        expect(k).toBe('18095550101')
      },
    )

    it('un insert como anon no falla por permiso sobre las funciones de la columna generada (RLS puede negarlo, eso es otra cosa)', async () => {
      const [{ ok }] = await b.sql<{ ok: boolean }[]>`select has_table_privilege('anon', 'public.contacts', 'insert') ok`
      expect(ok).toBe(true) // precondicion 2 medida en prod: anon tiene INSERT en contacts
      const msg = await asRole(b.sql, ANON, (t) =>
        t`insert into public.contacts (phone, whatsapp_number) values ('+18095550123', '+18095550123')`,
      ).then(() => '', (e: Error) => e.message)
      expect(msg).not.toMatch(/permission denied for function/i)
      expect(msg === '' || /row-level security/i.test(msg)).toBe(true)
    })
  })

  describe('columnas generadas evaluadas con los privilegios de quien inserta', () => {
    const insertAsAgent = () => {
      const who = AGENTE(seed.jenny.email, seed.jenny.id)
      return asRole(b.sql, who, (t) => t<{ phone_key: string | null; phone_match: string[] }[]>`
        insert into public.contacts (phone, whatsapp_number, agent_id)
        values ('+18095550123', '+18095550123', ${seed.jenny.id}) returning phone_key, phone_match`)
    }

    it('un agente (authenticated) puede insertar y la clave se calcula', async () => {
      const [row] = await insertAsAgent()
      expect(row.phone_key).toBe('18095550123')
      expect(row.phone_match).toEqual(['18095550123'])
    })

    it('CONTROL NEGATIVO: con EXECUTE de phone_key revocado a authenticated el mismo insert da 42501', async () => {
      const [{ pub }] = await b.sql<{ pub: boolean }[]>`
        select exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                        where p.oid = 'public.phone_key(text)'::regprocedure and x.grantee = 0) pub`
      await b.sql.unsafe('revoke execute on function public.phone_key(text) from public, authenticated')
      try {
        expect(await codeOf(insertAsAgent())).toBe('42501')
      } finally {
        await b.sql.unsafe('grant execute on function public.phone_key(text) to authenticated')
        if (pub) await b.sql.unsafe('grant execute on function public.phone_key(text) to public')
      }
    })
  })
})
