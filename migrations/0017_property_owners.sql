-- 0017_property_owners.sql
-- Owner-of-property (Propietarios) for Advance CRM — Sesion 3 del roadmap Intereses+Campanas.
-- PII (nombre + telefono) es owner-scoped: lo leen/escriben SOLO el agente dueno de la
-- propiedad padre + admin/manager. Espeja la RLS de properties (CRUD policies usan
-- agent_id = auth.uid() OR is_admin_or_manager()). properties_select = true expone TODAS
-- las columnas de properties a cualquier agente, por eso el owner va en tabla aparte.
-- agents.id == auth.users.id (verificado), por lo que p.agent_id = auth.uid() es correcto.

create table if not exists public.property_owners (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  full_name    text not null,
  phone        text,
  email        text,
  notes        text,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Lookup de todos los propietarios de una propiedad (detalle + write path).
create index if not exists property_owners_property_id_idx
  on public.property_owners (property_id);

-- A lo sumo UN propietario principal por propiedad.
create unique index if not exists property_owners_one_primary_per_property
  on public.property_owners (property_id)
  where is_primary;

-- Mantenimiento de updated_at (funcion dedicada, idempotente; el proyecto no tiene
-- un trigger updated_at compartido).
create or replace function public.set_property_owners_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_property_owners_updated_at on public.property_owners;
create trigger set_property_owners_updated_at
  before update on public.property_owners
  for each row
  execute function public.set_property_owners_updated_at();

-- RLS: delega la autorizacion a la regla listing-agent / admin de la propiedad padre.
alter table public.property_owners enable row level security;
alter table public.property_owners force row level security;

drop policy if exists property_owners_select on public.property_owners;
create policy property_owners_select on public.property_owners
  for select
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_owners.property_id
        and (p.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );

drop policy if exists property_owners_insert on public.property_owners;
create policy property_owners_insert on public.property_owners
  for insert
  with check (
    exists (
      select 1 from public.properties p
      where p.id = property_owners.property_id
        and (p.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );

drop policy if exists property_owners_update on public.property_owners;
create policy property_owners_update on public.property_owners
  for update
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_owners.property_id
        and (p.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  )
  with check (
    exists (
      select 1 from public.properties p
      where p.id = property_owners.property_id
        and (p.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );

drop policy if exists property_owners_delete on public.property_owners;
create policy property_owners_delete on public.property_owners
  for delete
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_owners.property_id
        and (p.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );
