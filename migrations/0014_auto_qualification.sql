-- 0014_auto_qualification.sql
-- Auto-qualification of the lead_classification badge.
--
-- Model (locked by council + owner 2026-06-24):
--   * When a contact meets a sentinel-aware completeness GATE, the auto engine
--     promotes lead_classification 'unqualified' -> 'cold' (neutral floor) and
--     sets lead_status -> 'qualified'.
--   * Auto NEVER assigns warm/hot (temperature stays the agent's / Ava's call).
--   * Auto NEVER overrides a manual or Ava-set classification. A provenance
--     column (qualification_source) distinguishes them.
--   * Auto values stay recomputable (data lost -> revert cold->unqualified,
--     qualified->new). No ratchet. manual/ava are frozen.
--   * The old 6-weight score_* engine (calculate_lead_score / classify_lead /
--     update_contact_score) is KEPT but made dormant: its trigger is dropped.
--
-- GATE: real budget AND (real property_type OR >=1 zona) AND timeline <> 'exploring'.

-- 1. Provenance enum + column ------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'qualification_source') then
    create type qualification_source as enum ('auto', 'manual', 'ava');
  end if;
end$$;

alter table contacts
  add column if not exists qualification_source qualification_source not null default 'auto';

-- 2. Shared, sentinel-aware gate helper (single source of truth) -------------
-- IMMUTABLE so it can be reused by the trigger and the backfill without drift.
create or replace function contact_qualification_gate(
  p_budget_min numeric,
  p_budget_max numeric,
  p_property_type property_type,
  p_locations text[],
  p_timeline timeline_type
) returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select
        (coalesce(p_budget_min, 0) > 0 OR coalesce(p_budget_max, 0) > 0)
    AND (p_property_type IS NOT NULL
         OR coalesce(array_length(p_locations, 1), 0) >= 1)
    AND (p_timeline IS NOT NULL AND p_timeline <> 'exploring');
$$;

-- 3. BEFORE-row trigger function --------------------------------------------
create or replace function apply_auto_qualification()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Provenance freeze: manual / ava rows are authoritative. Leave untouched.
  if NEW.qualification_source <> 'auto' then
    return NEW;
  end if;

  if contact_qualification_gate(
       NEW.budget_min, NEW.budget_max, NEW.property_type_interest,
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

-- 4. Swap triggers -----------------------------------------------------------
-- Drop the old score_* engine trigger (root cause of the unqualified-clobber
-- bug). The functions stay in the schema, dormant and recoverable.
drop trigger if exists trg_contact_score on contacts;

drop trigger if exists trg_auto_qualification on contacts;
create trigger trg_auto_qualification
before insert or update of
  budget_min, budget_max, property_type_interest, preferred_locations,
  timeline, qualification_source
on contacts
for each row
execute function apply_auto_qualification();

-- 5. One-time backfill (idempotent; auto rows only) --------------------------
update contacts
set lead_classification = case
      when contact_qualification_gate(budget_min, budget_max, property_type_interest,
                                      preferred_locations, timeline)
        then 'cold'::lead_classification
        else 'unqualified'::lead_classification
    end,
    lead_status = case
      when contact_qualification_gate(budget_min, budget_max, property_type_interest,
                                      preferred_locations, timeline)
        then 'qualified'::lead_status
        else lead_status   -- leave new/contacted/nurturing/... untouched on gate fail
    end
where qualification_source = 'auto';
