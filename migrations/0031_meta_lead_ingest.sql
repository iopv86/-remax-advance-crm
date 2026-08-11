-- 0031_meta_lead_ingest.sql
--
-- Per-lead ingestion ledger: one row per Meta leadgen id, EVER, including the
-- ones that never became a contact.
--
-- Why contacts.meta_lead_id cannot serve this purpose:
--   1. It is a scalar. One person who fills two forms produces two lead ids and
--      exactly one contact row, so leads 2..N are unrepresentable.
--   2. A lead dropped for lack of an agent creates no contact at all, so the
--      contacts table cannot express "we saw this lead and dropped it" -- which
--      is precisely the fact the reconciler needs in order to alert.
--
-- Written by lib/meta-lead-ledger.ts (intake) and /api/cron/lead-audit
-- (reconciliation). Service-role only.
--
-- Purely additive: creates one new table and its indexes. Nothing is renamed or
-- dropped, so this migration is safe to apply BEFORE the deploy.

create table if not exists meta_lead_ingest (
  lead_id       text primary key,        -- Meta leadgen id: the canonical unit of "a lead"
  form_id       text,
  created_time  timestamptz,             -- Meta's time_created, NOT our ingest time
  contact_id    uuid references contacts(id) on delete set null,
  deal_id       uuid references deals(id) on delete set null,
  agent_id      uuid references agents(id) on delete set null,
  outcome       text not null,
  source        text not null,           -- poll | webhook | audit
  alerted_at    timestamptz,             -- set ONLY after an alert was confirmed sent
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- Audit window scan: leads by Meta creation time, newest first.
create index if not exists meta_lead_ingest_created_idx
  on meta_lead_ingest (created_time desc);

-- Failures still awaiting an alert.
create index if not exists meta_lead_ingest_open_idx
  on meta_lead_ingest (outcome) where alerted_at is null;

-- Deny-all: no policies are created, so only the service role can reach it.
alter table meta_lead_ingest enable row level security;

-- ALTER DEFAULT PRIVILEGES in this project grants anon and authenticated FULL
-- CRUD on every new table in public. RLS with no policies already denies row
-- access, but leaving the GRANT in place means any future permissive policy
-- would open the whole table. Remove the privilege as well as the policy.
-- Safe for 'authenticated' in this specific case: the table is new and only the
-- service role touches it (lib/meta-lead-ledger.ts and /api/cron/lead-audit).
revoke all on table public.meta_lead_ingest from anon;
revoke all on table public.meta_lead_ingest from authenticated;

comment on table meta_lead_ingest is
  'Ledger of every Meta leadgen id seen and what happened to it. Service-role only. Read by /api/cron/lead-audit.';

comment on column meta_lead_ingest.outcome is
  'new_contact | existing_contact_new_deal | already_in_pipeline | race_winner | no_agent | insert_error | no_insert | not_ingested. Deliberately NOT a CHECK constraint: an unlisted value must never make the ledger throw and break the intake it exists to observe.';

comment on column meta_lead_ingest.alerted_at is
  'Set only when the alert send returned success. A failed send leaves this NULL so the next audit retries it.';

-- Seed the ledger with everything already ingested. Without this the first
-- /api/cron/lead-audit run compares Meta's last 48h against an empty ledger,
-- declares every pre-existing lead missing, and fires a "systemic" alert on hour
-- one. An alert that cries wolf on day one is an alert nobody reads on day
-- thirty -- and this project already lost three weeks to a notifier nobody
-- trusted. Idempotent.
insert into meta_lead_ingest (lead_id, contact_id, agent_id, deal_id, created_time, outcome, source)
select c.meta_lead_id, c.id, c.agent_id,
       (select d.id from deals d where d.contact_id = c.id order by d.created_at limit 1),
       c.created_at, 'backfilled', 'audit'
from contacts c
where c.meta_lead_id is not null
on conflict (lead_id) do nothing;
