// Escalada en prod: la politica agents_update_self no restringe columnas y authenticated tiene UPDATE de tabla
// (un agente se pone role='admin'); agents_write_admin (is_privileged_user, sin mirar is_active) deja a un manager
// cambiar roles, insertar una fila admin o borrar al admin. La migracion 0038 agrega el trigger
// trg_agents_zz_write_guard (BEFORE INSERT OR UPDATE OR DELETE, FOR EACH ROW) y recorta el ACL de la tabla.
//
// Mismo arnes para el par positivo/negativo: la tabla CASES corre con LA MISMA funcion contra
//   G = banco con 0038 (debe proteger) y N = banco SIN 0038 (control negativo: demuestra que el hueco existe).
// Tras cada caso se lee public.agents como postgres: si se permitio, el efecto persiste; si dio 42501, la tabla
// queda identica. Identidades SIEMPRE con id (AGENTE(email, id)): sin id auth.uid() es nulo y un negativo pasaria
// sin probar nada. Todo lo que corre fuera de asRole es postgres (exento del guard).
// Solo datos sinteticos (@test.local): el repo es publico.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  RUN, SERVICE, ANON, AGENTE, startBench, seedAgents, asRole, readSql, fixturePath, migrationPath,
  type Bench, type Identity,
} from './helpers/bench'

const ALLOW = null
const DENY = '42501'
const DOWN = 'rollback/0038-down.sql'
const POST = fixturePath('agents-fingerprint.post.prod.json')

interface Person { id: string; email: string; name: string }
interface Ctx {
  jenny: Person; joanny: Person; admin: Person
  manager: Person; guest: Person; inactiveAdmin: Person; orphan: Person
}
type Row = Record<string, unknown>
type Snap = Row[]
type Sqlish = { text: string; params: string[] }

interface Case {
  name: string
  /** null = postgres directo. */
  who: ((c: Ctx) => Identity) | null
  run: (c: Ctx) => Sqlish
  expectG: string | null
  expectN: string | null
  /** Se evalua solo si el caso se permitio: el cambio debe persistir. */
  effect: (after: Snap, before: Snap, c: Ctx) => boolean
  rows?: number
  /** Si se permite, el llamador debe quedar con public.is_admin() = true (es LA escalada). */
  escalates?: boolean
  /** Capa que debe rechazar en G (por defecto el guard): se exige su mensaje, no solo el SQLSTATE. */
  reason?: 'guard' | 'acl'
  pre?: (b: Bench) => Promise<void>
  post?: (b: Bench) => Promise<void>
}

// ---- Utilidades ---------------------------------------------------------------------------------------------
const me = (p: Person): Identity => AGENTE(p.email, p.id)
const find = (s: Snap, id: string): Row | undefined => s.find((r) => r.id === id)
const unchanged = (after: Snap, before: Snap) => JSON.stringify(after) === JSON.stringify(before)
const upd = (target: Person, set: string, ...vals: string[]): Sqlish => ({
  text: `update public.agents set ${set} where id = $${vals.length + 1}::uuid returning id`,
  params: [...vals, target.id],
})
const ROLE = (r: string) => `role = '${r}'::public.agent_role`

async function snapshot(b: Bench): Promise<Snap> {
  const rows = await b.sql.unsafe('select to_jsonb(a) as j from public.agents a order by a.id')
  return rows.map((r) => r.j as Row)
}

async function addPerson(b: Bench, name: string, role: string, active: boolean, withRow: boolean): Promise<Person> {
  const p: Person = { id: randomUUID(), email: `${name.toLowerCase().replace(/\s+/g, '.')}@test.local`, name }
  await b.sql`insert into auth.users (id) values (${p.id})`
  if (withRow) {
    await b.sql`insert into public.agents (id, email, full_name, role, is_active)
                values (${p.id}, ${p.email}, ${p.name}, ${role}::public.agent_role, ${active})`
  }
  return p
}

async function seedWorld(b: Bench): Promise<Ctx> {
  const s = await seedAgents(b.sql)
  const manager = await addPerson(b, 'Manager Prueba', 'manager', true, true)
  const guest = await addPerson(b, 'Invitado Prueba', 'agent', false, true)
  const inactiveAdmin = await addPerson(b, 'Admin Inactivo', 'admin', false, true)
  const orphan = await addPerson(b, 'Huerfano Auth', 'agent', true, false)
  await b.sql`update public.agents set max_leads_per_week = null, captaciones_objetivo = null`
  return { jenny: s.jenny, joanny: s.joanny, admin: s.admin, manager, guest, inactiveAdmin, orphan }
}

// Roles NO exentos creados por el propio test (exentos son solo postgres, service_role y supabase_admin).
const ROLE_NAME = /^zz_[a-z_]+$|^rogue$/
const checkName = (name: string) => { if (!ROLE_NAME.test(name)) throw new Error(`nombre de rol invalido: ${name}`) }
const createRole = (name: string, grants: string) => async (b: Bench) => {
  checkName(name)
  await b.sql.unsafe(
    `do $$ begin create role ${name} nologin; exception when duplicate_object then null; end $$;
     grant usage on schema public, auth to ${name}; ${grants}`,
  )
}
// Tolera un pre a medias: si el rol no llego a crearse no hay nada que borrar.
const dropRole = (name: string) => async (b: Bench) => {
  checkName(name)
  await b.sql.unsafe(
    `do $$ begin if exists (select 1 from pg_roles where rolname = '${name}') then
       execute 'drop owned by ${name}'; execute 'drop role ${name}'; end if; end $$`,
  )
}
const asCustomRole = (role: string, p: Person): ((c: Ctx) => Identity) => () =>
  ({ role, claims: { role: 'authenticated', email: p.email, sub: p.id } }) as unknown as Identity

// ---- Casos ----------------------------------------------------------------------------------------------------
const CASES = (): Case[] => [
  // ===== Positivos: lo que la app hace hoy debe seguir pasando =====
  {
    name: 'agente edita su perfil (payload exacto de profile-client.tsx)',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny,
      'full_name = $1, phone = $2, whatsapp_number = $3, instagram_url = $4, facebook_url = $5, linkedin_url = $6, tiktok_url = $7',
      'Jenny Rojas Nueva', '8095550001', '8095550002', 'https://ig.test.local/j', 'https://fb.test.local/j',
      'https://li.test.local/j', 'https://tt.test.local/j'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => {
      const r = find(a, c.jenny.id)
      return r?.full_name === 'Jenny Rojas Nueva' && r?.phone === '8095550001' && r?.whatsapp_number === '8095550002' &&
        r?.instagram_url === 'https://ig.test.local/j' && r?.tiktok_url === 'https://tt.test.local/j'
    },
  },
  {
    name: 'agente cambia su avatar_url',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, 'avatar_url = $1', 'https://img.test.local/a.png'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.avatar_url === 'https://img.test.local/a.png',
  },
  {
    name: 'invitado activa su cuenta: is_active false -> true (set-password)',
    who: (c) => me(c.guest),
    run: (c) => upd(c.guest, 'is_active = true'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.guest.id)?.is_active === true,
  },
  {
    name: 'agente activo reenvia is_active true -> true',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, 'is_active = true'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.is_active === true,
  },
  {
    name: 'agente reenvia su role actual junto con full_name (comparacion por valor)',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, `full_name = $1, ${ROLE('agent')}`, 'Jenny Reenvio'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.full_name === 'Jenny Reenvio' && find(a, c.jenny.id)?.role === 'agent',
  },
  {
    name: 'admin updateAgent sobre otra fila: full_name, role manager, phone',
    who: (c) => me(c.admin),
    run: (c) => upd(c.joanny, `full_name = $1, ${ROLE('manager')}, phone = $2`, 'Joanny Editada', '8095550003'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.joanny.id)?.role === 'manager' && find(a, c.joanny.id)?.full_name === 'Joanny Editada',
  },
  {
    name: 'admin updateAgent sobre su propia fila con role admin',
    who: (c) => me(c.admin),
    run: (c) => upd(c.admin, `full_name = $1, ${ROLE('admin')}, phone = $2`, 'Admin Editado', '8095550004'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.admin.id)?.full_name === 'Admin Editado' && find(a, c.admin.id)?.role === 'admin',
  },
  {
    name: 'admin fija objetivos de una fila ajena',
    who: (c) => me(c.admin),
    run: (c) => upd(c.jenny, 'captaciones_objetivo = $1, facturacion_objetivo = $2', '12', '350000.50'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.captaciones_objetivo === 12,
  },
  {
    name: 'admin fija objetivos de su propia fila',
    who: (c) => me(c.admin),
    run: (c) => upd(c.admin, 'captaciones_objetivo = $1, facturacion_objetivo = $2', '8', '100000'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.admin.id)?.captaciones_objetivo === 8,
  },
  {
    name: 'manager fija objetivos de una fila ajena',
    who: (c) => me(c.manager),
    run: (c) => upd(c.jenny, 'captaciones_objetivo = $1, facturacion_objetivo = $2', '15', '200000'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.captaciones_objetivo === 15 && Number(find(a, c.jenny.id)?.facturacion_objetivo) === 200000,
  },
  {
    name: 'manager fija objetivos de su propia fila',
    who: (c) => me(c.manager),
    run: (c) => upd(c.manager, 'captaciones_objetivo = $1, facturacion_objetivo = $2', '9', '90000'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.manager.id)?.captaciones_objetivo === 9 && Number(find(a, c.manager.id)?.facturacion_objetivo) === 90000,
  },
  {
    name: 'manager: UPDATE sin WHERE de objetivos toca todas las filas',
    who: (c) => me(c.manager),
    run: () => ({ text: 'update public.agents set captaciones_objetivo = 1, facturacion_objetivo = 1 returning id', params: [] }),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a) => a.length === 6 && a.every((r) => r.captaciones_objetivo === 1 && Number(r.facturacion_objetivo) === 1),
  },
  {
    name: 'admin: UPDATE sin WHERE de objetivos toca todas las filas',
    who: (c) => me(c.admin),
    run: () => ({ text: 'update public.agents set captaciones_objetivo = 2 returning id', params: [] }),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a) => a.length === 6 && a.every((r) => r.captaciones_objetivo === 2),
  },
  {
    name: 'agente: UPDATE sin WHERE de full_name solo toca su fila (RLS) y el guard lo deja',
    who: (c) => me(c.jenny),
    run: () => ({ text: 'update public.agents set full_name = $1 returning id', params: ['Masivo'] }),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, b, c) => find(a, c.jenny.id)?.full_name === 'Masivo' &&
      unchanged(a.filter((r) => r.id !== c.jenny.id), b.filter((r) => r.id !== c.jenny.id)),
    rows: 1,
  },
  {
    // RIESGO ACEPTADO (0038, regla 5): la excepcion de onboarding no distingue "invitado" de "desactivado a mano".
    // Este caso lo fija para que un cambio de la regla no pase sin que alguien lo decida.
    name: 'admin inactivo se reactiva solo y vuelve a ser admin (riesgo aceptado, regla 5 de 0038)',
    who: (c) => me(c.inactiveAdmin),
    run: (c) => upd(c.inactiveAdmin, 'is_active = true'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.inactiveAdmin.id)?.is_active === true,
    escalates: true,
  },
  {
    name: 'manager edita su propio perfil',
    who: (c) => me(c.manager),
    run: (c) => upd(c.manager, 'full_name = $1, phone = $2', 'Manager Editado', '8095550005'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.manager.id)?.full_name === 'Manager Editado',
  },
  {
    name: 'admin inserta una fila de agents con el cliente de usuario (agents_admin_manage)',
    who: (c) => me(c.admin),
    run: (c) => ({
      text: `insert into public.agents (id, email, full_name, role) values ($1::uuid, $2, $3, 'agent'::public.agent_role) returning id`,
      params: [c.orphan.id, c.orphan.email, c.orphan.name],
    }),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.orphan.id)?.role === 'agent',
  },
  {
    name: 'admin borra una fila de agents con el cliente de usuario',
    who: (c) => me(c.admin),
    run: (c) => ({ text: 'delete from public.agents where id = $1::uuid returning id', params: [c.joanny.id] }),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.joanny.id) === undefined,
  },
  {
    name: 'admin desactiva a otro agente y cambia su email',
    who: (c) => me(c.admin),
    run: (c) => upd(c.jenny, 'is_active = false, email = $1', 'jenny.nuevo@test.local'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.is_active === false && find(a, c.jenny.id)?.email === 'jenny.nuevo@test.local',
  },
  {
    name: 'service_role inserta una fila de agents',
    who: () => SERVICE,
    run: (c) => ({
      text: `insert into public.agents (id, email, full_name, role) values ($1::uuid, $2, $3, 'agent'::public.agent_role) returning id`,
      params: [c.orphan.id, c.orphan.email, c.orphan.name],
    }),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.orphan.id)?.role === 'agent',
  },
  {
    name: 'service_role cambia role',
    who: () => SERVICE,
    run: (c) => upd(c.jenny, ROLE('manager')),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.role === 'manager',
  },
  {
    name: 'service_role borra una fila',
    who: () => SERVICE,
    run: (c) => ({ text: 'delete from public.agents where id = $1::uuid returning id', params: [c.joanny.id] }),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.joanny.id) === undefined,
  },
  {
    name: 'postgres directo cambia role',
    who: null,
    run: (c) => upd(c.jenny, ROLE('manager')),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.role === 'manager',
  },
  {
    // Claims de un agente NO admin: si la accion referencial corriera como el llamador (no exento, sin is_admin) el
    // guard daria 42501; pasa porque corre como el dueno de agents (postgres). zz_cascader no tiene nada en agents.
    name: 'cascada: borrar auth.users como rol NO exento (claims de agente) borra la fila de agents',
    who: (c) => asCustomRole('zz_cascader', c.joanny)(c),
    run: (c) => ({ text: 'delete from auth.users where id = $1::uuid returning id', params: [c.jenny.id] }),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id) === undefined && find(a, c.joanny.id) !== undefined,
    pre: createRole('zz_cascader', 'grant select, delete on auth.users to zz_cascader;'),
    post: dropRole('zz_cascader'),
  },

  // ===== Negativos: agente sobre su propia fila =====
  {
    name: 'agente se pone role admin (LA escalada)',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, ROLE('admin')),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.role === 'admin',
    escalates: true,
  },
  {
    name: 'agente cambia su email a la cuenta de Ava',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, 'email = $1', 'info@remaxadvance.com'),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.email === 'info@remaxadvance.com',
  },
  {
    name: 'agente se desactiva: is_active true -> false',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, 'is_active = false'),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.is_active === false,
  },
  {
    name: 'agente cambia max_leads_per_week null -> 5',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, 'max_leads_per_week = 5'),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.max_leads_per_week === 5,
  },
  {
    name: 'agente cambia captaciones_objetivo null -> 10',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, 'captaciones_objetivo = 10'),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.captaciones_objetivo === 10,
  },
  {
    name: 'agente cambia created_at',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, `created_at = '2020-01-01T00:00:00Z'::timestamptz`),
    expectG: DENY, expectN: ALLOW,
    effect: (a, b, c) => find(a, c.jenny.id)?.created_at !== find(b, c.jenny.id)?.created_at,
  },
  {
    name: 'agente cambia su id a un uuid nuevo (en N lo frena el WITH CHECK id = auth.uid())',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, 'id = $1::uuid', randomUUID()),
    expectG: DENY, expectN: DENY,
    effect: () => false,
  },
  {
    name: 'invitado (is_active false) se pone role admin al activarse',
    who: (c) => me(c.guest),
    run: (c) => upd(c.guest, `is_active = true, ${ROLE('admin')}`),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.guest.id)?.role === 'admin',
    escalates: true,
  },
  {
    // En N anon tiene UPDATE de tabla y la RLS lo deja en 0 filas; en G 0038 le revoca la escritura (permission denied).
    name: 'anon intenta UPDATE de un agente',
    who: () => ANON,
    run: (c) => upd(c.jenny, 'full_name = $1', 'Anon'),
    expectG: DENY, expectN: ALLOW,
    effect: (a, b) => unchanged(a, b),
    rows: 0,
    reason: 'acl',
  },
  {
    name: 'columna futura: agente pone zz_future = true',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.jenny, 'zz_future = true'),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.zz_future === true,
    pre: async (b) => { await b.sql.unsafe('alter table public.agents add column zz_future boolean default false') },
    post: async (b) => { await b.sql.unsafe('alter table public.agents drop column if exists zz_future') },
  },
  {
    name: 'rol no exento (rogue) con UPDATE en agents: role -> admin',
    who: (c) => asCustomRole('rogue', c.jenny)(c),
    run: (c) => upd(c.jenny, ROLE('admin')),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.role === 'admin',
    pre: createRole('rogue', 'grant select, update on public.agents to rogue;'),
    post: dropRole('rogue'),
  },

  // ===== Negativos: manager =====
  {
    name: 'manager se pone role admin',
    who: (c) => me(c.manager),
    run: (c) => upd(c.manager, ROLE('admin')),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.manager.id)?.role === 'admin',
    escalates: true,
  },
  {
    name: 'manager cambia el role de otro agente',
    who: (c) => me(c.manager),
    run: (c) => upd(c.jenny, ROLE('manager')),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.role === 'manager',
  },
  {
    name: 'manager cambia el email de otro agente',
    who: (c) => me(c.manager),
    run: (c) => upd(c.jenny, 'email = $1', 'otro@test.local'),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.email === 'otro@test.local',
  },
  {
    name: 'manager cambia el full_name de otro agente',
    who: (c) => me(c.manager),
    run: (c) => upd(c.jenny, 'full_name = $1', 'Nombre Ajeno'),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.full_name === 'Nombre Ajeno',
  },
  {
    name: 'manager cambia is_active de otro agente',
    who: (c) => me(c.manager),
    run: (c) => upd(c.jenny, 'is_active = false'),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.is_active === false,
  },
  {
    name: 'manager inserta una fila role admin con el id de un usuario de auth sin fila',
    who: (c) => me(c.manager),
    run: (c) => ({
      text: `insert into public.agents (id, email, full_name, role) values ($1::uuid, $2, $3, 'admin'::public.agent_role) returning id`,
      params: [c.orphan.id, c.orphan.email, c.orphan.name],
    }),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.orphan.id)?.role === 'admin',
  },
  {
    name: 'manager hace upsert (on conflict do update set role admin) sobre un agente existente',
    who: (c) => me(c.manager),
    run: (c) => ({
      text: `insert into public.agents (id, email, full_name, role) values ($1::uuid, $2, $3, 'agent'::public.agent_role)
             on conflict (id) do update set role = 'admin'::public.agent_role returning id`,
      params: [c.jenny.id, c.jenny.email, c.jenny.name],
    }),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.role === 'admin',
  },
  {
    name: 'manager borra al admin',
    who: (c) => me(c.manager),
    run: (c) => ({ text: 'delete from public.agents where id = $1::uuid returning id', params: [c.admin.id] }),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.admin.id) === undefined,
  },

  // ===== Negativos: admin inactivo =====
  {
    name: 'admin inactivo cambia el role de otro agente',
    who: (c) => me(c.inactiveAdmin),
    run: (c) => upd(c.jenny, ROLE('manager')),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.role === 'manager',
  },
  {
    name: 'admin inactivo inserta una fila role admin',
    who: (c) => me(c.inactiveAdmin),
    run: (c) => ({
      text: `insert into public.agents (id, email, full_name, role) values ($1::uuid, $2, $3, 'admin'::public.agent_role) returning id`,
      params: [c.orphan.id, c.orphan.email, c.orphan.name],
    }),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.orphan.id)?.role === 'admin',
  },
  {
    name: 'admin inactivo borra a otro agente',
    who: (c) => me(c.inactiveAdmin),
    run: (c) => ({ text: 'delete from public.agents where id = $1::uuid returning id', params: [c.jenny.id] }),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id) === undefined,
  },

  // ===== Negativos: otras vias de escritura =====
  {
    // En N lo frena el WITH CHECK de agents_write_admin/admin_manage (el agente no es privilegiado); en G el guard
    // dispara antes (BEFORE ROW va antes que el WITH CHECK) y su mensaje lo demuestra.
    name: 'agente inserta una fila con el id de un usuario de auth sin fila',
    who: (c) => me(c.jenny),
    run: (c) => ({
      text: `insert into public.agents (id, email, full_name, role) values ($1::uuid, $2, $3, 'admin'::public.agent_role) returning id`,
      params: [c.orphan.id, c.orphan.email, c.orphan.name],
    }),
    expectG: DENY, expectN: DENY,
    effect: () => false,
  },
  {
    name: 'agente: MERGE ... when matched then update set role admin',
    who: (c) => me(c.jenny),
    run: (c) => ({
      text: `merge into public.agents a using (select $1::uuid as id) s on a.id = s.id
             when matched then update set role = 'admin'::public.agent_role`,
      params: [c.jenny.id],
    }),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.role === 'admin',
    escalates: true,
  },
  {
    // Rama auth.uid() nulo del guard: solo es alcanzable sin RLS (rol con bypassrls) y sin sub en el JWT.
    name: 'rol no exento con bypassrls y sin sub (auth.uid() nulo) cambia un role',
    who: () => ({ role: 'zz_bypass', claims: { role: 'authenticated' } }) as unknown as Identity,
    run: (c) => upd(c.jenny, ROLE('admin')),
    expectG: DENY, expectN: ALLOW,
    effect: (a, _b, c) => find(a, c.jenny.id)?.role === 'admin',
    pre: createRole('zz_bypass', 'alter role zz_bypass bypassrls; grant select, update on public.agents to zz_bypass;'),
    post: dropRole('zz_bypass'),
  },
  {
    // TRUNCATE no dispara triggers de fila ni lo cubre la RLS: lo cierra el ACL de 0038. El privilegio se comprueba
    // antes que las FK: en N el agente TIENE el privilegio y solo lo frena la FK (0A000); en G lo frena el ACL.
    name: 'agente hace TRUNCATE de agents',
    who: (c) => me(c.jenny),
    run: () => ({ text: 'truncate public.agents', params: [] }),
    expectG: DENY, expectN: '0A000',
    effect: () => false,
    reason: 'acl',
  },
  {
    name: 'anon intenta INSERT de una fila admin',
    who: () => ANON,
    run: (c) => ({
      text: `insert into public.agents (id, email, full_name, role) values ($1::uuid, $2, $3, 'admin'::public.agent_role) returning id`,
      params: [c.orphan.id, c.orphan.email, c.orphan.name],
    }),
    expectG: DENY, expectN: DENY,
    effect: () => false,
    reason: 'acl',
  },
  {
    name: 'anon intenta DELETE de un agente',
    who: () => ANON,
    run: (c) => ({ text: 'delete from public.agents where id = $1::uuid returning id', params: [c.jenny.id] }),
    expectG: DENY, expectN: ALLOW,
    effect: (a, b) => unchanged(a, b),
    rows: 0,
    reason: 'acl',
  },

  // ===== RLS (no es el guard): 0 filas y sin error en ambos =====
  {
    name: 'agente intenta full_name de OTRO agente: RLS filtra, 0 filas y sin error',
    who: (c) => me(c.jenny),
    run: (c) => upd(c.joanny, 'full_name = $1', 'Intento Ajeno'),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, b) => unchanged(a, b),
    rows: 0,
  },
  {
    // Ninguna politica de DELETE alcanza al agente: la fila ni se ve y el guard no llega a disparar.
    name: 'agente intenta borrar su propia fila: RLS filtra, 0 filas y sin error',
    who: (c) => me(c.jenny),
    run: (c) => ({ text: 'delete from public.agents where id = $1::uuid returning id', params: [c.jenny.id] }),
    expectG: ALLOW, expectN: ALLOW,
    effect: (a, b) => unchanged(a, b),
    rows: 0,
  },
]

// ---- Ejecucion de un caso (misma funcion para G y N) ------------------------------------------------------------
// En G un rechazo debe venir de la capa que se prueba: el SQLSTATE 42501 lo dan tambien la RLS (WITH CHECK) y el
// ACL, asi que solo el mensaje distingue al guard (p.ej. el caso de cambiar el id lo frenaria la RLS sin el guard).
const REASON: Record<NonNullable<Case['reason']>, RegExp> = {
  guard: /agents: escritura no autorizada/,
  acl: /permission denied for table agents/,
}

async function runCase(b: Bench, c: Ctx, k: Case, expected: string | null, label: 'G' | 'N'): Promise<void> {
  let failure: unknown = null
  try {
    await k.pre?.(b)
    const before = await snapshot(b)
    const { text, params } = k.run(c)
    let rows: unknown[] = []
    let err: { code?: string; message?: string } | null = null
    try {
      rows = k.who
        ? await asRole(b.sql, k.who(c), (t) => t.unsafe(text, params))
        : await b.sql.unsafe(text, params)
    } catch (e) {
      err = e as { code?: string; message?: string }
    }
    const code = err ? (err.code ?? `SIN_CODE: ${err.message}`) : null
    expect(code).toBe(expected)
    const after = await snapshot(b)
    if (expected === null) {
      expect(k.effect(after, before, c)).toBe(true)
      if (k.rows !== undefined) expect(rows.length).toBe(k.rows)
      if (k.escalates) {
        const r = await asRole(b.sql, k.who!(c), (t) => t.unsafe('select public.is_admin() as a'))
        expect(r[0].a).toBe(true)
      }
    } else {
      expect(after).toEqual(before) // rechazado: la tabla queda identica
      if (label === 'G') expect(err?.message ?? '').toMatch(REASON[k.reason ?? 'guard'])
    }
  } catch (e) {
    failure = e
  }
  // post siempre corre; si falla, no tapa el fallo del caso.
  try {
    await k.post?.(b)
  } catch (e) {
    if (failure === null) failure = e
  }
  if (failure !== null) throw failure
}

// ---- Huella (misma normalizacion que reversion.int.test.ts) ---------------------------------------------------------
type Fp = { functions?: Array<[string, ...unknown[]]> } & Record<string, unknown>
function normalized(fp: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(fp)) as Fp
  copy.functions = (copy.functions ?? []).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return copy
}
async function fingerprint(b: Bench): Promise<unknown> {
  const rows = await b.sql.unsafe(readSql(fixturePath('agents-fingerprint.sql')))
  return normalized(rows[0].fp)
}
const fromFile = (f: string) => normalized((JSON.parse(readFileSync(f, 'utf8')) as { fp: unknown }).fp)

// ---- Suite ------------------------------------------------------------------------------------------------------------
describe.skipIf(!RUN)('agents_write_guard (0038): banco G con la migracion, banco N sin ella', () => {
  let G: Bench
  let N: Bench

  beforeAll(async () => {
    G = await startBench()
    N = await startBench({ without: ['0038_agents_write_guard.sql'] })
  })
  afterAll(async () => {
    await G?.stop()
    await N?.stop()
  })

  for (const label of ['G', 'N'] as const) {
    describe(`casos contra ${label}${label === 'N' ? ' (control negativo: sin 0038)' : ''}`, () => {
      let ctx: Ctx
      const bench = () => (label === 'G' ? G : N)
      beforeEach(async () => { ctx = await seedWorld(bench()) })
      for (const k of CASES()) {
        it(k.name, async () => { await runCase(bench(), ctx, k, label === 'G' ? k.expectG : k.expectN, label) })
      }
    })
  }

  describe('catalogo (solo G)', () => {
    it('agents_write_guard: SECURITY INVOKER, search_path vacio, sin EXECUTE para PUBLIC, anon ni authenticated', async () => {
      const rows = await G.sql<{ prosecdef: boolean; proconfig: string[] | null; oid: number }[]>`
        select p.prosecdef, p.proconfig, p.oid from pg_proc p where p.oid = to_regprocedure('public.agents_write_guard()')`
      expect(rows).toHaveLength(1)
      expect(rows[0].prosecdef).toBe(false)
      expect(rows[0].proconfig).toContain('search_path=""')
      const [priv] = await G.sql<{ anon: boolean; auth: boolean; pub: number }[]>`
        select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
               (select count(*)::int from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0) as pub
          from pg_proc p where p.oid = to_regprocedure('public.agents_write_guard()')`
      expect(priv.anon).toBe(false)
      expect(priv.auth).toBe(false)
      expect(priv.pub).toBe(0)
    })

    it('trg_agents_zz_write_guard: BEFORE INSERT+UPDATE+DELETE, ROW, habilitado y ULTIMO BEFORE ROW por nombre', async () => {
      const rows = await G.sql<{ tgname: string; tgtype: number; tgenabled: string }[]>`
        select tgname, tgtype::int as tgtype, tgenabled::text as tgenabled from pg_trigger
         where tgrelid = 'public.agents'::regclass and not tgisinternal and tgname = 'trg_agents_zz_write_guard'`
      expect(rows).toHaveLength(1)
      // bits de tgtype: 1 ROW, 2 BEFORE, 4 INSERT, 8 DELETE, 16 UPDATE
      expect(rows[0].tgtype & 31).toBe(1 + 2 + 4 + 8 + 16)
      expect(rows[0].tgenabled).toBe('O')
      const before = await G.sql<{ tgname: string }[]>`
        select tgname from pg_trigger
         where tgrelid = 'public.agents'::regclass and not tgisinternal and (tgtype::int & 3) = 3
         order by tgname collate "C" desc limit 1`
      expect(before[0].tgname).toBe('trg_agents_zz_write_guard')
    })

    const PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
    const EXPECT: Record<string, string[]> = {
      anon: ['SELECT'],
      authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
      service_role: PRIVS,
    }
    for (const [role, granted] of Object.entries(EXPECT)) {
      it(`privilegios de tabla de ${role} sobre public.agents: ${granted.join('/')}`, async () => {
        const got: string[] = []
        for (const p of PRIVS) {
          const [r] = await G.sql.unsafe(`select has_table_privilege('${role}', 'public.agents', '${p}') as ok`)
          if (r.ok) got.push(p)
        }
        expect(got).toEqual(granted)
      })
    }
  })

  describe('huella de public.agents', () => {
    it('N (sin 0038) tiene la huella de prod antes de 0038 (agents-fingerprint.pre.prod.json)', async () => {
      expect(await fingerprint(N)).toEqual(fromFile(fixturePath('agents-fingerprint.pre.prod.json')))
    })

    it('0038-down.sql sobre un banco con 0038 deja la huella igual a la de prod antes de 0038', async () => {
      const b = await startBench()
      try {
        if (!existsSync(migrationPath(DOWN))) throw new Error(`${DOWN} no existe`)
        expect(b.skipped).toEqual([])
        // Dos veces: la reversion es idempotente (drop if exists; grant repetido no cambia el ACL).
        await b.sql.begin((t) => t.unsafe(readSql(migrationPath(DOWN))))
        await b.sql.begin((t) => t.unsafe(readSql(migrationPath(DOWN))))
        expect(await fingerprint(b)).toEqual(fromFile(fixturePath('agents-fingerprint.pre.prod.json')))
      } finally {
        await b.stop()
      }
    })

    it.skipIf(!existsSync(POST))('G tiene la huella de prod tras aplicar 0038 (agents-fingerprint.post.prod.json)', async () => {
      expect(await fingerprint(G)).toEqual(fromFile(POST))
    })
  })
})
