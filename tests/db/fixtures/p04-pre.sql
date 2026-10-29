-- D01-P04: lo que la fusion y las migraciones 0040-0042 necesitan y no esta en el snapshot de P01 (prod-schema.sql,
-- PRE-P01, no se regenera). Medido en prod el 2026-10-29 (solo SELECT). No lleva ningun dato de prod: se versiona
-- (el repo es publico).
--
-- 1. increment_follow_up_count(text): texto literal de pg_get_functiondef en prod (md5(prosrc)
--    7217501e00f10335d0984480cff3ba1d) y su ACL de prod {postgres, authenticated, service_role}.
-- 2. Las 8 tablas hijas de contacts/deals que faltan en el banco, REDUCIDAS a la PK, las columnas FK (misma
--    nulabilidad y la MISMA accion ON DELETE que prod) y updated_at con su trigger BEFORE UPDATE donde prod lo tiene.
--    Las demas columnas NOT NULL de prod se omiten: la fusion solo depende de las FK. Con ellas el banco tiene las 22
--    FK de una columna hacia contacts y deals que existen en prod.

CREATE OR REPLACE FUNCTION public.increment_follow_up_count(p_phone text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update contacts
     set follow_up_count = coalesce(follow_up_count, 0) + 1,
         updated_at      = now()
   where whatsapp_number = p_phone
      or phone            = p_phone;
$function$;
revoke all on function public.increment_follow_up_count(text) from public, anon;
grant execute on function public.increment_follow_up_count(text) to authenticated, service_role;

create or replace function public.p04_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.ava_call_requests (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id),
  created_at timestamptz not null default now()
);
create table public.contact_documents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.property_proposals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique default gen_random_uuid()::text,
  contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.reassignment_log (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.showings (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_showings_updated before update on public.showings
  for each row execute function public.p04_touch_updated_at();
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.p04_touch_updated_at();
create table public.deal_installments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_deal_installments_updated_at before update on public.deal_installments
  for each row execute function public.p04_touch_updated_at();
create table public.deal_parties (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_deal_parties_updated_at before update on public.deal_parties
  for each row execute function public.p04_touch_updated_at();
