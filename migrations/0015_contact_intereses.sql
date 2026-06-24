-- 0015_contact_intereses.sql
-- Session 1A: complete the lead "intereses" data model.
--
-- Adds: multi-select property type (property_types property_type[]),
--       operation_type, condition, desired_amenities. Wires the existing
--       bedrooms column CRM-side (no DDL needed here).
--
-- Strategy "A-prime" (Architect-validated): DB-only, no app/Ava deploy on the
-- critical path. A bidirectional mirror in the trigger keeps the legacy scalar
-- property_type_interest and the new property_types array in sync, so the
-- currently-deployed scalar editor and Ava keep working untouched. The scalar
-- column is retired in a later cleanup (1C).
--
-- Gate logic (council-locked) is UNCHANGED except property_type becomes
-- array-aware: "scalar IS NOT NULL" -> "array has >=1 element". The new columns
-- (operation_type, condition, desired_amenities, bedrooms) are NOT gate inputs.
--
-- Ground truth (verified against prod zlnqsgepzfghlmsfolko):
--   contacts.property_type_interest is the property_type ENUM (not text).
--   contacts.timeline is timeline_type ENUM. contacts.bedrooms int4 exists.

-- ── 1. New enums (idempotent) ───────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'operation_type') then
    create type operation_type as enum ('buy', 'sell', 'rent');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'property_condition') then
    create type property_condition as enum ('ready', 'under_construction', 'any');
  end if;
end $$;

-- ── 2. Multi-select property type: additive array column + backfill ─────────
alter table contacts
  add column if not exists property_types property_type[];

-- Backfill: wrap each existing scalar enum value into a single-element array.
-- (property_type_interest is already the property_type enum -> no cast.)
update contacts
set property_types = array[property_type_interest]
where property_type_interest is not null
  and property_types is null;

-- ── 3. New intereses columns ────────────────────────────────────────────────
alter table contacts
  add column if not exists operation_type    operation_type,
  add column if not exists condition         property_condition,
  add column if not exists desired_amenities text[] not null default '{}'::text[];

comment on column contacts.property_types is
  'Multi-select property types of interest (property_type[]). Canonical; supersedes scalar property_type_interest (kept as auto-synced mirror until 1C).';
comment on column contacts.operation_type is
  'Buyer intent: buy | sell | rent. NOT a qualification gate input.';
comment on column contacts.condition is
  'Desired build state: ready | under_construction | any. NOT a gate input.';
comment on column contacts.desired_amenities is
  'Desired amenities as property has_* keys (vocabulary = migration 0006). NOT a gate input.';

-- ── 4. Array-aware gate (same logic; property_type -> property_type[]) ───────
-- Drop the old overload explicitly: changing an argument type creates a SECOND
-- overload rather than replacing, which would let the stale signature linger.
drop function if exists contact_qualification_gate(
  numeric, numeric, property_type, text[], timeline_type
);

create or replace function contact_qualification_gate(
  p_budget_min   numeric,
  p_budget_max   numeric,
  p_property_types property_type[],
  p_locations    text[],
  p_timeline     timeline_type
) returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select
        (coalesce(p_budget_min, 0) > 0 OR coalesce(p_budget_max, 0) > 0)
    AND (coalesce(array_length(p_property_types, 1), 0) >= 1
         OR coalesce(array_length(p_locations, 1), 0) >= 1)
    AND (p_timeline IS NOT NULL AND p_timeline <> 'exploring');
$$;

-- ── 5. Trigger fn: bidirectional mirror + array-aware gate call ─────────────
create or replace function apply_auto_qualification()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Bidirectional mirror so the legacy scalar and the array never drift,
  -- regardless of which side a writer touches. Array wins when both present.
  if NEW.property_types is not null then
    if coalesce(array_length(NEW.property_types, 1), 0) >= 1 then
      NEW.property_type_interest := NEW.property_types[1];
    else
      NEW.property_type_interest := null;   -- explicit empty array
    end if;
  elsif NEW.property_type_interest is not null then
    NEW.property_types := array[NEW.property_type_interest];
  end if;

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

-- ── 6. Re-create trigger watching BOTH the array and the legacy scalar ──────
drop trigger if exists trg_auto_qualification on contacts;
create trigger trg_auto_qualification
before insert or update of
  budget_min, budget_max, property_types, property_type_interest,
  preferred_locations, timeline, qualification_source
on contacts
for each row
execute function apply_auto_qualification();

-- ── 7. Recompute backfill (auto rows only) using the array gate ─────────────
update contacts
set lead_classification = case
      when contact_qualification_gate(budget_min, budget_max, property_types,
                                      preferred_locations, timeline)
        then 'cold'::lead_classification else 'unqualified'::lead_classification end,
    lead_status = case
      when contact_qualification_gate(budget_min, budget_max, property_types,
                                      preferred_locations, timeline)
        then 'qualified'::lead_status else lead_status end
where qualification_source = 'auto';
