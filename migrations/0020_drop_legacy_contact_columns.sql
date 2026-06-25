-- 0020_drop_legacy_contact_columns.sql
-- Session 3 / Cleanup 1C: retire two dead/legacy contact columns.
--
--   * move_timeline (varchar) — dead. 0 non-null rows in prod, zero code readers
--     (Ava was fixed in 1B to write the `timeline` enum, not this orphan column),
--     no DB function/view/constraint references it.
--   * property_type_interest (property_type ENUM) — legacy scalar, fully superseded
--     by property_types property_type[] (migration 0015). The mirror in
--     apply_auto_qualification() kept them in sync (5/5). All app readers now use
--     the array (CSV export migrated in this same change).
--
-- The qualification gate already takes the ARRAY, so removing the scalar changes
-- NO qualification input — no recompute needed.
--
-- DEPENDENCY NOTE: four legacy reporting views (contacts_active, contacts_archived,
-- contacts_export, contacts_with_email) list property_type_interest in their column
-- set. They are NOT referenced by app code or any DB function (verified) and are
-- stale (missing property_types and every other post-0012 column). To stay
-- minimal-impact we DROP + recreate them WITHOUT the dead column (rather than drop
-- outright) and re-grant the exact pre-existing privileges. (These views run with
-- definer rights and currently expose contacts to anon/authenticated — PRE-EXISTING
-- debt, out of scope for 1C; flagged for a future security pass.)
--
-- ORDER MATTERS: drop dependent views first, rewrite the fn/trigger that reference
-- the scalar, drop the columns, then recreate the views + grants.

-- ── 1. Drop the dependent legacy views ────────────────────────────────────────
drop view if exists contacts_active;
drop view if exists contacts_archived;
drop view if exists contacts_export;
drop view if exists contacts_with_email;

-- ── 2. Rewrite trigger fn: drop the scalar mirror block; keep array-aware gate ──
create or replace function apply_auto_qualification()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Provenance freeze: manual / ava rows are authoritative.
  if NEW.qualification_source <> 'auto' then
    return NEW;
  end if;

  if contact_qualification_gate(
       NEW.budget_min, NEW.budget_max, NEW.property_types,
       NEW.preferred_locations, NEW.timeline
     ) then
    -- Promote only from the neutral floor; never assign warm/hot.
    if NEW.lead_classification = 'unqualified' then
      NEW.lead_classification := 'cold';
    end if;
    NEW.lead_status := 'qualified';
  else
    -- Recompute down: revert only the values the auto engine owns. No ratchet.
    if NEW.lead_classification = 'cold' then
      NEW.lead_classification := 'unqualified';
    end if;
    if NEW.lead_status = 'qualified' then
      NEW.lead_status := 'new';
    end if;
  end if;

  return NEW;
end;
$$;

-- ── 3. Re-create trigger WITHOUT property_type_interest in the watch list ──────
drop trigger if exists trg_auto_qualification on contacts;
create trigger trg_auto_qualification
before insert or update of
  budget_min, budget_max, property_types,
  preferred_locations, timeline, qualification_source
on contacts
for each row
execute function apply_auto_qualification();

-- ── 4. Drop the now-unreferenced legacy columns ───────────────────────────────
alter table contacts drop column if exists property_type_interest;
alter table contacts drop column if exists move_timeline;

-- ── 5. Recreate the legacy views minus the dropped column ─────────────────────
-- Shared column list (property_type_interest removed; move_timeline was never in them).
create view contacts_active as
  select id, agent_id, first_name, last_name, phone, whatsapp_number, email, source,
    source_detail, campaign_id, meta_ad_id, ctwa_clid, lead_score, lead_status,
    lead_classification, score_budget, score_urgency, score_payment, score_location,
    score_property_type, score_purpose, budget_min, budget_max, budget_currency,
    preferred_locations, purpose, payment_method, timeline, is_qualified, qualified_at,
    qualified_by, last_activity_at, last_message_at, next_follow_up_at, follow_up_count,
    ai_summary, agent_notes, tags, language, country, city, is_recruit_candidate,
    created_at, updated_at, assigned_at, reassignment_count, previous_agent_id,
    first_response_at, is_responded, archived_at, wa_opted_out
  from contacts where archived_at is null;

create view contacts_archived as
  select id, agent_id, first_name, last_name, phone, whatsapp_number, email, source,
    source_detail, campaign_id, meta_ad_id, ctwa_clid, lead_score, lead_status,
    lead_classification, score_budget, score_urgency, score_payment, score_location,
    score_property_type, score_purpose, budget_min, budget_max, budget_currency,
    preferred_locations, purpose, payment_method, timeline, is_qualified, qualified_at,
    qualified_by, last_activity_at, last_message_at, next_follow_up_at, follow_up_count,
    ai_summary, agent_notes, tags, language, country, city, is_recruit_candidate,
    created_at, updated_at, assigned_at, reassignment_count, previous_agent_id,
    first_response_at, is_responded, archived_at, wa_opted_out
  from contacts where archived_at is not null;

create view contacts_export as
  select id, agent_id, first_name, last_name, phone, whatsapp_number, email, source,
    source_detail, campaign_id, meta_ad_id, ctwa_clid, lead_score, lead_status,
    lead_classification, score_budget, score_urgency, score_payment, score_location,
    score_property_type, score_purpose, budget_min, budget_max, budget_currency,
    preferred_locations, purpose, payment_method, timeline, is_qualified, qualified_at,
    qualified_by, last_activity_at, last_message_at, next_follow_up_at, follow_up_count,
    ai_summary, agent_notes, tags, language, country, city, is_recruit_candidate,
    created_at, updated_at, assigned_at, reassignment_count, previous_agent_id,
    first_response_at, is_responded, archived_at, wa_opted_out
  from contacts;

create view contacts_with_email as
  select id, agent_id, first_name, last_name, phone, whatsapp_number, email, source,
    source_detail, campaign_id, meta_ad_id, ctwa_clid, lead_score, lead_status,
    lead_classification, score_budget, score_urgency, score_payment, score_location,
    score_property_type, score_purpose, budget_min, budget_max, budget_currency,
    preferred_locations, purpose, payment_method, timeline, is_qualified, qualified_at,
    qualified_by, last_activity_at, last_message_at, next_follow_up_at, follow_up_count,
    ai_summary, agent_notes, tags, language, country, city, is_recruit_candidate,
    created_at, updated_at, assigned_at, reassignment_count, previous_agent_id,
    first_response_at, is_responded, archived_at, wa_opted_out
  from contacts where email is not null and email <> '';

-- ── 6. Restore the exact pre-existing grants ──────────────────────────────────
grant all on contacts_active     to anon, authenticated, service_role;
grant all on contacts_archived   to anon, authenticated, service_role;
grant all on contacts_export     to anon, authenticated, service_role;
grant all on contacts_with_email to anon, authenticated, service_role;
