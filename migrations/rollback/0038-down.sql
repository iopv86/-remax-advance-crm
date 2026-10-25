-- migrations/rollback/0038-down.sql
--
-- Reversion de 0038_agents_write_guard. Probada en el banco: deja la huella de public.agents igual a
-- tests/db/fixtures/agents-fingerprint.pre.prod.json.
--
-- REABRE LA ESCALADA: un agente vuelve a poder ponerse role='admin'. Devuelve tambien a anon la escritura y a
-- anon/authenticated TRUNCATE, REFERENCES, TRIGGER y MAINTAIN, porque asi estaba prod (paridad literal de ACL).
-- No borra ni cambia filas. Idempotente (drop if exists; grant repetido no cambia el ACL). Ejecutar como postgres
-- (el grantor queda registrado en el ACL).
set local lock_timeout = '3s';
do $$
begin
  if current_setting('lock_timeout') <> '3s' then
    raise exception '0038-down: lock_timeout no aplicado (debe correr dentro de una transaccion)';
  end if;
end $$;

drop trigger if exists trg_agents_zz_write_guard on public.agents;
drop function if exists public.agents_write_guard();

grant insert, update, delete, truncate, references, trigger, maintain on table public.agents to anon;
grant truncate, references, trigger, maintain on table public.agents to authenticated;
