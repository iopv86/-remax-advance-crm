-- 0038_agents_write_guard.sql
--
-- Cierra la escalada de agents_update_self: un agente (rol authenticated, no admin) podia hacer
--   PATCH /rest/v1/agents?id=eq.<suyo>  {"role":"admin"}
-- y pasar a admin de todo el CRM. Medido el 2026-10-25 en prod (solo SELECT):
--   agents_update_self   FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid()): no restringe columnas.
--   agents_write_admin   FOR ALL USING/CHECK is_privileged_user() = role in (admin, manager) SIN mirar is_active:
--                        un manager (o un admin inactivo) cambia el role de cualquiera, inserta una fila admin con el
--                        id de un usuario de auth sin fila (hay 5, uno es Ava) o borra al admin.
--   authenticated y anon con todos los privilegios de tabla (arwdDxtm), sin ACL por columna.
-- Columnas que deciden permisos (todas las politicas y funciones de todos los schemas): role (is_admin,
-- is_admin_or_manager, is_privileged_user, politica de round robin), is_active (is_admin, is_admin_or_manager) y email
-- (agent_integrations, contacts_insert_own y round robin comparan agents.email con el email del JWT).
--
-- Por que un trigger y no ACL por columna ni WITH CHECK:
--   - El privilegio de columna vale para TODO el rol authenticated: updateAgent (settings/actions.ts:214) cambia role
--     y objectives-client.tsx:38 los objetivos con el cliente de USUARIO, asi que revocar esas columnas rompe al admin.
--   - Las politicas permisivas se combinan con OR (un manager pasa por agents_write_admin aunque se endurezca
--     agents_update_self), el WITH CHECK no ve OLD y una subconsulta a agents en una politica de agents recursa.
--
-- Reglas de public.agents_write_guard() (BEFORE INSERT OR UPDATE OR DELETE, FOR EACH ROW):
--   1. current_user in (postgres, service_role, supabase_admin) -> permite: son los roles con bypassrls que escriben
--      (inviteAgent y deleteAgent usan service_role; la cascada desde auth.users corre como el dueno de agents =
--      postgres, medido). Lista de PERMITIDOS: un rol nuevo queda fuera por defecto.
--   2. is_admin() -> permite (admin activo: gestiona agentes igual que hoy).
--   3. auth.uid() nulo, o INSERT/DELETE -> 42501 (ningun flujo de la app los hace con el cliente de usuario).
--   4. UPDATE: solo pueden cambiar las columnas de una lista de PERMITIDAS (una columna futura queda protegida):
--        siempre      updated_at (lo fija trg_agents_updated)
--        fila propia  full_name, phone, whatsapp_number, avatar_url, instagram_url, facebook_url, linkedin_url,
--                     tiktok_url (profile-client.tsx:306 y :327) e is_active (set-password/page.tsx:44)
--        admin/manager activo  captaciones_objetivo, facturacion_objetivo en cualquier fila (objectives-client.tsx)
--      Comparacion por VALOR (to_jsonb(NEW) - K IS DISTINCT FROM to_jsonb(OLD) - K): reenviar un valor sin cambios
--      pasa, y un NULL que cambia tambien se detecta.
--   5. is_active solo puede pasar de false a true y en la propia fila: es el onboarding (inviteAgent inserta con
--      is_active=false; auth/confirm manda a set-password). RIESGO ACEPTADO: alguien desactivado a mano podria
--      reactivarse; hoy la app no desactiva (borrar = deleteAgent) y is_active=false apenas restringe.
--
-- Trampas:
--   - SECURITY INVOKER a proposito: con DEFINER current_user seria el dueno y la regla 1 lo dejaria pasar todo.
--     Por lo mismo, una funcion SECURITY DEFINER futura que escriba en agents esquiva este guard.
--   - current_user, nunca session_user (es authenticator con PostgREST y postgres en el banco).
--   - El nombre trg_agents_zz_* hace que dispare despues de trg_agents_updated (orden alfabetico): ve la fila final.
--   - TRUNCATE no dispara triggers de fila y la RLS no lo cubre: se revoca a anon y authenticated (no hay endpoint de
--     PostgREST para TRUNCATE, pero no hay razon para que lo tengan).
--   - ALTER DEFAULT PRIVILEGES da EXECUTE a anon/authenticated en toda funcion nueva (0029): se revoca. Disparar un
--     trigger no comprueba EXECUTE sobre su funcion (medido en 0029 FASE A).
--
-- Aditiva y de permisos: 1 funcion, 1 trigger y revokes. No toca ninguna fila. Rollback: rollback/0038-down.sql.
-- Fuera de alcance: is_privileged_user ignora is_active en ~70 politicas.
--
-- CREATE TRIGGER toma SHARE ROW EXCLUSIVE sobre agents (bloquea escrituras mientras espera). `set local` solo vale
-- dentro de una transaccion: si el runner no la abre, se aborta aqui ANTES de cualquier DDL.
set local lock_timeout = '3s';
do $$
begin
  if current_setting('lock_timeout') <> '3s' then
    raise exception '0038: lock_timeout no aplicado (la migracion debe correr dentro de una transaccion)';
  end if;
end $$;

create function public.agents_write_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_allowed text[] := array['updated_at'];
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or coalesce(public.is_admin(), false) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if v_uid is null or tg_op <> 'UPDATE' then
    raise exception 'agents: escritura no autorizada' using errcode = '42501';
  end if;

  if old.id = v_uid then
    v_allowed := v_allowed || array['full_name', 'phone', 'whatsapp_number', 'avatar_url', 'instagram_url',
                                    'facebook_url', 'linkedin_url', 'tiktok_url', 'is_active'];
  end if;
  if coalesce(public.is_admin_or_manager(), false) then
    v_allowed := v_allowed || array['captaciones_objetivo', 'facturacion_objetivo'];
  end if;

  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'agents: escritura no autorizada' using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active
     and not (old.id = v_uid and old.is_active = false and new.is_active = true) then
    raise exception 'agents: escritura no autorizada' using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke execute on function public.agents_write_guard() from public, anon, authenticated;

create trigger trg_agents_zz_write_guard
  before insert or update or delete on public.agents
  for each row execute function public.agents_write_guard();

revoke insert, update, delete, truncate, references, trigger, maintain on table public.agents from anon;
revoke truncate, references, trigger, maintain on table public.agents from authenticated;
