-- migrations/rollback/D01-P01-down.sql
--
-- Reversion de D01-P01 (0034-0037), en orden inverso. Probada en el banco: deja la huella de contacts, deals y sus
-- funciones igual a tests/db/fixtures/contacts-fingerprint.pre.prod.json.
--
-- DESTRUCTIVA: borra las filas de contact_match_events, agent_lead_notifications y agent_time_notifications y las
-- columnas preferred_contact_time de contacts y deals. Mientras P02 y P03 no esten desplegados, el codigo de la app
-- no depende de nada de esto; despues, revertir exige revertir antes esos despliegues (usan estas RPC).
--
-- create_intake_deal vuelve al cuerpo EXACTO de prod antes de 0036 (leido del catalogo el 2026-10-24). Ojo: el
-- fichero 0033 del repo no coincide byte a byte con prod (los comentarios del cuerpo aplicado estan en espanol y los
-- del repo en ingles); por eso no se re-ejecuta 0033, sino el cuerpo de prod.
--
-- NO borra lo que las funciones nuevas escribieron en tablas que ya existian: las campanitas de notifications
-- (types 'preferred_contact_time' y 'client_returned'), las notas de activities ('Volvio por campana') y los
-- desarchivados de contacts quedan como estan.
--
-- Funciona con o sin 0037 aplicada (drop ... if exists). Los drop column toman ACCESS EXCLUSIVE sobre contacts y deals.
set local lock_timeout = '3s';

-- 0037
alter table public.contacts drop constraint if exists contacts_phone_no_marker;

-- 0036
drop function if exists public.notify_agent_client_returned(uuid);
drop function if exists public.record_preferred_contact_time(uuid, text);
drop table if exists public.agent_time_notifications;
alter table public.deals drop column if exists preferred_contact_time;
alter table public.contacts drop column if exists preferred_contact_time;
drop function if exists public.record_campaign_return(uuid, text);
drop function if exists public.mark_agent_lead_notification(bigint, boolean, text, text, uuid, boolean);
drop function if exists public.claim_agent_lead_notifications(int);
CREATE OR REPLACE FUNCTION public.create_intake_deal(p_contact_id uuid, p_agent_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_existing uuid;
  v_new      uuid;
begin
  -- Se libera solo al terminar la transaccion de esta llamada.
  perform pg_advisory_xact_lock(hashtext(p_contact_id::text));

  select id into v_existing
  from deals
  where contact_id = p_contact_id
    and stage in ('nuevo_sin_contactar', 'lead_captured')
  limit 1;

  if v_existing is not null then
    return null;   -- ya hay uno abierto: NO se notifica otra vez
  end if;

  insert into deals (contact_id, agent_id, stage, currency)
  values (p_contact_id, p_agent_id, 'nuevo_sin_contactar', 'USD')
  returning id into v_new;

  return v_new;
end;
$function$;

revoke all on function public.create_intake_deal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_intake_deal(uuid, uuid) to service_role;
drop table if exists public.agent_lead_notifications;

-- 0035
drop function if exists public.resolve_deal_agent(uuid);
drop function if exists public.resolve_contact(text, text, text, text, text, text, boolean, boolean);
drop function if exists public.rr_agent_with_retry();
drop function if exists public.contact_survivor(uuid[]);
drop table if exists public.contact_match_events;

-- 0034
drop index if exists public.contacts_phone_key_idx;
drop index if exists public.contacts_phone_match_gin;
alter table public.contacts drop column if exists phone_match, drop column if exists phone_key;
drop function if exists public.phone_variants(text);
drop function if exists public.phone_match_set(text, text);
drop function if exists public.phone_key(text);
drop function if exists public.phone_digits_ok(text);

notify pgrst, 'reload schema';
