-- migrations/rollback/0039-down.sql
--
-- Reversion de 0039_mark_project_dispatched_service_only. Probada en el banco: deja la huella igual a
-- tests/db/fixtures/projects-dispatch-fingerprint.pre.prod.json (ACL de prod antes de 0039:
-- postgres=X, authenticated=X, service_role=X).
--
-- REABRE F4: cualquier autenticado (agentes, Ava) vuelve a poder congelar un proyecto con una fecha futura. El cuerpo
-- que 0039 versiono no cambia. Nunca DROP (resetearia el ACL a los default privileges y el oid), nunca anon ni
-- PUBLIC: la postcondicion lo comprueba y aborta si no. No toca filas. Idempotente (un grant repetido no cambia el
-- ACL). Ejecutar como postgres (el grantor queda registrado en el ACL).
set local lock_timeout = '3s';
do $$
begin
  if current_setting('lock_timeout') <> '3s' then
    raise exception '0039-down: lock_timeout no aplicado (debe correr dentro de una transaccion)';
  end if;
end $$;

grant execute on function public.mark_project_dispatched(uuid, timestamptz) to authenticated;

-- Postcondicion: los titulares de EXECUTE son exactamente los de prod antes de 0039.
do $$
declare
  v_oid oid := to_regprocedure('public.mark_project_dispatched(uuid, timestamptz)');
begin
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception '0039-down: postcondicion: se espera EXECUTE para authenticated y service_role y no para anon';
  end if;
  if (select array_agg(s.g order by s.g collate "C")
        from (select distinct case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end as g
                from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
               where p.oid = v_oid and x.privilege_type = 'EXECUTE') s)
     is distinct from array['authenticated', 'postgres', 'service_role'] then
    raise exception '0039-down: postcondicion: EXECUTE para roles distintos de postgres, authenticated y service_role';
  end if;
end $$;

notify pgrst, 'reload schema';
