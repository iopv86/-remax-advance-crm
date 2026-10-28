-- 0039_mark_project_dispatched_service_only.sql
--
-- Cierra F4 (E01): public.mark_project_dispatched(uuid, timestamptz) es SECURITY DEFINER y la ejecuta cualquier
-- autenticado. Un agente o Ava (rol authenticated) llama
--   POST /rest/v1/rpc/mark_project_dispatched  {"p_id": "<proyecto>", "p_dispatched_at": "2099-01-01"}
-- y el proyecto queda con last_synced_at en 2099: el orquestador no lo vuelve a ver debido, no se sincroniza nunca mas
-- y Ava sirve disponibilidad y precios viejos sin un solo error. Es el mismo ataque que 0030 (:42-48) cerro para anon.
--
-- Estado medido en prod el 2026-10-28 (solo SELECT): una sola funcion con ese nombre; owner postgres; SECURITY
-- DEFINER; proconfig {search_path=public}; md5(prosrc) 0a23fcb82e5290a22624194a44e032d1; proacl
-- {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} (anon false, authenticated TRUE,
-- service_role true); ningun objeto depende de ella (pg_depend) y ninguna politica ni otra funcion la cita; es la unica
-- funcion de public que escribe en projects. Su definicion no estaba en ningun fichero del repo (solo los revoke de
-- 0029 y 0030), y la tabla projects tampoco: en una base nueva la funcion nace apuntando a una tabla que puede no
-- existir (plpgsql no la resuelve al crearla).
-- Unico consumidor: n8n/orchestrator/orchestrator.py (Railway, cron horario) con la secret key, es decir el rol
-- service_role (edge logs de 24 h: todas las llamadas con esa clave; ningun otro llamador). Quitar EXECUTE a
-- authenticated no le afecta: una secret key sin JWT de usuario nunca es authenticated.
--
-- Que hace (todo en la transaccion de la migracion; si algo falla no queda nada):
--   1. Precondicion: si la funcion existe debe ser la medida (una sola con ese nombre, definer, owner postgres,
--      search_path y md5 del cuerpo) y nada debe depender de ella ni citarla (pg_depend, politicas y cuerpos de otras
--      funciones). Si no, aborta sin tocar nada.
--   2. Versiona la funcion con el texto literal de pg_get_functiondef: mismo cuerpo y mismo md5. Se sustituye en sitio
--      a proposito: conserva ACL, owner y oid. Borrarla y crearla de nuevo resetearia el ACL a los default privileges
--      (0029:144-146: anon recupera EXECUTE) y cambiaria el oid.
--   3. EXECUTE solo para service_role. El revoke nombra PUBLIC, anon y authenticated: en una base nueva la funcion
--      nace con EXECUTE para anon y authenticated por ALTER DEFAULT PRIVILEGES (0029:13-16) y para PUBLIC por el
--      default de funciones; en prod el grant a service_role ya es explicito y se repite para la base nueva.
--   4. Postcondicion: anon y authenticated sin EXECUTE, service_role con EXECUTE, los titulares de EXECUTE son
--      exactamente postgres (owner) y service_role (un grant a PUBLIC o a cualquier otro rol aborta), y el mismo
--      cuerpo, definer y search_path. Si no, aborta.
-- Idempotente: aplicarla dos veces deja el mismo catalogo. No toca ninguna fila.
-- Independiente de 0037 (D01-P04, sin aplicar en prod al 2026-10-28): ninguna de las dos depende de la otra.
-- Rollback: rollback/0039-down.sql (devuelve EXECUTE a authenticated: reabre F4).
-- Se aplica con fin de linea LF: con CRLF el cuerpo cambia de md5 y la postcondicion aborta (falla cerrada).
--
-- `set local` solo vale dentro de una transaccion: si el runner no la abre, se aborta aqui ANTES de cualquier DDL.
set local lock_timeout = '3s';
do $$
begin
  if current_setting('lock_timeout') <> '3s' then
    raise exception '0039: lock_timeout no aplicado (la migracion debe correr dentro de una transaccion)';
  end if;
end $$;

-- 1. Precondicion.
do $$
declare
  v_oid oid := to_regprocedure('public.mark_project_dispatched(uuid, timestamptz)');
  v_n int;
  v_p record;
begin
  select count(*) into v_n
    from pg_proc where pronamespace = 'public'::regnamespace and proname = 'mark_project_dispatched';
  if v_n > 1 or (v_n = 1 and v_oid is null) then
    raise exception '0039: precondicion: % funciones public.mark_project_dispatched (se espera 0, o 1 con la firma (uuid, timestamptz))', v_n;
  end if;
  if v_oid is not null then
    select p.prosecdef, pg_get_userbyid(p.proowner)::text as owner, p.proconfig, md5(p.prosrc) as body_md5
      into v_p from pg_proc p where p.oid = v_oid;
    if not v_p.prosecdef then
      raise exception '0039: precondicion: no es SECURITY DEFINER';
    end if;
    if v_p.owner <> 'postgres' then
      raise exception '0039: precondicion: owner % (se espera postgres)', v_p.owner;
    end if;
    if v_p.proconfig is distinct from array['search_path=public'] then
      raise exception '0039: precondicion: proconfig % (se espera {search_path=public})', v_p.proconfig;
    end if;
    if v_p.body_md5 <> '0a23fcb82e5290a22624194a44e032d1' then
      raise exception '0039: precondicion: md5 del cuerpo % (no es el medido en prod)', v_p.body_md5;
    end if;
    if exists (select 1 from pg_depend
                where refclassid = 'pg_proc'::regclass and refobjid = v_oid and deptype = 'n') then
      raise exception '0039: precondicion: un objeto depende de mark_project_dispatched (pg_depend)';
    end if;
  end if;
  if exists (select 1 from pg_policies
              where coalesce(qual, '') ~* 'mark_project_dispatched' or coalesce(with_check, '') ~* 'mark_project_dispatched') then
    raise exception '0039: precondicion: una politica cita mark_project_dispatched';
  end if;
  if exists (select 1 from pg_proc p where p.oid is distinct from v_oid and p.prosrc ~* 'mark_project_dispatched') then
    raise exception '0039: precondicion: otra funcion cita mark_project_dispatched';
  end if;
end $$;

-- 2. Texto literal de pg_get_functiondef en prod (2026-10-28).
CREATE OR REPLACE FUNCTION public.mark_project_dispatched(p_id uuid, p_dispatched_at timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE projects
  SET last_synced_at  = p_dispatched_at,
      last_sync_status = 'dispatched'
  WHERE id = p_id;
END;
$function$;

-- 3. ACL.
revoke execute on function public.mark_project_dispatched(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_project_dispatched(uuid, timestamptz) to service_role;

-- 4. Postcondicion.
do $$
declare
  v_oid oid := to_regprocedure('public.mark_project_dispatched(uuid, timestamptz)');
begin
  if v_oid is null then
    raise exception '0039: postcondicion: la funcion no existe';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception '0039: postcondicion: anon conserva EXECUTE';
  end if;
  if has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception '0039: postcondicion: authenticated conserva EXECUTE';
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception '0039: postcondicion: service_role sin EXECUTE';
  end if;
  -- Por conjunto y no por nombre: un EXECUTE para PUBLIC o para un rol que nadie enumero tambien aborta.
  if (select array_agg(s.g order by s.g collate "C")
        from (select distinct case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end as g
                from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
               where p.oid = v_oid and x.privilege_type = 'EXECUTE') s)
     is distinct from array['postgres', 'service_role'] then
    raise exception '0039: postcondicion: EXECUTE para roles distintos de postgres y service_role';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = v_oid and p.prosecdef and p.proconfig = array['search_path=public']
                    and md5(p.prosrc) = '0a23fcb82e5290a22624194a44e032d1') then
    raise exception '0039: postcondicion: cuerpo, prosecdef o proconfig distintos de los medidos en prod';
  end if;
end $$;

notify pgrst, 'reload schema';
