// F4 (E01): public.mark_project_dispatched(uuid, timestamptz) es SECURITY DEFINER y en prod la ejecuta authenticated:
// un agente o Ava la llama con p_dispatched_at = 2099 y el proyecto deja de estar debido para siempre (el orquestador
// no lo vuelve a despachar y Ava sirve precios viejos sin error). 0039 versiona la funcion literal de prod y deja
// EXECUTE solo a service_role (unico consumidor: el orquestador, con la secret key).
//
// Mismo arnes para el par positivo/negativo: la tabla CASES corre con LA MISMA funcion contra
//   G = banco con fixtures/projects-dispatch.pre.sql + 0039 (debe cerrar) y
//   N = el mismo banco SIN 0039 (control negativo: reproduce prod y demuestra que el hueco existe).
// Tras cada caso se lee public.projects como postgres: si se permitio, la fila objetivo cambia y la otra no; si se
// rechazo, la tabla queda identica y el mensaje es el del ACL de la funcion (la unica capa que se prueba).
// Mutantes SQL: el texto de 0039 (o de 0039-down) se muta en memoria (cada sustitucion exactamente 1 vez) y se aplica a
// un banco nuevo o a un banco compartido (los que fallan revierten; la huella o el catalogo lo comprueban entre uno y
// otro); el fichero real nunca se escribe. Solo datos sinteticos (zz-*, @test.local): el repo es publico.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  RUN, SERVICE, ANON, AVA, AGENTE, startBench, seedAgents, asRole, codeOf, readSql, fixturePath, migrationPath,
  type Bench, type Identity, type Seed, type StartOptions,
} from './helpers/bench'

const ALLOW = null
const DENY = '42501'
const MIG = '0039_mark_project_dispatched_service_only.sql'
const DOWN = 'rollback/0039-down.sql'
const PRE = fixturePath('projects-dispatch-fingerprint.pre.prod.json')
const POST = fixturePath('projects-dispatch-fingerprint.post.prod.json')
const SIG = 'public.mark_project_dispatched(uuid, timestamptz)'
// md5(prosrc) medido en prod el 2026-10-28 (solo SELECT).
const MD5_PROD = '0a23fcb82e5290a22624194a44e032d1'
const DENIED = /permission denied for function mark_project_dispatched/
const START = '2026-01-01T00:00:00Z'
const AT = '2026-03-15T12:00:00Z'
const FAR = '2099-01-01T00:00:00Z'
const WITH_FIXTURE: StartOptions = { projectsDispatch: true }
const WITHOUT_0039: StartOptions = { projectsDispatch: true, without: [MIG] }
const ROLLED_BACK = 'zz: aplicada y revertida'
const CAT_SERVICE_ONLY = {
  n: 1, anon: false, auth: false, svc: true, pub: 0,
  prosecdef: true, proconfig: ['search_path=public'], owner: 'postgres', md5: MD5_PROD,
}

// Sentencias de 0039 que sustituyen los mutantes (cada una debe aparecer exactamente 1 vez en la migracion).
const REVOKE = `revoke execute on function ${SIG} from public, anon, authenticated;`
const REVOKE_MS1A = `revoke execute on function ${SIG} from public, anon;`
const AUTH_CHECK = "has_function_privilege('authenticated', v_oid, 'EXECUTE')"
const SET_CHECK = "is distinct from array['postgres', 'service_role'] then"
const CREATE_HEAD = 'CREATE OR REPLACE FUNCTION public.mark_project_dispatched('
const BODY = "last_sync_status = 'dispatched'"
const GRANT_SERVICE = `grant execute on function ${SIG} to service_role;`
// Y de 0039-down.
const GRANT_AUTH = 'to authenticated;'

interface Ctx { seed: Seed; a: string; b: string }
interface ProjectRow { id: string; slug: string; at: string | null; status: string | null }
type Snap = ProjectRow[]

interface Case {
  name: string
  /** null = postgres directo (superusuario, como las migraciones). */
  who: ((c: Ctx) => Identity) | null
  at: string
  expectG: string | null
  expectN: string | null
}

// ---- Utilidades ---------------------------------------------------------------------------------------------
const CALL = 'select public.mark_project_dispatched($1::uuid, $2::timestamptz)'
const jenny = (c: Ctx): Identity => AGENTE(c.seed.jenny.email, c.seed.jenny.id)

async function seedWorld(b: Bench): Promise<Ctx> {
  const seed = await seedAgents(b.sql)
  await b.sql`truncate public.projects`
  const a = randomUUID()
  const other = randomUUID()
  await b.sql`insert into public.projects (id, slug, last_synced_at, last_sync_status)
              values (${a}, 'zz-proyecto-a', ${START}, 'ok'), (${other}, 'zz-proyecto-b', ${START}, 'ok')`
  return { seed, a, b: other }
}

async function snapshot(b: Bench): Promise<Snap> {
  const rows = await b.sql<ProjectRow[]>`
    select id::text as id, slug, to_char(last_synced_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at,
           last_sync_status as status
      from public.projects order by slug collate "C"`
  return rows.map((r) => ({ ...r }))
}

interface Cat {
  n: number; anon: boolean; auth: boolean; svc: boolean; pub: number
  prosecdef: boolean; proconfig: string[] | null; owner: string; md5: string; oid: number
}
async function catalog(b: Bench): Promise<Cat> {
  const rows = await b.sql<Cat[]>`
    select (select count(*)::int from pg_proc
             where pronamespace = 'public'::regnamespace and proname = 'mark_project_dispatched') as n,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as svc,
           (select count(*)::int from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
             where x.grantee = 0) as pub,
           p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner)::text as owner, md5(p.prosrc) as md5, p.oid::int as oid
      from pg_proc p where p.oid = to_regprocedure(${SIG})`
  if (rows.length !== 1) throw new Error(`${SIG} no existe`)
  return { ...rows[0] }
}

async function fingerprint(b: Bench): Promise<unknown> {
  const rows = await b.sql.unsafe(readSql(fixturePath('projects-dispatch-fingerprint.sql')))
  return rows[0].fp
}
const fromFile = (f: string) => (JSON.parse(readFileSync(f, 'utf8')) as { fp: unknown }).fp

const migText = () => readSql(migrationPath(MIG))
const downText = () => readSql(migrationPath(DOWN))
const applyText = (b: Bench, text: string) => b.sql.begin((t) => t.unsafe(text))

/** Aplica `text` en una transaccion que SIEMPRE revierte; devuelve el mensaje del error (ROLLED_BACK si no lanzo). */
async function messageOf(b: Bench, text: string): Promise<string> {
  try {
    await b.sql.begin(async (t) => {
      await t.unsafe(text)
      throw new Error(ROLLED_BACK)
    })
  } catch (e) {
    return (e as Error).message
  }
  throw new Error('messageOf: la transaccion no revirtio')
}

/** Sustituye `from` por `to` exigiendo exactamente 1 aparicion (un mutante que no muta nada no prueba nada). */
function mutate(src: string, from: string, to: string): string {
  const n = src.split(from).length - 1
  if (n !== 1) throw new Error(`mutante: "${from}" aparece ${n} veces (se exige 1)`)
  return src.replace(from, () => to)
}

async function absent(b: Bench): Promise<boolean> {
  const [r] = await b.sql<{ absent: boolean }[]>`select to_regprocedure(${SIG}) is null as absent`
  return r.absent
}

async function withBench<T>(opts: StartOptions, fn: (b: Bench) => Promise<T>): Promise<T> {
  const b = await startBench(opts)
  try {
    return await fn(b)
  } finally {
    await b.stop()
  }
}

// ---- Casos ------------------------------------------------------------------------------------------------------
const AGENT_CASE: Case = {
  name: 'un agente (authenticated con id) ya no puede marcar el proyecto',
  who: jenny, at: AT, expectG: DENY, expectN: ALLOW,
}
const CASES: Case[] = [
  { name: 'service_role (el orquestador) marca el proyecto', who: () => SERVICE, at: AT, expectG: ALLOW, expectN: ALLOW },
  { name: 'postgres marca el proyecto', who: null, at: AT, expectG: ALLOW, expectN: ALLOW },
  AGENT_CASE,
  {
    name: 'un agente con fecha 2099 no congela el proyecto (en N queda en 2099: el hueco)',
    who: jenny, at: FAR, expectG: DENY, expectN: ALLOW,
  },
  { name: 'Ava (authenticated, info@) ya no puede marcar el proyecto', who: () => AVA, at: AT, expectG: DENY, expectN: ALLOW },
  {
    name: 'anon no puede marcar el proyecto (el fixture replica el revoke de 0030 en prod)',
    who: () => ANON, at: AT, expectG: DENY, expectN: DENY,
  },
]

// ---- Ejecucion de un caso (misma funcion para G y N) ------------------------------------------------------------
async function runCase(b: Bench, c: Ctx, k: Case, expected: string | null): Promise<void> {
  const before = await snapshot(b)
  const params = [c.a, k.at]
  let err: { code?: string; message?: string } | null = null
  try {
    if (k.who) await asRole(b.sql, k.who(c), (t) => t.unsafe(CALL, params))
    else await b.sql.unsafe(CALL, params)
  } catch (e) {
    err = e as { code?: string; message?: string }
  }
  const code = err ? (err.code ?? `SIN_CODE: ${err.message}`) : null
  expect(code).toBe(expected)
  const after = await snapshot(b)
  if (expected === null) {
    // permitido: la fila objetivo queda con la fecha pedida y 'dispatched'; la otra no cambia
    expect(after.find((r) => r.id === c.a)).toEqual({ id: c.a, slug: 'zz-proyecto-a', at: k.at, status: 'dispatched' })
    expect(after.find((r) => r.id === c.b)).toEqual(before.find((r) => r.id === c.b))
  } else {
    expect(after).toEqual(before) // rechazado: la tabla queda identica
    expect(err?.message ?? '').toMatch(DENIED) // y lo rechaza el ACL de la funcion, no otra capa
  }
}

// ---- Suite ------------------------------------------------------------------------------------------------------------
describe.skipIf(!RUN)('mark_project_dispatched (0039): banco G con la migracion, banco N sin ella', () => {
  let G: Bench
  let N: Bench

  beforeAll(async () => {
    G = await startBench(WITH_FIXTURE)
    N = await startBench(WITHOUT_0039)
  })
  afterAll(async () => {
    await G?.stop()
    await N?.stop()
  })

  for (const label of ['G', 'N'] as const) {
    describe(`casos contra ${label}${label === 'N' ? ' (control negativo: sin 0039)' : ''}`, () => {
      let ctx: Ctx
      const bench = () => (label === 'G' ? G : N)
      beforeEach(async () => { ctx = await seedWorld(bench()) })
      for (const k of CASES) {
        it(k.name, async () => { await runCase(bench(), ctx, k, label === 'G' ? k.expectG : k.expectN) })
      }
    })
  }

  describe('catalogo (solo G)', () => {
    it('EXECUTE solo para service_role; SECURITY DEFINER, search_path=public, owner postgres, 0 PUBLIC, cuerpo de prod', async () => {
      expect(await catalog(G)).toMatchObject(CAT_SERVICE_ONLY)
    })
  })

  describe('huella de public.mark_project_dispatched y public.projects', () => {
    it('N (sin 0039) tiene la huella de prod antes de 0039 (projects-dispatch-fingerprint.pre.prod.json)', async () => {
      expect(await fingerprint(N)).toEqual(fromFile(PRE))
    })

    it('0039 aplicada dos veces deja la misma huella (idempotente)', async () => {
      await withBench(WITH_FIXTURE, async (b) => {
        expect(b.applied).toContain(MIG)
        const once = await fingerprint(b)
        await applyText(b, migText())
        expect(await fingerprint(b)).toEqual(once)
      })
    })

    it('0039-down.sql dos veces sobre un G nuevo deja la huella igual a la de prod antes de 0039', async () => {
      await withBench(WITH_FIXTURE, async (b) => {
        if (!existsSync(migrationPath(DOWN))) throw new Error(`${DOWN} no existe`)
        expect(b.applied).toContain(MIG)
        await applyText(b, readSql(migrationPath(DOWN)))
        await applyText(b, readSql(migrationPath(DOWN)))
        expect(await fingerprint(b)).toEqual(fromFile(PRE))
      })
    })

    it('G tiene la huella de prod tras aplicar 0039 (projects-dispatch-fingerprint.post.prod.json)', async () => {
      expect(await fingerprint(G)).toEqual(fromFile(POST))
    })
  })

  describe('oid y camino nuevo', () => {
    it('aplicar 0039 sobre N conserva el oid (sustitucion en sitio, nunca DROP)', async () => {
      await withBench(WITHOUT_0039, async (b) => {
        const before = await catalog(b)
        await applyText(b, migText())
        expect((await catalog(b)).oid).toBe(before.oid)
      })
    })

    it('camino nuevo (startBench sin fixture): la funcion nace solo para service_role y con el cuerpo de prod', async () => {
      await withBench({}, async (b) => {
        expect(b.applied).toContain(MIG)
        expect(await catalog(b)).toMatchObject(CAT_SERVICE_ONLY)
      })
    })
  })

  describe('precondicion: cada rama aborta sin cambiar nada y, neutralizada, dejaria pasar 0039', () => {
    const ALTERED = `create or replace function public.mark_project_dispatched(p_id uuid, p_dispatched_at timestamp with time zone default now())
 returns void language plpgsql security definer set search_path to 'public'
as $function$
BEGIN
  UPDATE projects SET last_sync_status = 'alterado' WHERE id = p_id;
END;
$function$`
    const APPLIES = new RegExp(`^${ROLLED_BACK}$`)

    interface PreCase {
      name: string; setup: string; reason: RegExp; branch: string; neutral: string
      /** Que hace 0039 con la rama neutralizada (por defecto: se aplica entera). */
      mutant?: RegExp
    }
    const PRE_CASES: PreCase[] = [
      {
        name: 'otra firma con el mismo nombre (sobrecarga)',
        setup: "create function public.mark_project_dispatched(p text) returns void language sql as 'select 1'",
        reason: /0039: precondicion: 2 funciones/,
        branch: 'if v_n > 1 or (v_n = 1 and v_oid is null) then', neutral: 'if false then',
      },
      {
        name: 'SECURITY INVOKER', setup: `alter function ${SIG} security invoker`,
        reason: /0039: precondicion: no es SECURITY DEFINER/, branch: 'if not v_p.prosecdef then', neutral: 'if false then',
      },
      {
        // Sin la rama la frena la postcondicion por conjunto (el ACL pasa a nombrar al owner nuevo).
        name: 'owner distinto de postgres', setup: `alter function ${SIG} owner to service_role`,
        reason: /0039: precondicion: owner service_role/, branch: "if v_p.owner <> 'postgres' then", neutral: 'if false then',
        mutant: /0039: postcondicion: EXECUTE para roles distintos/,
      },
      {
        name: 'search_path distinto', setup: `alter function ${SIG} set search_path = public, pg_temp`,
        reason: /0039: precondicion: proconfig/,
        branch: "if v_p.proconfig is distinct from array['search_path=public'] then", neutral: 'if false then',
      },
      {
        name: 'cuerpo distinto (md5)', setup: ALTERED, reason: /0039: precondicion: md5 del cuerpo/,
        branch: `if v_p.body_md5 <> '${MD5_PROD}' then`, neutral: 'if false then',
      },
      {
        name: 'una funcion SQL estandar depende de ella (pg_depend)',
        setup: `create function public.zz_cita_std() returns void language sql
begin atomic select public.mark_project_dispatched(gen_random_uuid(), now()); end`,
        reason: /0039: precondicion: un objeto depende/,
        branch: 'if exists (select 1 from pg_depend', neutral: 'if false and exists (select 1 from pg_depend',
      },
      {
        name: 'una politica la cita',
        setup: `create policy zz_cita on public.projects for select to authenticated
using (current_setting('zz.x', true) is distinct from 'mark_project_dispatched')`,
        reason: /0039: precondicion: una politica cita/,
        branch: 'if exists (select 1 from pg_policies', neutral: 'if false and exists (select 1 from pg_policies',
      },
      {
        name: 'otra funcion plpgsql la llama',
        setup: `create function public.zz_cita() returns void language plpgsql
as $$ begin perform public.mark_project_dispatched(gen_random_uuid(), now()); end $$`,
        reason: /0039: precondicion: otra funcion cita/,
        branch: 'if exists (select 1 from pg_proc p where p.oid is distinct from v_oid',
        neutral: 'if false and exists (select 1 from pg_proc p where p.oid is distinct from v_oid',
      },
    ]

    for (const c of PRE_CASES) {
      it(`${c.name}: 0039 aborta (${c.reason.source}) sin cambiar el catalogo; sin la rama, ${(c.mutant ?? APPLIES).source}`, async () => {
        await withBench(WITHOUT_0039, async (b) => {
          await b.sql.unsafe(c.setup)
          const before = await catalog(b)
          await expect(applyText(b, migText())).rejects.toThrow(c.reason)
          expect(await catalog(b)).toEqual(before)
          expect(await messageOf(b, mutate(migText(), c.branch, c.neutral))).toMatch(c.mutant ?? APPLIES)
          expect(await catalog(b)).toEqual(before)
        })
      })
    }
  })

  describe('postcondicion por conjunto de titulares', () => {
    it('un rol fuera de la lista con EXECUTE: 0039 aborta sin cambiar nada y la huella (acl_full) lo ve', async () => {
      await withBench(WITHOUT_0039, async (b) => {
        await b.sql.unsafe('create role zz_extra nologin')
        await b.sql.unsafe(`grant execute on function ${SIG} to zz_extra`)
        const before = await catalog(b)
        await expect(applyText(b, migText())).rejects.toThrow(/0039: postcondicion: EXECUTE para roles distintos/)
        expect(await catalog(b)).toEqual(before)
        expect(await fingerprint(b)).not.toEqual(fromFile(PRE))
      })
    })
  })

  describe('mutantes SQL de 0039 (texto mutado en memoria; el fichero real no se escribe)', () => {
    describe('los que fallan al aplicar (comparten banco: huella == pre antes y despues de cada uno)', () => {
      let M: Bench
      beforeAll(async () => { M = await startBench(WITHOUT_0039) })
      afterAll(async () => { await M?.stop() })
      beforeEach(async () => { expect(await fingerprint(M)).toEqual(fromFile(PRE)) })

      it('MS1a revoke solo de public, anon: MATADO por la postcondicion (authenticated conserva EXECUTE)', async () => {
        await expect(applyText(M, mutate(migText(), REVOKE, REVOKE_MS1A))).rejects.toThrow(/0039: postcondicion/)
        expect(await fingerprint(M)).toEqual(fromFile(PRE))
      })

      it("MS3 cuerpo con 'dispatched_x': MATADO por la postcondicion (md5 distinto del de prod)", async () => {
        await expect(applyText(M, mutate(migText(), BODY, "last_sync_status = 'dispatched_x'")))
          .rejects.toThrow(/0039: postcondicion/)
        expect(await fingerprint(M)).toEqual(fromFile(PRE))
      })

      it('CRLF: la migracion con fin de linea CRLF falla cerrada en la postcondicion (cambia el md5) y no deja nada', async () => {
        await expect(applyText(M, migText().replace(/\n/g, '\r\n'))).rejects.toThrow(/0039: postcondicion: cuerpo/)
        expect(await fingerprint(M)).toEqual(fromFile(PRE))
      })
    })

    it('MS1b = MS1a sin las comprobaciones de authenticated y por conjunto: aplica y el agente marca; MATADO por el caso agente de G', async () => {
      await withBench(WITHOUT_0039, async (b) => {
        const text = mutate(mutate(mutate(migText(), REVOKE, REVOKE_MS1A), AUTH_CHECK, 'false'),
          SET_CHECK, "is distinct from array['postgres', 'service_role'] and false then")
        await applyText(b, text)
        const ctx = await seedWorld(b)
        expect(AGENT_CASE.expectG).toBe(DENY)
        expect(await codeOf(asRole(b.sql, jenny(ctx), (t) => t.unsafe(CALL, [ctx.a, AT])))).toBe(ALLOW)
        expect((await snapshot(b)).find((r) => r.id === ctx.a)?.status).toBe('dispatched')
      })
    })

    describe('revoke incompleto en un banco nuevo sin fixture (PUBLIC y anon nacen con EXECUTE; cada uno revierte)', () => {
      let F: Bench
      beforeAll(async () => { F = await startBench({ without: [MIG] }) })
      afterAll(async () => { await F?.stop() })
      beforeEach(async () => { expect(await absent(F)).toBe(true) })

      for (const [id, from] of [['MS5', 'anon, authenticated'], ['MS6', 'public, authenticated']] as const) {
        it(`${id} revoke solo de ${from}: MATADO por la postcondicion`, async () => {
          const text = mutate(migText(), REVOKE, `revoke execute on function ${SIG} from ${from};`)
          await expect(applyText(F, text)).rejects.toThrow(/0039: postcondicion/)
          expect(await absent(F)).toBe(true)
        })
      }
    })

    it('MS2 DROP + CREATE: aplica (la postcondicion pasa) pero el oid cambia; MATADO por la prueba del oid', async () => {
      await withBench(WITHOUT_0039, async (b) => {
        const before = await catalog(b)
        await applyText(b, mutate(migText(), CREATE_HEAD, `DROP FUNCTION ${SIG};\nCREATE FUNCTION public.mark_project_dispatched(`))
        expect((await catalog(b)).oid).not.toBe(before.oid)
      })
    })

    it('MS4 sin grant a service_role: EQUIVALENTE (en prod el grant es explicito y en un banco nuevo lo dan los default privileges)', async () => {
      const text = mutate(migText(), GRANT_SERVICE, '')
      await withBench(WITHOUT_0039, async (b) => {
        await applyText(b, text)
        expect(await catalog(b)).toMatchObject({ anon: false, auth: false, svc: true, pub: 0 })
      })
      await withBench({ without: [MIG] }, async (b) => {
        await applyText(b, text)
        expect(await catalog(b)).toMatchObject({ anon: false, auth: false, svc: true, pub: 0 })
      })
    })
  })

  describe('mutantes de 0039-down (comparten un banco G: cada uno revierte)', () => {
    let D: Bench
    beforeAll(async () => { D = await startBench(WITH_FIXTURE) })
    afterAll(async () => { await D?.stop() })

    for (const [id, to] of [['MD1', 'to authenticated, anon;'], ['MD2', 'to public;']] as const) {
      it(`${id} rollback que concede ${to.slice(3, -1)}: MATADO por la postcondicion de 0039-down`, async () => {
        const before = await fingerprint(D)
        await expect(applyText(D, mutate(downText(), GRANT_AUTH, to))).rejects.toThrow(/0039-down: postcondicion/)
        expect(await fingerprint(D)).toEqual(before)
      })
    }
  })
})
