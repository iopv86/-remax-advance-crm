-- migrations/rollback/0041-down.sql
--
-- Reversion de 0041_assign_next_rr_agent_service_only: devuelve EXECUTE a authenticated (ACL de prod antes de 0041:
-- postgres=X, authenticated=X, service_role=X). Necesaria antes de revertir D01-P03 (el codigo viejo de Ava llamaba a
-- assign_next_rr_agent como authenticated). REABRE que cualquier autenticado gaste turnos del round-robin. No toca
-- filas ni el cuerpo. Idempotente. Ejecutar como postgres.
set local lock_timeout = '3s';
do $$
begin
  if current_setting('lock_timeout') <> '3s' then
    raise exception '0041-down: lock_timeout no aplicado (debe correr dentro de una transaccion)';
  end if;
end $$;

grant execute on function public.assign_next_rr_agent() to authenticated;

do $$
declare
  v_oid oid := to_regprocedure('public.assign_next_rr_agent()');
begin
  if (select array_agg(s.g order by s.g collate "C")
        from (select distinct case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end as g
                from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
               where p.oid = v_oid and x.privilege_type = 'EXECUTE') s)
     is distinct from array['authenticated', 'postgres', 'service_role'] then
    raise exception '0041-down: postcondicion: se esperan postgres, authenticated y service_role';
  end if;
end $$;

notify pgrst, 'reload schema';
