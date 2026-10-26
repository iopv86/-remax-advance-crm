-- D01-P02: tablas que toca processLead y que no estan en el snapshot de P01 (prod-schema.sql, PRE-P01, no se
-- regenera). DDL de migrations/0021_capi_outbox.sql y 0031_meta_lead_ingest.sql sin comentarios ni backfill,
-- comprobado contra el catalogo de prod el 2026-10-25 (solo SELECT): mismas columnas, constraints e indices; RLS
-- activa sin politicas; ACL postgres=arwdDxtm y service_role=arwdDxtm (anon y authenticated sin nada).
-- No lleva ningun dato de prod: se puede versionar (el repo es publico).

create table public.capi_outbox (
  id              uuid primary key default gen_random_uuid(),
  event_id        text not null unique,
  event_name      text not null,
  action_source   text not null,
  contact_id      uuid references public.contacts(id) on delete set null,
  deal_id         uuid references public.deals(id) on delete set null,
  payload         jsonb not null,
  status          text not null default 'pending',
  attempts        int  not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  next_attempt_at timestamptz not null default now()
);
create index capi_outbox_dispatch_idx on public.capi_outbox (next_attempt_at) where status = 'pending';
create index capi_outbox_contact_idx on public.capi_outbox (contact_id);
alter table public.capi_outbox enable row level security;

create table public.meta_lead_ingest (
  lead_id       text primary key,
  form_id       text,
  created_time  timestamptz,
  contact_id    uuid references public.contacts(id) on delete set null,
  deal_id       uuid references public.deals(id) on delete set null,
  agent_id      uuid references public.agents(id) on delete set null,
  outcome       text not null,
  source        text not null,
  alerted_at    timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index meta_lead_ingest_created_idx on public.meta_lead_ingest (created_time desc);
create index meta_lead_ingest_open_idx on public.meta_lead_ingest (outcome) where alerted_at is null;
alter table public.meta_lead_ingest enable row level security;

revoke all on table public.capi_outbox, public.meta_lead_ingest from public, anon, authenticated;
grant all privileges on table public.capi_outbox, public.meta_lead_ingest to service_role;
