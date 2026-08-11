-- 0033_create_intake_deal_atomic.sql
--
-- createIntakeDeal was a check-then-insert with NO constraint behind it: two
-- concurrent processLead runs against the SAME contact could both pass the
-- SELECT before either committed, create TWO intake deals, and fire TWO agent
-- notifications (WhatsApp, and now email as well).
--
-- This is not hypothetical. Contact 57b921f0-d01f-465f-88e8-b9b0b8db0f34 ("Liz")
-- carries two lead_captured deals created ten minutes apart on 2026-07-10 by the
-- same agent -- a real instance of exactly this race.
--
-- The unique index that would close it (deals_one_open_intake_per_contact,
-- drafted in 0032) CANNOT be applied yet: resolving that existing duplicate is a
-- business decision, not a migration's call. A per-contact advisory lock
-- serializes concurrent callers without touching a single existing row, and
-- stays correct once the index does land.
--
-- The lock is taken on the CONTACT, not the table, so leads for different
-- contacts still process in parallel.
--
-- Purely additive: creates one function. Nothing renamed or dropped.

create or replace function public.create_intake_deal(p_contact_id uuid, p_agent_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing uuid;
  v_new      uuid;
begin
  -- Released automatically when this call's transaction ends.
  perform pg_advisory_xact_lock(hashtext(p_contact_id::text));

  select id into v_existing
  from deals
  where contact_id = p_contact_id
    and stage in ('nuevo_sin_contactar', 'lead_captured')
  limit 1;

  if v_existing is not null then
    return null;   -- one is already open: do NOT notify again
  end if;

  insert into deals (contact_id, agent_id, stage, currency)
  values (p_contact_id, p_agent_id, 'nuevo_sin_contactar', 'USD')
  returning id into v_new;

  return v_new;
end;
$function$;

-- SECURITY DEFINER: service role only. Without these revokes any authenticated
-- user could mint arbitrary deals -- the same residual this project already
-- carries on other definer functions.
revoke all on function public.create_intake_deal(uuid, uuid) from public;
revoke all on function public.create_intake_deal(uuid, uuid) from anon;
revoke all on function public.create_intake_deal(uuid, uuid) from authenticated;
grant execute on function public.create_intake_deal(uuid, uuid) to service_role;
