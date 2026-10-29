// D01-P04 Tarea 1: fusion de los grupos duplicados de H1 (scripts/d01) y migraciones 0040-0042, contra Postgres 17.6.
// Bancos: (1) fusion completa con sus controles negativos, despues 0040 y 0041; (2) reversion; (3) reversion con
// cambios posteriores; (4) orden de deals con un indice unico de intake; (5) cerrojos frente al emisor de avisos;
// (6) aserciones del plan; (7) marcadores + 0037; (8) 0042. Telefonos sinteticos (809-555-01xx/02xx) y fechas
// inventadas: el repo es publico.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import type { Sql } from 'postgres'
import {
  RUN, REPO, startBench, seedAgents, applyMigration, readSql, codeOf, asRole, resolveContact, backendPid, waitPidBlocked,
  AVA, SERVICE, AGENTE, type Bench, type Seed,
} from './helpers/bench'

const SCRIPTS = path.join(REPO, 'scripts', 'd01')
const runScript = (sql: Sql, f: string, tz?: string) => sql.begin(async (t) => {
  if (tz) await t.unsafe(`set local timezone = '${tz}'`)
  await t.unsafe(readSql(path.join(SCRIPTS, f)))
})
const runDown = (sql: Sql, f: string) => sql.begin((t) => t.unsafe(readSql(path.join(REPO, 'migrations', 'rollback', f))))
const F0037 = '0037_contacts_phone_check.sql'
const F0040 = '0040_contacts_phone_key_unique.sql'
const F0041 = '0041_assign_next_rr_agent_service_only.sql'
const F0042 = '0042_follow_up_key_and_ambiguous_window.sql'
const INTAKE = ['nuevo_sin_contactar', 'lead_captured']

// ---- siembra ----------------------------------------------------------------------------------------------------
async function contact(sql: Sql, phone: string | null, source: string, agent: string | null, created: string,
                       whatsapp: string | null = phone): Promise<string> {
  const [r] = await sql<{ id: string }[]>`
    insert into public.contacts (phone, whatsapp_number, source, agent_id, created_at, first_name)
    values (${phone}, ${whatsapp}, ${source}::public.lead_source, ${agent}, ${created}, 'Cliente')
    returning id`
  return r.id
}
async function deal(sql: Sql, contactId: string, agent: string, stage: string, created: string): Promise<string> {
  const [r] = await sql<{ id: string }[]>`
    insert into public.deals (contact_id, agent_id, stage, created_at)
    values (${contactId}, ${agent}, ${stage}::public.deal_stage, ${created}) returning id`
  return r.id
}
async function messages(sql: Sql, contactId: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await sql`insert into public.messages (contact_id, direction, content)
              values (${contactId}, ${i % 2 === 0 ? 'inbound' : 'outbound'}::public.message_direction, 'hola')`
  }
}

interface Fx {
  A1: string; A2: string; B1: string; B2: string; C1: string; C2: string; D1: string; D2: string; F1: string; F2: string
  S6: string; L6a: string; L6b: string; E: string
  dA1: string; dA2: string; dB1: string; dB1q: string; dB2: string; dC1: string; dC2: string; dD2: string; dF1: string
  dS6: string; dL6a: string; dE: string
  capiC1: string; capiC2: string; taskB1: string; showD1: string; callD1: string; actC2: string; eventB1: string; partyA1: string
}
const SURVIVORS = (fx: Fx) => [fx.A2, fx.B2, fx.C1, fx.D2, fx.F1, fx.S6]
const LOSERS = (fx: Fx) => [fx.A1, fx.B1, fx.C2, fx.D1, fx.F2, fx.L6a, fx.L6b]

/**
 * Los patrones medidos en prod (D01-CONTEXT 2), un grupo de 3 y un grupo para las reglas de columnas:
 *   G1 admin (importacion, fuera del RR) frente a Joanny             -> gana Joanny (A2)
 *   G2 Joanny (mayo) frente a Jenny (septiembre)                      -> override: gana Jenny (B2); B1 'cold'
 *   G3 mismo agente, ctwa_ad 30 s antes que lead_form                 -> gana el mas antiguo (C1); el deal
 *      conservado es el del perdedor (mas antiguo) y se mueve
 *   G4 uno sin agente (mas antiguo) y otro con Jenny                  -> gana Jenny (D2)
 *   G5 Jenny 'contacted' frente a un ctwa_ad sin agente con todo     -> reglas de contact_rules() (F1)
 *   G6 tres formatos: dos de Joanny y uno sin agente                  -> gana el mas antiguo de Joanny (S6)
 *   E  contacto de control sin duplicado: no se toca
 */
async function seedFusion(sql: Sql, s: Seed): Promise<Fx> {
  const A1 = await contact(sql, '8095550111', 'other', s.admin.id, '2026-01-01T10:00:00Z')
  const A2 = await contact(sql, '+18095550111', 'lead_form', s.joanny.id, '2026-03-01T10:00:00Z')
  const B1 = await contact(sql, '18095550122', 'ctwa_ad', s.joanny.id, '2026-02-01T10:00:00Z')
  const B2 = await contact(sql, '+18095550122', 'lead_form', s.jenny.id, '2026-04-01T10:00:00Z')
  const C1 = await contact(sql, '18095550133', 'ctwa_ad', s.jenny.id, '2026-05-01T10:00:00Z')
  const C2 = await contact(sql, '+18095550133', 'lead_form', s.jenny.id, '2026-05-01T10:00:30Z')
  const D1 = await contact(sql, '18095550144', 'ctwa_ad', null, '2026-06-01T10:00:00Z')
  const D2 = await contact(sql, '+18095550144', 'lead_form', s.jenny.id, '2026-06-01T10:00:02Z')
  const F1 = await contact(sql, '+18095550155', 'lead_form', s.jenny.id, '2026-07-01T10:00:00Z')
  const F2 = await contact(sql, '18095550155', 'ctwa_ad', null, '2026-07-01T10:05:00Z')
  const S6 = await contact(sql, '+18095550160', 'lead_form', s.joanny.id, '2026-08-01T10:00:00Z')
  const L6a = await contact(sql, '18095550160', 'ctwa_ad', s.joanny.id, '2026-08-01T10:00:30Z')
  const L6b = await contact(sql, '8095550160', 'other', null, '2026-08-01T10:01:00Z')
  const E = await contact(sql, '+18095550199', 'lead_form', s.joanny.id, '2026-09-01T10:00:00Z')

  await sql`update public.contacts set meta_lead_id = 'L-A2' where id = ${A2}`
  await sql`update public.contacts set meta_lead_id = 'L-C2', email = 'c2@test.local', lead_form_answers = '{"q": "a"}'::jsonb,
              meta_campaign_name = 'Campana', budget_min = 100000, budget_max = 150000, budget_currency = 'DOP'
             where id = ${C2}`
  await sql`update public.contacts set follow_up_state = '{"paso": 2}'::jsonb, follow_up_count = 3,
              first_name = 'Juan', last_name = null where id = ${D1}`
  // El import guarda 'Importado' cuando la fila no trae nombre: para la regla 'nombre' cuenta como vacio.
  await sql`update public.contacts set first_name = 'Importado', last_name = 'Perez' where id = ${D2}`
  await sql`update public.contacts set meta_lead_id = 'L-6a' where id = ${L6a}`
  await sql`update public.contacts set meta_lead_id = 'L-6b', budget_min = 50000, budget_currency = 'USD' where id = ${L6b}`
  // Columnas que no disparan trg_auto_qualification (no estan en su lista): el estado queda "incoherente" con el gate,
  // como pasa en prod cuando Ava o una persona cambian solo la clasificacion o el estado.
  await sql`update public.contacts set lead_classification = 'cold' where id = ${B1}`
  await sql`update public.contacts set lead_status = 'contacted' where id = ${F1}`

  const dA1 = await deal(sql, A1, s.admin.id, 'lead_captured', '2026-01-01T10:01:00Z')
  const dA2 = await deal(sql, A2, s.joanny.id, 'nuevo_sin_contactar', '2026-03-01T10:01:00Z')
  const dB1 = await deal(sql, B1, s.joanny.id, 'lead_captured', '2026-02-01T10:01:00Z')
  const dB1q = await deal(sql, B1, s.joanny.id, 'qualified', '2026-02-02T10:00:00Z')
  const dB2 = await deal(sql, B2, s.jenny.id, 'nuevo_sin_contactar', '2026-04-01T10:01:00Z')
  const dC1 = await deal(sql, C1, s.jenny.id, 'nuevo_sin_contactar', '2026-05-01T10:00:50Z')
  const dC2 = await deal(sql, C2, s.jenny.id, 'nuevo_sin_contactar', '2026-05-01T10:00:35Z')
  const dD2 = await deal(sql, D2, s.jenny.id, 'nuevo_sin_contactar', '2026-06-01T10:01:00Z')
  const dF1 = await deal(sql, F1, s.jenny.id, 'nuevo_sin_contactar', '2026-07-01T10:01:00Z')
  const dS6 = await deal(sql, S6, s.joanny.id, 'nuevo_sin_contactar', '2026-08-01T10:00:05Z')
  const dL6a = await deal(sql, L6a, s.joanny.id, 'nuevo_sin_contactar', '2026-08-01T10:00:35Z')
  const dE = await deal(sql, E, s.joanny.id, 'nuevo_sin_contactar', '2026-09-01T10:01:00Z')

  for (const c of [A1, A2, B1, B2, C1, C2, D1, D2, F1, F2, S6, L6a, L6b]) await messages(sql, c, 2)
  await messages(sql, E, 1)

  const capi = async (event: string, c: string, d: string) => {
    const [r] = await sql<{ id: string }[]>`
      insert into public.capi_outbox (event_id, event_name, action_source, contact_id, deal_id, payload)
      values (${event}, 'Lead', 'system_generated', ${c}, ${d}, '{}'::jsonb) returning id`
    return r.id
  }
  await capi('ev-A2', A2, dA2)
  await capi('ev-B2', B2, dB2)
  const capiC2 = await capi('ev-C2', C2, dC2)
  const capiC1 = await capi('ev-C1', C1, dC1)
  await sql`insert into public.meta_lead_ingest (lead_id, contact_id, deal_id, outcome, source)
            values ('L-A2', ${A2}, ${dA2}, 'new_contact', 'poll'), ('L-C2', ${C2}, ${dC2}, 'new_contact', 'poll')`
  await sql`insert into public.agent_lead_notifications (deal_id, status, sent_at)
            values (${dA1}, 'sent', now()), (${dC2}, 'sent', now())`
  await sql`insert into public.deal_stage_history (deal_id, to_stage) values (${dB1}, 'lead_captured')`
  const [partyA1] = await sql<{ id: string }[]>`insert into public.deal_parties (deal_id) values (${dA1}) returning id`
  const [taskB1] = await sql<{ id: string }[]>`insert into public.tasks (contact_id, deal_id) values (${B1}, ${dB1}) returning id`
  const [showD1] = await sql<{ id: string }[]>`insert into public.showings (contact_id) values (${D1}) returning id`
  const [callD1] = await sql<{ id: string }[]>`insert into public.ava_call_requests (contact_id) values (${D1}) returning id`
  const [actC2] = await sql<{ id: string }[]>`
    insert into public.activities (contact_id, deal_id, activity_type, is_automated)
    values (${C2}, ${dC1}, 'note', true) returning id`
  const [eventB1] = await sql<{ id: string }[]>`
    insert into public.contact_match_events (kind, caller, key_last4, contact_id, source)
    values ('variant', 'crm', '0122', ${B1}, 'lead_form') returning id::text as id`
  return {
    A1, A2, B1, B2, C1, C2, D1, D2, F1, F2, S6, L6a, L6b, E,
    dA1, dA2, dB1, dB1q, dB2, dC1, dC2, dD2, dF1, dS6, dL6a, dE,
    capiC1, capiC2, taskB1: taskB1.id, showD1: showD1.id, callD1: callD1.id, actC2: actC2.id, eventB1: eventB1.id,
    partyA1: partyA1.id,
  }
}

/** md5 por fila de una tabla (sin las columnas de excl), por su clave primaria. */
async function rowHashes(sql: Sql, table: string, pk: string, excl: string[] = []): Promise<Record<string, string>> {
  const rows = await sql.unsafe<{ k: string; h: string }[]>(
    `select t.${pk}::text as k, md5((to_jsonb(t) - $1::text[])::text) as h from ${table} t order by 1`, [excl])
  return Object.fromEntries(rows.map((r) => [r.k, r.h]))
}

const TOUCHED: [string, string, string[]][] = [
  ['public.contacts', 'id', []], ['public.deals', 'id', []], ['public.messages', 'id', []],
  ['public.capi_outbox', 'id', []], ['public.agent_lead_notifications', 'id', []], ['public.meta_lead_ingest', 'lead_id', []],
  ['public.deal_stage_history', 'id', []], ['public.activities', 'id', []], ['public.contact_match_events', 'id', []],
  ['public.tasks', 'id', ['updated_at']], ['public.showings', 'id', ['updated_at']], ['public.ava_call_requests', 'id', []],
  ['public.deal_parties', 'id', ['updated_at']],
]
async function snapshotAll(sql: Sql): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {}
  for (const [t, pk, excl] of TOUCHED) out[t] = await rowHashes(sql, t, pk, excl)
  return out
}
const count = async (sql: Sql, q: string, params: unknown[] = []) => {
  const [r] = await sql.unsafe<{ n: number }[]>(q, params as never[])
  return Number(r.n)
}
const h1Groups = (sql: Sql) => count(sql, `
  with n as (select right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) s10 from public.contacts where phone is not null)
  select count(*)::int n from (select s10 from n where length(s10) = 10 group by s10 having count(*) > 1) g`)
const lastLog = async (sql: Sql) =>
  (await sql<{ event: string; detail: Record<string, unknown> }[]>`select event, detail from d01_private.fusion_log order by id desc limit 1`)[0]

// ---- (1) fusion -------------------------------------------------------------------------------------------------
describe.skipIf(!RUN)('fusion de grupos duplicados D01-P04 (Postgres embebido 17.6)', () => {
  let b: Bench
  let s: Seed
  let fx: Fx
  let seeded: Record<string, Record<string, string>>
  let notifBefore: number

  beforeAll(async () => {
    b = await startBench({ ingestTables: true, p04: true })
    s = await seedAgents(b.sql)
    fx = await seedFusion(b.sql, s)
    seeded = await snapshotAll(b.sql)
  })
  afterAll(async () => { await b?.stop() })

  it('linea base: 6 grupos en H1 y el banco tiene las 22 FK de prod hacia contacts y deals', async () => {
    expect(await h1Groups(b.sql)).toBe(6)
    expect(await count(b.sql, `select count(*)::int n from pg_constraint
      where contype = 'f' and confrelid in ('public.contacts'::regclass, 'public.deals'::regclass)`)).toBe(22)
  })

  it('CONTROL NEGATIVO del indice: crear contacts_phone_key_uidx ANTES de fusionar falla con 23505', async () => {
    expect(await codeOf(b.sql.begin((t) => t.unsafe(
      'create unique index contacts_phone_key_uidx on public.contacts (phone_key) where phone_key is not null')))).toBe('23505')
  })

  it('CONTROL NEGATIVO de 0040: antes de fusionar aborta por su precondicion y no crea nada', async () => {
    await expect(applyMigration(b.sql, F0040)).rejects.toThrow(/claves de telefono repetidas/)
    expect(await count(b.sql, `select count(*)::int n from pg_indexes where indexname = 'contacts_phone_key_uidx'`)).toBe(0)
    expect(await count(b.sql, `select count(*)::int n from pg_indexes where indexname = 'idx_contacts_meta_lead_id'`)).toBe(1)
  })

  it('fusion-plan: 6 grupos; admin -> Joanny; override Joanny/Jenny -> Jenny; grupo de 3; el resto por la regla', async () => {
    await runScript(b.sql, 'fusion-plan.sql')
    const plan = await b.sql<{ survivor_final: string; survivor_regla: string; motivo: string; n: number }[]>`
      select survivor_final, survivor_regla, motivo, cardinality(ids) n from d01_private.fusion_plan order by s10`
    expect(plan.map((p) => p.survivor_final)).toEqual(SURVIVORS(fx))
    expect(plan.map((p) => p.n)).toEqual([2, 2, 2, 2, 2, 3])
    expect(plan[1]).toMatchObject({ survivor_regla: fx.B1, motivo: 'D8: gana la asignacion reciente (Jenny)' })
    expect(plan.filter((p) => p.motivo === 'D8 regla')).toHaveLength(5)
  })

  it('fusion-preview: conjuntos guardados por vista', async () => {
    await runScript(b.sql, 'fusion-preview.sql')
    const rows = await b.sql<{ vista: string; row_id: string; de: string | null; a: string | null }[]>`
      select vista, row_id, de, a from d01_private.preview_ids order by vista, row_id`
    const ids = (v: string) => rows.filter((r) => r.vista === v).map((r) => r.row_id).sort()
    expect(ids('contactos_perdedores')).toEqual(LOSERS(fx).sort())
    expect(ids('contactos_supervivientes')).toEqual(SURVIVORS(fx).sort())
    expect(ids('deal_conservado')).toEqual([fx.dA2, fx.dB2, fx.dC2, fx.dD2, fx.dF1, fx.dS6].sort())
    expect(ids('deals_a_borrar')).toEqual([fx.dA1, fx.dB1, fx.dC1, fx.dL6a].sort())
    expect(ids('deals_a_mover')).toEqual([fx.dB1q, fx.dC2].sort())
    expect(ids('mover:public.messages.contact_id')).toHaveLength(14)
    expect(ids('mover:public.tasks.contact_id')).toEqual([fx.taskB1])
    expect(ids('repuntar:public.tasks.deal_id')).toEqual([fx.taskB1])
    expect(ids('mover:public.showings.contact_id')).toEqual([fx.showD1])
    expect(ids('mover:public.ava_call_requests.contact_id')).toEqual([fx.callD1])
    expect(ids('mover:public.activities.contact_id')).toEqual([fx.actC2])
    expect(ids('repuntar:public.activities.deal_id')).toEqual([fx.actC2])
    expect(ids('mover:public.contact_match_events.contact_id')).toEqual([fx.eventB1])
    expect(ids('repuntar:public.capi_outbox.deal_id')).toEqual([fx.capiC1])
    expect(ids('mover:public.capi_outbox.contact_id')).toEqual([fx.capiC2])
    expect(ids('cascada:public.agent_lead_notifications.deal_id')).toHaveLength(1)
    expect(ids('cascada:public.deal_stage_history.deal_id')).toHaveLength(1)
    expect(ids('cascada:public.deal_parties.deal_id')).toEqual([fx.partyA1])
    expect(rows.find((r) => r.vista === 'repuntar:public.capi_outbox.deal_id')).toMatchObject({ de: fx.dC1, a: fx.dC2 })
    expect(rows.find((r) => r.vista === 'repuntar:public.tasks.deal_id')).toMatchObject({ de: fx.dB1, a: fx.dB2 })
    expect(await count(b.sql, `select count(*)::int n from d01_private.fk_snapshot`)).toBe(22)
    expect(await count(b.sql, `select count(*)::int n from d01_private.preview_meta where hash ~ '^[0-9a-f]{32}$'`)).toBe(1)
  })

  it('privilegios de d01_private en false; RLS en todas sus tablas; vistas security_invoker', async () => {
    const [schema] = await b.sql<{ anon: boolean; auth: boolean; svc: boolean }[]>`
      select has_schema_privilege('anon', 'd01_private', 'usage') anon,
             has_schema_privilege('authenticated', 'd01_private', 'usage') auth,
             has_schema_privilege('service_role', 'd01_private', 'usage') svc`
    expect(schema).toEqual({ anon: false, auth: false, svc: false })
    const objs = await b.sql<{ relname: string; relkind: string; anon: boolean; auth: boolean; inv: boolean; rls: boolean }[]>`
      select c.relname, c.relkind::text,
             has_any_column_privilege('anon', c.oid, 'select') anon, has_any_column_privilege('authenticated', c.oid, 'select') auth,
             coalesce(c.reloptions @> array['security_invoker=true'], false) inv, c.relrowsecurity rls
        from pg_class c where c.relnamespace = 'd01_private'::regnamespace and c.relkind in ('r', 'v') order by 1`
    expect(objs.map((o) => o.relname)).toEqual(['fk_snapshot', 'fusion_log', 'fusion_losers', 'fusion_plan', 'preview_ids', 'preview_meta', 'v_grupos', 'v_resumen'])
    expect(objs.filter((o) => o.anon || o.auth)).toEqual([])
    expect(objs.filter((o) => o.relkind === 'v' && !o.inv)).toEqual([])
    expect(objs.filter((o) => o.relkind === 'r' && !o.rls)).toEqual([])
    expect(await count(b.sql, `select count(*)::int n from pg_proc f where f.pronamespace = 'd01_private'::regnamespace
      and (has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute'))`)).toBe(0)
  })

  it('CONTROL NEGATIVO de privilegios: el mismo objeto creado en public sin revoke SI lo lee anon (default privileges)', async () => {
    await b.sql.unsafe('create table public.zz_p04_trap as select 1 as x')
    try {
      const [r] = await b.sql<{ anon: boolean }[]>`select has_table_privilege('anon', 'public.zz_p04_trap', 'select') anon`
      expect(r.anon).toBe(true)
    } finally {
      await b.sql.unsafe('drop table public.zz_p04_trap')
    }
  })

  it('CONTROL NEGATIVO de la cascada: borrar un perdedor sin mover sus hijos se lleva sus mensajes, su deal y su actividad', async () => {
    await b.sql.begin(async (t) => {
      await t`delete from public.contacts where id = ${fx.C2}`
      const [m] = await t<{ n: number }[]>`select count(*)::int n from public.messages where contact_id = ${fx.C2}`
      const [d] = await t<{ n: number }[]>`select count(*)::int n from public.deals where id = ${fx.dC2}`
      const [a] = await t<{ n: number }[]>`select count(*)::int n from public.activities where id = ${fx.actC2}`
      expect([m.n, d.n, a.n]).toEqual([0, 0, 0])
      throw new Error('deshacer')
    }).catch((e: Error) => { if (e.message !== 'deshacer') throw e })
    expect(await count(b.sql, `select count(*)::int n from public.messages where contact_id = $1`, [fx.C2])).toBe(2)
  })

  it('CONTROL NEGATIVO NO ACTION: borrar un perdedor con una llamada pendiente sin moverla falla con 23503', async () => {
    expect(await codeOf(b.sql`delete from public.contacts where id = ${fx.D1}`)).toBe('23503')
  })

  it('el preview aborta con una tabla nieta bajo una cascada y con una columna contact_id sin FK', async () => {
    await b.sql.unsafe(`create table public.zz_party_docs (id uuid primary key default gen_random_uuid(),
      party_id uuid references public.deal_parties(id) on delete cascade)`)
    await b.sql`insert into public.zz_party_docs (party_id) values (${fx.partyA1})`
    try {
      await expect(runScript(b.sql, 'fusion-preview.sql')).rejects.toThrow(/zz_party_docs/)
    } finally {
      await b.sql.unsafe('drop table public.zz_party_docs')
    }
    await b.sql.unsafe('create table public.zz_notes (id uuid primary key default gen_random_uuid(), contact_id uuid)')
    try {
      await expect(runScript(b.sql, 'fusion-preview.sql')).rejects.toThrow(/sin FK: public\.zz_notes\.contact_id/)
    } finally {
      await b.sql.unsafe('drop table public.zz_notes')
    }
    await runScript(b.sql, 'fusion-preview.sql')
  })

  it('CONTROL NEGATIVO W11: un mensaje nuevo de un perdedor despues del preview aborta el apply y no cambia nada', async () => {
    const [m] = await b.sql<{ id: string }[]>`
      insert into public.messages (contact_id, direction, content) values (${fx.B1}, 'inbound', 'tarde') returning id`
    const mid = await snapshotAll(b.sql) // el insert toca last_message_at del contacto (trg_message_touch_contact)
    try {
      await expect(runScript(b.sql, 'fusion-apply.sql')).rejects.toThrow(/el conjunto de .*mover:public\.messages\.contact_id.* cambio desde el preview/)
      expect(await snapshotAll(b.sql)).toEqual(mid)
      expect(await count(b.sql, `select count(*)::int n from pg_class where relnamespace = 'd01_private'::regnamespace and relname like 'bkp_%'`)).toBe(0)
    } finally {
      await b.sql`delete from public.messages where id = ${m.id}`
    }
  })

  it('CONTROL NEGATIVO: una columna nueva de contacts sin regla aborta el apply', async () => {
    await b.sql.unsafe('alter table public.contacts add column zz_p04 text')
    try {
      await expect(runScript(b.sql, 'fusion-apply.sql')).rejects.toThrow(/sin regla: zz_p04/)
    } finally {
      await b.sql.unsafe('alter table public.contacts drop column zz_p04')
    }
  })

  it('CONTROL NEGATIVO: una FK nueva hacia contacts despues del preview aborta el apply', async () => {
    const mid = await snapshotAll(b.sql)
    await b.sql.unsafe('create table public.zz_p04_child (id uuid primary key default gen_random_uuid(), contact_id uuid references public.contacts(id) on delete cascade)')
    try {
      await expect(runScript(b.sql, 'fusion-apply.sql')).rejects.toThrow(/catalogo de FK/)
    } finally {
      await b.sql.unsafe('drop table public.zz_p04_child')
    }
    expect(await snapshotAll(b.sql)).toEqual(mid)
  })

  it('CONTROL NEGATIVO: una tabla nieta bajo una cascada creada entre el preview y el apply aborta el apply y su fila sigue', async () => {
    await b.sql.unsafe(`create table public.zz_nieto (id uuid primary key default gen_random_uuid(),
      party_id uuid references public.deal_parties(id) on delete cascade)`)
    await b.sql`insert into public.zz_nieto (party_id) values (${fx.partyA1})`
    try {
      await expect(runScript(b.sql, 'fusion-apply.sql')).rejects.toThrow(/cascada/)
      expect(await count(b.sql, 'select count(*)::int n from public.zz_nieto')).toBe(1)
    } finally {
      await b.sql.unsafe('drop table public.zz_nieto')
    }
  })

  it('CONTROL NEGATIVO: una clave de telefono colada entre el preview y el apply (whatsapp, sin phone) aborta el apply', async () => {
    const mid = await snapshotAll(b.sql)
    const intruso = await contact(b.sql, null, 'other', null, '2026-10-01T00:00:00Z', '18095550111')
    try {
      await expect(runScript(b.sql, 'fusion-apply.sql')).rejects.toThrow(/claves de telefono repetidas/)
    } finally {
      await b.sql`delete from public.contacts where id = ${intruso}`
    }
    expect(await snapshotAll(b.sql)).toEqual(mid)
  })

  it('CONTROL NEGATIVO: si el agente del superviviente del grupo del admin sale del RR despues del preview, el apply aborta', async () => {
    const mid = await snapshotAll(b.sql)
    await b.sql`update public.round_robin_config set is_active = false where agent_id = ${s.joanny.id}`
    try {
      await expect(runScript(b.sql, 'fusion-apply.sql')).rejects.toThrow(/assert_survivors/)
    } finally {
      await b.sql`update public.round_robin_config set is_active = true where agent_id = ${s.joanny.id}`
    }
    expect(await snapshotAll(b.sql)).toEqual(mid)
  })

  it('un fallo a mitad del apply (en un UPDATE de movimientos) no deja nada: es una sola transaccion', async () => {
    const mid = await snapshotAll(b.sql)
    await b.sql.unsafe(`create function public.zz_boom() returns trigger language plpgsql as $$ begin raise exception 'zz_boom'; end $$`)
    await b.sql.unsafe('create trigger zz_boom before update on public.tasks for each row execute function public.zz_boom()')
    try {
      await expect(runScript(b.sql, 'fusion-apply.sql')).rejects.toThrow(/zz_boom/)
    } finally {
      await b.sql.unsafe('drop trigger zz_boom on public.tasks; drop function public.zz_boom()')
    }
    expect(await snapshotAll(b.sql)).toEqual(mid)
    expect(await count(b.sql, `select count(*)::int n from pg_class where relnamespace = 'd01_private'::regnamespace and relname like 'bkp_%'`)).toBe(0)
  })

  it('fusion-apply: un contacto por grupo, mensajes conservados por grupo, un deal de intake con el agente del superviviente', async () => {
    // Reglas de columnas (G5): el perdedor F2 lleva un valor en TODA columna con regla distinta de 'conservar' y el
    // superviviente F1 su valor "vacio" (NULL, o el default para 'si_vacio'; sin nombre para 'nombre').
    const cols = await b.sql<{ name: string; regla: string; type: string; typtype: string; elem: string | null; elemtype: string | null }[]>`
      select a.attname::text name, r.regla, format_type(a.atttypid, a.atttypmod) type, t.typtype::text,
             format_type(nullif(t.typelem, 0), null) elem, et.typtype::text elemtype
        from pg_attribute a join pg_type t on t.oid = a.atttypid left join pg_type et on et.oid = t.typelem
        join d01_private.contact_rules() r on r.columna = a.attname::text
       where a.attrelid = 'public.contacts'::regclass and r.regla in ('si_nulo', 'si_vacio', 'nombre')`
    const value = (c: (typeof cols)[number]): string => {
      if (c.typtype === 'e') return `coalesce((enum_range(null::${c.type}))[2], (enum_range(null::${c.type}))[1])`
      if (c.type.endsWith('[]')) return c.elemtype === 'e' ? `array[(enum_range(null::${c.elem}))[1]]` : `'{v}'`
      const fixed: Record<string, string> = {
        text: `'v-${c.name}'`, jsonb: `'{"v": 1}'::jsonb`, uuid: 'gen_random_uuid()', integer: '7', boolean: 'true',
        'timestamp with time zone': `'2026-01-02T03:04:05Z'`,
      }
      if (c.type.startsWith('numeric')) return '7'
      if (!(c.type in fixed)) throw new Error(`tipo sin valor de prueba: ${c.name} ${c.type}`)
      return fixed[c.type]
    }
    const empty: Record<string, string> = { purpose: `'unknown'`, payment_method: `'unknown'`, timeline: `'exploring'`, lead_score: '0', desired_amenities: `'{}'` }
    expect(cols.filter((c) => c.regla === 'si_vacio').map((c) => c.name).sort()).toEqual(Object.keys(empty).sort())
    expect(cols.length).toBe(33) // 26 si_nulo + 5 si_vacio + 2 nombre
    await b.sql.unsafe(`update public.contacts set ${cols.map((c) => `${c.name} = ${value(c)}`).join(', ')},
      budget_min = 1, budget_max = 2, budget_currency = 'DOP', wa_opted_out = true, ava_paused = true,
      is_recruit_candidate = true, follow_up_count = 9, last_activity_at = '2026-12-01', last_message_at = '2026-12-01'
      where id = $1`, [fx.F2])
    await b.sql.unsafe(`update public.contacts set ${cols.map((c) => `${c.name} = ${c.regla === 'si_vacio' ? empty[c.name] : 'null'}`).join(', ')}
      where id = $1`, [fx.F1])
    notifBefore = await count(b.sql, 'select count(*)::int n from public.notifications')

    await runScript(b.sql, 'fusion-apply.sql')

    expect(await h1Groups(b.sql)).toBe(0)
    const left = await b.sql<{ id: string }[]>`
      select id from public.contacts where id in ${b.sql([...SURVIVORS(fx), ...LOSERS(fx)])} order by id`
    expect(left.map((r) => r.id)).toEqual(SURVIVORS(fx).sort())
    const perSurvivor = await b.sql<{ contact_id: string; n: number }[]>`
      select contact_id, count(*)::int n from public.messages where contact_id in ${b.sql(SURVIVORS(fx))} group by 1 order by 1`
    expect(Object.fromEntries(perSurvivor.map((r) => [r.contact_id, r.n]))).toEqual(
      Object.fromEntries(SURVIVORS(fx).map((id) => [id, id === fx.S6 ? 6 : 4])))
    const intake = await b.sql<{ contact_id: string; id: string; agent_ok: boolean }[]>`
      select d.contact_id, d.id, d.agent_id = c.agent_id agent_ok
        from public.deals d join public.contacts c on c.id = d.contact_id
       where d.contact_id in ${b.sql(SURVIVORS(fx))} and d.stage::text in ${b.sql(INTAKE)}
       order by d.contact_id`
    expect(intake.map((d) => d.id).sort()).toEqual([fx.dA2, fx.dB2, fx.dC2, fx.dD2, fx.dF1, fx.dS6].sort())
    expect(intake.every((d) => d.agent_ok)).toBe(true)
    expect(await b.sql`select contact_id, agent_id from public.deals where id = ${fx.dB1q}`).toMatchObject([{ contact_id: fx.B2, agent_id: s.joanny.id }])
    expect((await rowHashes(b.sql, 'public.contacts', 'id'))[fx.E]).toBe(seeded['public.contacts'][fx.E])
    expect(await count(b.sql, 'select count(*)::int n from public.notifications')).toBe(notifBefore)
    const log = await lastLog(b.sql)
    expect(log.event).toBe('applied')
    expect(log.detail).toMatchObject({ mensajes: 26, 'cascada:public.deal_parties.deal_id': 1 })
    expect(String(log.detail.preview_hash)).toMatch(/^[0-9a-f]{32}$/)
    await expect(runScript(b.sql, 'fusion-apply.sql')).rejects.toThrow(/ya se aplico/)
  })

  it('fusion-apply: hijos movidos, repuntados o en cascada segun su FK', async () => {
    expect(await b.sql`select contact_id, deal_id from public.capi_outbox where id = ${fx.capiC1}`).toMatchObject([{ contact_id: fx.C1, deal_id: fx.dC2 }])
    expect(await b.sql`select contact_id, deal_id from public.capi_outbox where id = ${fx.capiC2}`).toMatchObject([{ contact_id: fx.C1, deal_id: fx.dC2 }])
    expect(await b.sql`select contact_id from public.meta_lead_ingest where lead_id = 'L-C2'`).toMatchObject([{ contact_id: fx.C1 }])
    expect(await b.sql`select contact_id, deal_id from public.tasks where id = ${fx.taskB1}`).toMatchObject([{ contact_id: fx.B2, deal_id: fx.dB2 }])
    expect(await b.sql`select contact_id from public.showings where id = ${fx.showD1}`).toMatchObject([{ contact_id: fx.D2 }])
    expect(await b.sql`select contact_id from public.ava_call_requests where id = ${fx.callD1}`).toMatchObject([{ contact_id: fx.D2 }])
    expect(await b.sql`select contact_id, deal_id from public.activities where id = ${fx.actC2}`).toMatchObject([{ contact_id: fx.C1, deal_id: fx.dC2 }])
    expect(await b.sql`select contact_id from public.contact_match_events where id = ${fx.eventB1}`).toMatchObject([{ contact_id: fx.B2 }])
    expect(await count(b.sql, `select count(*)::int n from public.agent_lead_notifications where deal_id = $1`, [fx.dA1])).toBe(0)
    expect(await count(b.sql, `select count(*)::int n from public.agent_lead_notifications where deal_id = $1`, [fx.dC2])).toBe(1)
    expect(await count(b.sql, `select count(*)::int n from public.deal_stage_history where deal_id = $1`, [fx.dB1])).toBe(0)
    expect(await count(b.sql, `select count(*)::int n from public.deal_parties where id = $1`, [fx.partyA1])).toBe(0)
  })

  it('fusion-apply: cada regla de contact_rules() aplicada al superviviente (G5) y los grupos de 2 y 3', async () => {
    expect(await b.sql`select meta_lead_id, email, lead_form_answers, meta_campaign_name, budget_min::int, budget_max::int,
                              budget_currency::text from public.contacts where id = ${fx.C1}`)
      .toMatchObject([{ meta_lead_id: 'L-C2', email: 'c2@test.local', lead_form_answers: { q: 'a' }, meta_campaign_name: 'Campana',
        budget_min: 100000, budget_max: 150000, budget_currency: 'DOP' }])
    expect(await b.sql`select follow_up_state, follow_up_count, first_name, last_name from public.contacts where id = ${fx.D2}`)
      .toMatchObject([{ follow_up_state: { paso: 2 }, follow_up_count: 3, first_name: 'Juan', last_name: 'Perez' }])
    // grupo de 3: meta_lead_id del perdedor mas antiguo, presupuesto del unico que lo tiene
    expect(await b.sql`select meta_lead_id, budget_min::int, budget_currency::text from public.contacts where id = ${fx.S6}`)
      .toMatchObject([{ meta_lead_id: 'L-6a', budget_min: 50000, budget_currency: 'USD' }])
    // G5: toda regla distinta de 'conservar' lleva el valor del perdedor; 'conservar' (incluidos lead_status y
    // lead_classification, que apply_auto_qualification cambiaria al copiar presupuesto, tipos y plazo) queda igual.
    const mismatch = await b.sql<{ columna: string; regla: string }[]>`
      select r.columna, r.regla from d01_private.contact_rules() r
       where (select to_jsonb(c) -> r.columna from public.contacts c where c.id = ${fx.F1})
             is distinct from (select to_jsonb(x) -> r.columna from d01_private.bkp_contacts x
                                where x.id = case when r.regla = 'conservar' then ${fx.F1}::uuid else ${fx.F2}::uuid end)`
    expect([...mismatch]).toEqual([])
    expect(await b.sql`select lead_status::text, wa_opted_out from public.contacts where id = ${fx.F1}`)
      .toMatchObject([{ lead_status: 'contacted', wa_opted_out: true }])
    const agents = await b.sql`select id, agent_id from public.contacts where id in ${b.sql(SURVIVORS(fx))} order by id`
    expect(agents).toMatchObject([
      { id: fx.A2, agent_id: s.joanny.id }, { id: fx.B2, agent_id: s.jenny.id }, { id: fx.C1, agent_id: s.jenny.id },
      { id: fx.D2, agent_id: s.jenny.id }, { id: fx.F1, agent_id: s.jenny.id }, { id: fx.S6, agent_id: s.joanny.id },
    ].sort((x, y) => (x.id < y.id ? -1 : 1)))
  })

  it('copias en d01_private con todas las filas tocadas, con RLS y sin privilegios para los roles cliente', async () => {
    expect(await count(b.sql, 'select count(*)::int n from d01_private.bkp_contacts')).toBe(13)
    expect(await count(b.sql, 'select count(*)::int n from d01_private.bkp_deals')).toBe(11) // 10 de intake + 1 no intake
    expect(await count(b.sql, 'select count(*)::int n from d01_private.bkp_messages')).toBe(14)
    expect(await count(b.sql, `select count(*)::int n from d01_private.bkp_contacts where id = any($1::uuid[])`, [LOSERS(fx)])).toBe(7)
    expect(await count(b.sql, `select count(*)::int n from pg_class c cross join (values ('anon'), ('authenticated'), ('service_role')) r(rol)
      where c.relnamespace = 'd01_private'::regnamespace and c.relkind in ('r', 'v') and has_any_column_privilege(r.rol, c.oid, 'select')`)).toBe(0)
    expect(await count(b.sql, `select count(*)::int n from pg_class c
      where c.relnamespace = 'd01_private'::regnamespace and c.relkind = 'r' and not c.relrowsecurity`)).toBe(0)
  })

  it('0040 despues de fusionar: indice unico creado, duplicado de meta_lead_id retirado, misma clave -> 23505 de ese indice', async () => {
    await applyMigration(b.sql, F0040)
    await applyMigration(b.sql, F0040) // idempotente
    expect(await count(b.sql, `select count(*)::int n from pg_indexes where indexname = 'contacts_phone_key_uidx'`)).toBe(1)
    expect(await count(b.sql, `select count(*)::int n from pg_indexes where indexname = 'idx_contacts_meta_lead_id'`)).toBe(0)
    expect(await count(b.sql, `select count(*)::int n from pg_indexes where indexname = 'contacts_meta_lead_id_uidx'`)).toBe(1)
    const err = await contact(b.sql, '809-555-0199', 'other', s.jenny.id, '2026-10-29T00:00:00Z').then(() => null, (e: { code?: string; constraint_name?: string }) => e)
    expect(err).toMatchObject({ code: '23505', constraint_name: 'contacts_phone_key_uidx' })
  })

  it('resolve_contact trata el 23505 del indice nuevo: un insert concurrente sin cerrojo gana y la RPC lo encuentra', async () => {
    const holder = b.connect()
    const resolver = b.connect()
    let open!: () => void
    const gate = new Promise<void>((r) => { open = r })
    let inserted!: string
    let ready!: () => void
    const insertedP = new Promise<void>((r) => { ready = r })
    const tx = holder.begin(async (t) => {
      const [r] = await t<{ id: string }[]>`
        insert into public.contacts (phone, whatsapp_number, source) values ('8095550177', '8095550177', 'other') returning id`
      inserted = r.id
      ready()
      await gate
    })
    let res: Promise<unknown> | undefined
    try {
      await Promise.race([insertedP, tx])
      const pid = await backendPid(resolver)
      res = resolveContact(resolver, SERVICE, { phone: '+18095550177', key: '18095550177', source: 'lead_form' })
      expect(await waitPidBlocked(b.sql, pid)).toBe(true)
    } finally {
      open()
    }
    await tx
    expect(await res).toMatchObject({ outcome: 'found', contact_id: inserted })
    expect(await count(b.sql, `select count(*)::int n from public.contacts where phone_key = '18095550177'`)).toBe(1)
  })

  it('CONTROL NEGATIVO de 0041: un DEFAULT que llama a assign_next_rr_agent (pg_depend) aborta la migracion', async () => {
    await b.sql.unsafe('create table public.zz_rr_dep (id int, agent uuid default public.assign_next_rr_agent())')
    try {
      await expect(applyMigration(b.sql, F0041)).rejects.toThrow(/depende de assign_next_rr_agent/)
    } finally {
      await b.sql.unsafe('drop table public.zz_rr_dep')
    }
  })

  it('0041: Ava (authenticated) recibe 42501 en assign_next_rr_agent y resolve_contact con RR sigue asignando', async () => {
    expect(await codeOf(asRole(b.sql, AVA, (t) => t`select public.assign_next_rr_agent()`))).toBeNull()
    await applyMigration(b.sql, F0041)
    await applyMigration(b.sql, F0041) // idempotente
    expect(await codeOf(asRole(b.sql, AVA, (t) => t`select public.assign_next_rr_agent()`))).toBe('42501')
    expect(await codeOf(asRole(b.sql, SERVICE, (t) => t`select public.assign_next_rr_agent()`))).toBeNull()
    const r = await resolveContact(b.sql, AVA, { phone: '+18095550188', key: '18095550188', source: 'ctwa_ad', rr: true })
    expect(r.outcome).toBe('created')
    expect([s.jenny.id, s.joanny.id]).toContain(r.agent_id)
  })

  it('rollbacks 0041-down y 0040-down devuelven el ACL y los indices previos', async () => {
    await runDown(b.sql, '0041-down.sql')
    expect(await codeOf(asRole(b.sql, AVA, (t) => t`select public.assign_next_rr_agent()`))).toBeNull()
    await runDown(b.sql, '0040-down.sql')
    expect(await count(b.sql, `select count(*)::int n from pg_indexes where indexname = 'contacts_phone_key_uidx'`)).toBe(0)
    expect(await count(b.sql, `select count(*)::int n from pg_indexes where indexname = 'idx_contacts_meta_lead_id'`)).toBe(1)
  })
})

// ---- (2) reversion de la fusion ----------------------------------------------------------------------------------
describe.skipIf(!RUN)('fusion-rollback D01-P04 (Postgres embebido 17.6)', () => {
  let b: Bench
  let seeded: Record<string, Record<string, string>>
  let notifBefore: number

  beforeAll(async () => {
    b = await startBench({ ingestTables: true, p04: true })
    const s = await seedAgents(b.sql)
    await seedFusion(b.sql, s)
    seeded = await snapshotAll(b.sql)
    notifBefore = await count(b.sql, 'select count(*)::int n from public.notifications')
    await runScript(b.sql, 'fusion-plan.sql')
    await runScript(b.sql, 'fusion-preview.sql')
    // El apply en una zona horaria y el rollback en otra: to_jsonb de un timestamptz depende de la sesion.
    await runScript(b.sql, 'fusion-apply.sql', 'America/Santo_Domingo')
  })
  afterAll(async () => { await b?.stop() })

  it('con contacts_phone_key_uidx creado, el rollback aborta sin tocar nada', async () => {
    await applyMigration(b.sql, F0040)
    const mid = await snapshotAll(b.sql)
    await expect(runScript(b.sql, 'fusion-rollback.sql')).rejects.toThrow(/0040-down/)
    expect(await snapshotAll(b.sql)).toEqual(mid)
    await runDown(b.sql, '0040-down.sql')
  })

  it('rollback (en otra zona horaria): toda fila vuelve a su md5 previo, tambien la del perdedor cold, y sin campanitas nuevas', async () => {
    await runScript(b.sql, 'fusion-rollback.sql', 'UTC')
    expect(await snapshotAll(b.sql)).toEqual(seeded)
    expect(await count(b.sql, 'select count(*)::int n from public.notifications')).toBe(notifBefore)
    expect(await h1Groups(b.sql)).toBe(6)
    expect(await lastLog(b.sql)).toMatchObject({ event: 'rolled_back', detail: { omitidas: [] } })
    await expect(runScript(b.sql, 'fusion-rollback.sql')).rejects.toThrow(/ya se revirtio/)
  })
})

describe.skipIf(!RUN)('fusion-rollback con cambios despues de la fusion (Postgres embebido 17.6)', () => {
  let b: Bench
  let fx: Fx
  let seeded: Record<string, Record<string, string>>

  beforeAll(async () => {
    b = await startBench({ ingestTables: true, p04: true })
    const s = await seedAgents(b.sql)
    fx = await seedFusion(b.sql, s)
    seeded = await snapshotAll(b.sql)
    await runScript(b.sql, 'fusion-plan.sql')
    await runScript(b.sql, 'fusion-preview.sql')
    await runScript(b.sql, 'fusion-apply.sql')
  })
  afterAll(async () => { await b?.stop() })

  it('la columna editada por una persona y el deal conservado movido de etapa se conservan; el resto vuelve', async () => {
    await b.sql`update public.contacts set email = 'nuevo@test.local' where id = ${fx.C1}`
    await b.sql`update public.deals set stage = 'contacted' where id = ${fx.dA2}`
    await runScript(b.sql, 'fusion-rollback.sql')
    expect(await b.sql`select email, meta_lead_id, budget_min from public.contacts where id = ${fx.C1}`)
      .toMatchObject([{ email: 'nuevo@test.local', meta_lead_id: null, budget_min: null }])
    expect(await b.sql`select stage::text from public.deals where id = ${fx.dA2}`).toMatchObject([{ stage: 'contacted' }])
    expect(await lastLog(b.sql)).toMatchObject({ event: 'rolled_back', detail: { omitidas: [{ contact_id: fx.C1, columnas: ['email'] }] } })
    const now = await snapshotAll(b.sql)
    const without = (snap: Record<string, string>, ...ids: string[]) =>
      Object.fromEntries(Object.entries(snap).filter(([k]) => !ids.includes(k)))
    expect(without(now['public.contacts'], fx.C1)).toEqual(without(seeded['public.contacts'], fx.C1))
    expect(without(now['public.deals'], fx.dA2)).toEqual(without(seeded['public.deals'], fx.dA2))
    for (const [t] of TOUCHED.filter(([t]) => !['public.contacts', 'public.deals', 'public.deal_stage_history'].includes(t))) {
      expect(now[t]).toEqual(seeded[t])
    }
  })
})

// ---- (4) orden de los deals ---------------------------------------------------------------------------------------
describe.skipIf(!RUN)('orden de deals con un indice unico de intake por contacto (Postgres embebido 17.6)', () => {
  let b: Bench

  beforeAll(async () => {
    b = await startBench({ ingestTables: true, p04: true })
    const s = await seedAgents(b.sql)
    await seedFusion(b.sql, s)
    await b.sql.unsafe(`create unique index zz_one_open_intake on public.deals (contact_id)
      where stage in ('nuevo_sin_contactar', 'lead_captured')`)
  })
  afterAll(async () => { await b?.stop() })

  it('el apply borra los deals sobrantes ANTES de mover el conservado, y el rollback lo deshace en orden inverso', async () => {
    await runScript(b.sql, 'fusion-plan.sql')
    await runScript(b.sql, 'fusion-preview.sql')
    await runScript(b.sql, 'fusion-apply.sql')
    await runScript(b.sql, 'fusion-rollback.sql')
    expect(await h1Groups(b.sql)).toBe(6)
  })
})

// ---- (5) cerrojos frente al emisor de avisos ----------------------------------------------------------------------
describe.skipIf(!RUN)('cerrojos de la fusion frente al emisor de avisos (Postgres embebido 17.6)', () => {
  let b: Bench
  let fx: Fx

  beforeAll(async () => {
    b = await startBench({ ingestTables: true, p04: true })
    const s = await seedAgents(b.sql)
    fx = await seedFusion(b.sql, s)
    await runScript(b.sql, 'fusion-plan.sql')
    await runScript(b.sql, 'fusion-preview.sql')
  })
  afterAll(async () => { await b?.stop() })

  it('el emisor (aviso FOR UPDATE y despues el deal) y la fusion no se bloquean en ciclo: los dos terminan', async () => {
    const emitter = b.connect()
    const fusion = b.connect()
    let open!: () => void
    const gate = new Promise<void>((r) => { open = r })
    let ready!: () => void
    const locked = new Promise<void>((r) => { ready = r })
    // Mismo orden que mark_agent_lead_notification (0036): la fila del aviso y despues deals.agent_notified_at.
    const tx = emitter.begin(async (t) => {
      await t`select id from public.agent_lead_notifications where deal_id = ${fx.dA1} for update`
      ready()
      await gate
      await t`update public.deals set agent_notified_at = now() where id = ${fx.dA1}`
    })
    let applyP: Promise<unknown> | undefined
    try {
      await Promise.race([locked, tx])
      const pid = await backendPid(fusion)
      applyP = runScript(fusion, 'fusion-apply.sql')
      expect(await waitPidBlocked(b.sql, pid)).toBe(true)
    } finally {
      open()
    }
    await tx // un 40P01 (deadlock) en cualquiera de los dos rechaza aqui
    await applyP
    expect(await h1Groups(b.sql)).toBe(0)
  })
})

describe.skipIf(!RUN)('cerrojos de la fusion frente a create_intake_deal (Postgres embebido 17.6)', () => {
  let b: Bench
  let fx: Fx

  beforeAll(async () => {
    b = await startBench({ ingestTables: true, p04: true })
    const s = await seedAgents(b.sql)
    fx = await seedFusion(b.sql, s)
    await runScript(b.sql, 'fusion-plan.sql')
    await runScript(b.sql, 'fusion-preview.sql')
  })
  afterAll(async () => { await b?.stop() })

  it('el apply espera el advisory de create_intake_deal de un superviviente (no lee "sin deal" a la vez que mueve uno)', async () => {
    const other = b.connect()
    const fusion = b.connect()
    let open!: () => void
    const gate = new Promise<void>((r) => { open = r })
    let ready!: () => void
    const locked = new Promise<void>((r) => { ready = r })
    const tx = other.begin(async (t) => {
      await t`select pg_advisory_xact_lock(hashtext(${fx.C1}::text))`
      ready()
      await gate
    })
    let applyP: Promise<unknown> | undefined
    try {
      await Promise.race([locked, tx])
      const pid = await backendPid(fusion)
      applyP = runScript(fusion, 'fusion-apply.sql')
      expect(await waitPidBlocked(b.sql, pid)).toBe(true)
    } finally {
      open()
    }
    await tx
    await applyP
    expect(await h1Groups(b.sql)).toBe(0)
  })
})

describe.skipIf(!RUN)('cerrojos de la fusion: contacto antes que deal (Postgres embebido 17.6)', () => {
  let b: Bench
  let fx: Fx

  beforeAll(async () => {
    b = await startBench({ ingestTables: true, p04: true })
    const s = await seedAgents(b.sql)
    fx = await seedFusion(b.sql, s)
    await runScript(b.sql, 'fusion-plan.sql')
    await runScript(b.sql, 'fusion-preview.sql')
  })
  afterAll(async () => { await b?.stop() })

  it('una transaccion que bloquea el contacto (KEY SHARE, como un insert con FK) y despues su deal no entra en ciclo con la fusion', async () => {
    const other = b.connect()
    const fusion = b.connect()
    let open!: () => void
    const gate = new Promise<void>((r) => { open = r })
    let ready!: () => void
    const locked = new Promise<void>((r) => { ready = r })
    const tx = other.begin(async (t) => {
      await t`select 1 from public.contacts where id = ${fx.C1} for key share`
      ready()
      await gate
      await t`update public.deals set agent_notified_at = now() where id = ${fx.dC2}`
    })
    let applyP: Promise<unknown> | undefined
    try {
      await Promise.race([locked, tx])
      const pid = await backendPid(fusion)
      applyP = runScript(fusion, 'fusion-apply.sql')
      expect(await waitPidBlocked(b.sql, pid)).toBe(true)
    } finally {
      open()
    }
    await tx // un 40P01 en cualquiera de los dos rechaza aqui
    await applyP
    expect(await h1Groups(b.sql)).toBe(0)
  })
})

// ---- (6) aserciones del plan --------------------------------------------------------------------------------------
describe.skipIf(!RUN)('fusion-plan: aserciones (Postgres embebido 17.6)', () => {
  let b: Bench
  let s: Seed

  beforeAll(async () => {
    b = await startBench({ p04: true })
    s = await seedAgents(b.sql)
    await contact(b.sql, '+18095550201', 'lead_form', s.jenny.id, '2026-01-01T10:00:00Z')
    await contact(b.sql, '18095550201', 'ctwa_ad', null, '2026-01-01T10:01:00Z')
  })
  afterAll(async () => { await b?.stop() })

  const tryGroup = async (msg: RegExp, rows: [string | null, string, string | null, string?][]) => {
    const ids: string[] = []
    for (const [phone, source, agent, wa] of rows) {
      ids.push(await contact(b.sql, phone, source, agent, '2026-02-01T10:00:00Z', wa === undefined ? phone : wa))
    }
    try {
      await expect(runScript(b.sql, 'fusion-plan.sql')).rejects.toThrow(msg)
    } finally {
      await b.sql`delete from public.contacts where id in ${b.sql(ids)}`
    }
  }

  it('sin el grupo Joanny/Jenny aborta (se espera exactamente 1 override)', async () => {
    await expect(runScript(b.sql, 'fusion-plan.sql')).rejects.toThrow(/0 grupos con el override/)
  })

  it('con el grupo Joanny/Jenny pasa', async () => {
    await contact(b.sql, '18095550202', 'ctwa_ad', s.joanny.id, '2026-01-02T10:00:00Z')
    await contact(b.sql, '+18095550202', 'lead_form', s.jenny.id, '2026-03-02T10:00:00Z')
    await runScript(b.sql, 'fusion-plan.sql')
    expect(await count(b.sql, 'select count(*)::int n from d01_private.fusion_plan')).toBe(2)
  })

  it('un grupo del admin sin ningun contacto con agente activo en el RR aborta', async () => {
    await tryGroup(/contacto del admin/, [['8095550203', 'other', s.admin.id], ['18095550203', 'ctwa_ad', null]])
  })

  it('una clave de telefono repetida fuera de los grupos de H1 aborta', async () => {
    await tryGroup(/repetidas fuera de los grupos/, [['+18095550204', 'lead_form', s.jenny.id], [null, 'other', null, '18095550204']])
  })

  it('dos telefonos de paises distintos con los mismos 10 ultimos digitos abortan', async () => {
    await tryGroup(/ni clave ni variante/, [['+18095550205', 'lead_form', s.jenny.id], ['+528095550205', 'other', null]])
  })

  it('un superviviente archivado con un perdedor activo aborta (sus mensajes y deals quedarian ocultos)', async () => {
    const survivor = await contact(b.sql, '+18095550206', 'lead_form', s.jenny.id, '2026-01-03T10:00:00Z')
    const loser = await contact(b.sql, '18095550206', 'ctwa_ad', null, '2026-01-03T10:01:00Z')
    await b.sql`update public.contacts set lead_status = 'archived' where id = ${survivor}`
    try {
      await expect(runScript(b.sql, 'fusion-plan.sql')).rejects.toThrow(/archivado/)
    } finally {
      await b.sql`delete from public.contacts where id in ${b.sql([survivor, loser])}`
    }
    await runScript(b.sql, 'fusion-plan.sql')
    expect(await b.sql`select count(*)::int n from d01_private.v_grupos where archivado`).toMatchObject([{ n: 0 }])
  })
})

// ---- (7) marcadores + 0037 ---------------------------------------------------------------------------------------
describe.skipIf(!RUN)('marker-phones.sql + 0037 con VALIDATE (Postgres embebido 17.6)', () => {
  let b: Bench
  let marker: string
  let clean: string

  beforeAll(async () => {
    b = await startBench({ without: [F0037] })
    const s = await seedAgents(b.sql)
    marker = await contact(b.sql, '[numero de contacto del cliente]', 'ctwa_ad', s.joanny.id, '2026-05-01T10:00:00Z')
    clean = await contact(b.sql, '+18095550166', 'lead_form', s.jenny.id, '2026-10-01T00:00:00Z')
    await messages(b.sql, marker, 1)
    await b.sql.unsafe('create schema d01_private')
  })
  afterAll(async () => { await b?.stop() })

  it('CONTROL NEGATIVO: 0037 + VALIDATE con el marcador presente falla con 23514', async () => {
    expect(await codeOf(b.sql.begin(async (t) => {
      await t.unsafe(readSql(path.join(REPO, 'migrations', F0037)))
      await t.unsafe('alter table public.contacts validate constraint contacts_phone_no_marker')
    }))).toBe('23514')
  })

  it('marker-phones pone a NULL solo los marcadores (copia con RLS y sin privilegios) y despues 0037 + VALIDATE pasa', async () => {
    const cleanBefore = (await rowHashes(b.sql, 'public.contacts', 'id'))[clean]
    await runScript(b.sql, 'marker-phones.sql')
    expect(await b.sql`select phone, whatsapp_number, agent_id is not null has_agent from public.contacts where id = ${marker}`)
      .toMatchObject([{ phone: null, whatsapp_number: null, has_agent: true }])
    expect(await b.sql`select phone from d01_private.bkp_marker_contacts where id = ${marker}`)
      .toMatchObject([{ phone: '[numero de contacto del cliente]' }])
    expect(await b.sql`select relrowsecurity rls, has_any_column_privilege('anon', oid, 'select') anon,
                              has_any_column_privilege('authenticated', oid, 'select') auth
                         from pg_class where oid = 'd01_private.bkp_marker_contacts'::regclass`)
      .toMatchObject([{ rls: true, anon: false, auth: false }])
    expect((await rowHashes(b.sql, 'public.contacts', 'id'))[clean]).toBe(cleanBefore)
    await applyMigration(b.sql, F0037)
    await b.sql.unsafe('alter table public.contacts validate constraint contacts_phone_no_marker')
    expect(await b.sql`select convalidated from pg_constraint where conname = 'contacts_phone_no_marker'`).toMatchObject([{ convalidated: true }])
    expect(await codeOf(contact(b.sql, '[numero]', 'other', null, '2026-10-29T00:00:00Z'))).toBe('23514')
    await expect(runScript(b.sql, 'marker-phones.sql')).rejects.toThrow(/ya se ejecuto/)
  })
})

// ---- (8) 0042 ----------------------------------------------------------------------------------------------------
describe.skipIf(!RUN)('0042: increment_follow_up_count por clave y solo Ava, y ventana de 24 h de ambiguous (Postgres embebido 17.6)', () => {
  let b: Bench
  let s: Seed
  let ava: string

  beforeAll(async () => {
    b = await startBench({ p04: true })
    s = await seedAgents(b.sql)
    ava = await contact(b.sql, '+18095550101', 'ctwa_ad', s.jenny.id, '2026-10-28T00:00:00Z')
    await contact(b.sql, '+543624123456', 'lead_form', s.jenny.id, '2026-10-01T00:00:00Z')
    await contact(b.sql, '543624123456', 'other', s.joanny.id, '2026-10-02T00:00:00Z')
  })
  afterAll(async () => { await b?.stop() })

  const followUps = async (id: string) =>
    count(b.sql, 'select coalesce(follow_up_count, 0)::int n from public.contacts where id = $1', [id])
  const ambiguousAfterTwoCalls = async () => {
    await b.sql`truncate public.contact_match_events`
    for (let i = 0; i < 2; i++) {
      const r = await resolveContact(b.sql, AVA, { phone: '+5493624123456', key: '5493624123456', rr: true })
      expect(r.outcome).toBe('ambiguous')
    }
    return count(b.sql, `select count(*)::int n from public.contact_match_events where kind = 'ambiguous'`)
  }
  const agente = () => AGENTE(s.joanny.email, s.joanny.id)

  it('CONTROL NEGATIVO con las funciones de prod: el wa_id sin + no sube el contador, un agente cualquiera si puede llamarla, y cada llamada ambigua deja un evento', async () => {
    await asRole(b.sql, AVA, (t) => t`select public.increment_follow_up_count('18095550101')`)
    expect(await followUps(ava)).toBe(0)
    await asRole(b.sql, agente(), (t) => t`select public.increment_follow_up_count('+18095550101')`)
    expect(await followUps(ava)).toBe(1)
    await b.sql`update public.contacts set follow_up_count = 0 where id = ${ava}`
    expect(await ambiguousAfterTwoCalls()).toBe(2)
  })

  it('0042: el contador sube por clave canonica (con y sin +), solo para Ava y service_role, y la segunda llamada ambigua no deja evento', async () => {
    await applyMigration(b.sql, F0042)
    await applyMigration(b.sql, F0042) // idempotente
    await asRole(b.sql, AVA, (t) => t`select public.increment_follow_up_count('18095550101')`)
    await asRole(b.sql, AVA, (t) => t`select public.increment_follow_up_count('+18095550101')`)
    await asRole(b.sql, SERVICE, (t) => t`select public.increment_follow_up_count('18095550101')`)
    expect(await followUps(ava)).toBe(3)
    expect(await codeOf(asRole(b.sql, agente(), (t) => t`select public.increment_follow_up_count('18095550101')`))).toBe('42501')
    await asRole(b.sql, AVA, (t) => t`select public.increment_follow_up_count('1234567890')`)
    expect(await count(b.sql, 'select coalesce(sum(follow_up_count), 0)::int n from public.contacts')).toBe(3)
    expect(await ambiguousAfterTwoCalls()).toBe(1)
  })

  it('0042: resolve_contact difiere de 0035 solo en el bloque de ambiguous', async () => {
    const up = readSql(path.join(REPO, 'migrations', F0042))
    const src = readSql(path.join(REPO, 'migrations', '0035_resolve_contact.sql'))
    const fn = (text: string) => {
      const i = text.indexOf('create or replace function public.resolve_contact(')
      return text.slice(i, text.indexOf('$$;', text.indexOf('as $$', i)) + 3)
    }
    // El bloque de variantes (paso 5): 'elsif cardinality(v_ids) > 1' aparece tambien en el paso 4.
    const start = '    elsif cardinality(v_ids) > 1 then\n'
    const tail = "      return query select 'ambiguous'"
    const at = (t: string) => t.indexOf(start, t.indexOf('-- (5) variantes por pais'))
    expect(at(fn(up))).toBeGreaterThan(0)
    expect(at(fn(src))).toBeGreaterThan(0)
    const cut = (t: string) => t.slice(0, at(t)) + t.slice(t.indexOf(tail, at(t)))
    expect(cut(fn(up))).toBe(cut(fn(src)))
    expect(fn(up)).not.toBe(fn(src))
  })

  it('0042-down devuelve los cuerpos de prod', async () => {
    await runDown(b.sql, '0042-down.sql')
    const [r] = await b.sql<{ rc: string; inc: string }[]>`
      select (select md5(prosrc) from pg_proc where oid = 'public.resolve_contact(text,text,text,text,text,text,boolean,boolean)'::regprocedure) rc,
             (select md5(prosrc) from pg_proc where oid = 'public.increment_follow_up_count(text)'::regprocedure) inc`
    expect(r).toEqual({ rc: '150ed8e45a8981935275599a519c84c3', inc: '7217501e00f10335d0984480cff3ba1d' })
  })
})
