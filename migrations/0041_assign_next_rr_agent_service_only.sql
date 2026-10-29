-- 0041_assign_next_rr_agent_service_only.sql
--
-- D01-P04 (pendiente de 0029 Fase C): public.assign_next_rr_agent() es SECURITY DEFINER y avanza el round-robin
-- global. Cualquier autenticado (un agente o Ava) podia llamarla por POST /rest/v1/rpc/assign_next_rr_agent y gastar
-- turnos del RR sin crear ningun contacto, sesgando el reparto.
--
-- Medido en prod el 2026-10-29 (solo SELECT): una sola funcion con ese nombre; SECURITY DEFINER; owner postgres;
-- proconfig {search_path=public}; md5(prosrc) 052b37d9640db64d38b7e605f63a8110; proacl
-- {postgres=X, authenticated=X, service_role=X}. La unica funcion que la cita es rr_agent_with_retry() (definer,
-- owner postgres, EXECUTE solo service_role), que a su vez llaman resolve_contact y resolve_deal_agent (definer): al
-- ejecutarse como su owner no necesitan el EXECUTE de authenticated. Ava no la llama (rg en whatsapp-agentkit/agent:
-- 0 lineas); el CRM la llama solo con service_role (lib/meta-leads.ts assignRrAgent, desde processLead). Edge logs de
-- las ultimas 24 h: 0 peticiones a /rpc/assign_next_rr_agent (control positivo con el mismo filtro: 1513 a
-- /rpc/resolve_contact).
--
-- Que hace (en la transaccion de la migracion):
--   1. Precondicion: la funcion es la medida; todo cuerpo que la cita es de una funcion SECURITY DEFINER de postgres;
--      ninguna politica la cita; ningun objeto depende de ella en pg_depend (un DEFAULT, una vista, un trigger o una
--      columna generada se ejecutan con el rol que escribe y authenticated perderia el EXECUTE; 0 en prod). Si no,
--      aborta sin tocar nada.
--   2. EXECUTE solo para service_role (revoke a PUBLIC, anon y authenticated: en una base nueva nace con EXECUTE para
--      los tres por ALTER DEFAULT PRIVILEGES y el default de funciones).
--   3. Postcondicion por conjunto: los titulares de EXECUTE son exactamente postgres y service_role.
-- No cambia el cuerpo ni el oid. Idempotente. Rollback: migrations/rollback/0041-down.sql.

set local lock_timeout = '3s';
do $$
begin
  if current_setting('lock_timeout') <> '3s' then
    raise exception '0041: lock_timeout no aplicado (la migracion debe correr dentro de una transaccion)';
  end if;
end $$;

-- 1. Precondicion.
do $$
declare
  v_oid oid := to_regprocedure('public.assign_next_rr_agent()');
  v_p record;
begin
  if v_oid is null
     or (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'assign_next_rr_agent') <> 1 then
    raise exception '0041: precondicion: se espera una sola public.assign_next_rr_agent()';
  end if;
  select p.prosecdef, pg_get_userbyid(p.proowner)::text as owner, md5(p.prosrc) as body_md5
    into v_p from pg_proc p where p.oid = v_oid;
  if not v_p.prosecdef or v_p.owner <> 'postgres' or v_p.body_md5 <> '052b37d9640db64d38b7e605f63a8110' then
    raise exception '0041: precondicion: assign_next_rr_agent no es la medida (definer %, owner %, md5 %)',
      v_p.prosecdef, v_p.owner, v_p.body_md5;
  end if;
  if exists (select 1 from pg_proc p
              where p.oid <> v_oid and p.prosrc ~* 'assign_next_rr_agent'
                and (not p.prosecdef or pg_get_userbyid(p.proowner) <> 'postgres')) then
    raise exception '0041: precondicion: una funcion que no es SECURITY DEFINER de postgres llama a assign_next_rr_agent';
  end if;
  if exists (select 1 from pg_policies
              where coalesce(qual, '') ~* 'assign_next_rr_agent' or coalesce(with_check, '') ~* 'assign_next_rr_agent') then
    raise exception '0041: precondicion: una politica cita assign_next_rr_agent';
  end if;
  if exists (select 1 from pg_depend
              where refclassid = 'pg_proc'::regclass and refobjid = v_oid and deptype = 'n') then
    raise exception '0041: precondicion: un objeto depende de assign_next_rr_agent (pg_depend)';
  end if;
end $$;

-- 2. ACL.
revoke execute on function public.assign_next_rr_agent() from public, anon, authenticated;
grant execute on function public.assign_next_rr_agent() to service_role;

-- 3. Postcondicion.
do $$
declare
  v_oid oid := to_regprocedure('public.assign_next_rr_agent()');
begin
  if (select array_agg(s.g order by s.g collate "C")
        from (select distinct case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end as g
                from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
               where p.oid = v_oid and x.privilege_type = 'EXECUTE') s)
     is distinct from array['postgres', 'service_role'] then
    raise exception '0041: postcondicion: EXECUTE para roles distintos de postgres y service_role';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = v_oid and p.prosecdef
                    and md5(p.prosrc) = '052b37d9640db64d38b7e605f63a8110') then
    raise exception '0041: postcondicion: el cuerpo o prosecdef cambiaron';
  end if;
end $$;

notify pgrst, 'reload schema';
