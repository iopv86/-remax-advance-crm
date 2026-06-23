-- 0013_lead_form_and_editor_fields.sql
-- B-16: full-page editors + Meta Lead Form answer capture.
-- Adds the minimal set of columns with no existing home on `contacts`.
-- (intereses→purpose, zona→preferred_locations[], notas→agent_notes,
--  presupuesto→budget_*, tipo→property_type_interest already exist.)

alter table contacts add column if not exists decision_maker text;
alter table contacts add column if not exists linked_property_id uuid
  references properties(id) on delete set null;
alter table contacts add column if not exists lead_form_answers jsonb;

create index if not exists idx_contacts_linked_property
  on contacts (linked_property_id)
  where linked_property_id is not null;

comment on column contacts.decision_maker is
  'Who makes the buying decision (e.g. self, spouse, family, company).';
comment on column contacts.linked_property_id is
  'Contact-level property of interest (FK properties.id, set null on delete).';
comment on column contacts.lead_form_answers is
  'Full Meta Lead Form field_data captured at intake: { lead_id, form_id, captured_at, fields: [{ name, label, values[] }] }. Lossless source of truth for the answered questions.';
