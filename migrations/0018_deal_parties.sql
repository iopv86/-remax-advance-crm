-- 0018_deal_parties.sql
-- Co-comprador / referidor de un deal (Sesion 4 del roadmap Intereses+Campanas).
-- PII (nombre + telefono) es deal-scoped: lo leen/escriben SOLO el agente dueno del
-- deal padre + admin/manager. Espeja deals_select/insert/update (agent_id = auth.uid()
-- OR is_admin_or_manager()). OJO: deals_delete del padre es is_admin(), pero las partes
-- se editan junto al deal (delete-then-insert), por lo que la child DELETE sigue la
-- regla de EDICION del deal (dueno + manager), igual que property_owners en 0017.
-- agents.id == auth.users.id (verificado 5/5), por lo que d.agent_id = auth.uid() es correcto.

-- Discriminador del tipo de parte. Un deal puede tener 0..N de cada tipo (la UI limita a 1+1).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'deal_party_type') then
    create type public.deal_party_type as enum ('co_buyer', 'referrer');
  end if;
end$$;

create table if not exists public.deal_parties (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals (id) on delete cascade,
  party_type    public.deal_party_type not null,
  full_name     text not null,
  phone         text,
  relationship  text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Lookup de todas las partes de un deal (detalle + write path).
create index if not exists deal_parties_deal_id_idx
  on public.deal_parties (deal_id);

-- Mantenimiento de updated_at (funcion dedicada, idempotente; el proyecto no tiene
-- un trigger updated_at compartido — mismo patron que set_property_owners_updated_at).
create or replace function public.set_deal_parties_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_deal_parties_updated_at on public.deal_parties;
create trigger set_deal_parties_updated_at
  before update on public.deal_parties
  for each row
  execute function public.set_deal_parties_updated_at();

-- RLS: delega la autorizacion a la regla owner-agent / admin-manager del deal padre.
-- Las 4 policies usan la condicion de EDICION del deal (no is_admin()), porque editar
-- partes = editar el deal.
alter table public.deal_parties enable row level security;
alter table public.deal_parties force row level security;

drop policy if exists deal_parties_select on public.deal_parties;
create policy deal_parties_select on public.deal_parties
  for select
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_parties.deal_id
        and (d.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );

drop policy if exists deal_parties_insert on public.deal_parties;
create policy deal_parties_insert on public.deal_parties
  for insert
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_parties.deal_id
        and (d.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );

drop policy if exists deal_parties_update on public.deal_parties;
create policy deal_parties_update on public.deal_parties
  for update
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_parties.deal_id
        and (d.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  )
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_parties.deal_id
        and (d.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );

drop policy if exists deal_parties_delete on public.deal_parties;
create policy deal_parties_delete on public.deal_parties
  for delete
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_parties.deal_id
        and (d.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );
