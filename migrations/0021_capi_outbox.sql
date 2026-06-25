-- 0021_capi_outbox.sql
-- B-15 CAPI Enhancement: durable outbox for Meta Conversions API events.
-- Replaces synchronous fire-and-forget with enqueue + cron dispatch
-- (/api/cron/capi-dispatch). Written by CRM server code via the service-role
-- adminClient; NEVER exposed to anon/authenticated.

create table if not exists capi_outbox (
  id              uuid primary key default gen_random_uuid(),
  event_id        text not null unique,            -- deterministic dedup + idempotency key
  event_name      text not null,                   -- Lead | ViewContent | InitiateCheckout | Purchase
  action_source   text not null,                   -- 'other' | 'business_messaging'
  contact_id      uuid references contacts(id) on delete set null,
  deal_id         uuid references deals(id) on delete set null,
  payload         jsonb not null,                  -- the single Graph event object (data[0])
  status          text not null default 'pending', -- pending | sent | failed
  attempts        int  not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  next_attempt_at timestamptz not null default now()
);

-- Pending-dispatch query: status='pending' AND next_attempt_at <= now(), oldest first.
create index if not exists capi_outbox_dispatch_idx
  on capi_outbox (next_attempt_at)
  where status = 'pending';

-- D2 gate lookup: "has this contact ever been reported to Meta?"
create index if not exists capi_outbox_contact_idx
  on capi_outbox (contact_id);

-- RLS deny-all: enabling RLS with zero policies blocks anon + authenticated
-- entirely. The service role (adminClient) bypasses RLS, which is the only
-- writer/reader. Never client-readable.
alter table capi_outbox enable row level security;

comment on table capi_outbox is 'B-15: durable Meta CAPI event outbox. Service-role only; drained by /api/cron/capi-dispatch.';
comment on column capi_outbox.event_id is 'Deterministic dedup key: ${dealId}:${eventName} (closed_lost uses ${dealId}:Lead:disqualified). DB-unique → idempotent enqueue; also sent to Meta as event_id.';
