-- 0019_deal_installments.sql
-- Plan de pagos (cuotas) de un deal — Sesion 5 del roadmap Intereses+Campanas.
-- Cada fila = una cuota. Una sola moneda por plan, heredada del deal (USD/DOP),
-- denormalizada en cada fila para que S6 (conversion de tasas) pueda leer
-- amount+currency+due_date sin reestructurar. NO hay tabla header: la moneda del
-- plan ES la del deal (deals.currency), editable en el deal.
-- "vencida" NO se almacena: se deriva en lectura (status='pendiente' AND due_date<hoy)
-- para no necesitar un cron que voltee estados.
-- RLS espeja la regla de EDICION del deal padre (agent_id = auth.uid()
-- OR is_admin_or_manager()), igual que deal_parties (0018) y property_owners (0017).
-- La child DELETE sigue la regla de EDICION del deal (no is_admin del padre):
-- editar el plan = editar el deal (delete-then-insert). agents.id == auth.users.id.

-- Tipo de cuota.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'deal_installment_kind') then
    create type public.deal_installment_kind as enum ('reserva', 'inicial', 'saldo', 'otro');
  end if;
end$$;

-- Estado de la cuota. 'vencida' es derivado en lectura, NO se almacena aqui.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'deal_installment_status') then
    create type public.deal_installment_status as enum ('pendiente', 'pagada');
  end if;
end$$;

create table if not exists public.deal_installments (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id) on delete cascade,
  kind        public.deal_installment_kind not null,
  label       text,
  amount      numeric(14,2) not null,
  currency    public.currency_type not null,
  due_date    date,
  status      public.deal_installment_status not null default 'pendiente',
  paid_date   date,
  sort_order  integer not null default 0,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint deal_installments_amount_nonneg check (amount >= 0),
  constraint deal_installments_amount_max    check (amount <= 100000000000),
  constraint deal_installments_paid_date_chk check (status = 'pagada' or paid_date is null)
);

-- Lookup de todas las cuotas de un deal (detalle + write path), ya ordenadas.
create index if not exists deal_installments_deal_id_idx
  on public.deal_installments (deal_id, sort_order);

-- Mantenimiento de updated_at (funcion dedicada, idempotente; mismo patron que
-- set_deal_parties_updated_at / set_property_owners_updated_at).
create or replace function public.set_deal_installments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_deal_installments_updated_at on public.deal_installments;
create trigger set_deal_installments_updated_at
  before update on public.deal_installments
  for each row
  execute function public.set_deal_installments_updated_at();

-- RLS: delega a la regla owner-agent / admin-manager del deal padre.
-- Las 4 policies usan la condicion de EDICION del deal (no is_admin()).
alter table public.deal_installments enable row level security;
alter table public.deal_installments force row level security;

drop policy if exists deal_installments_select on public.deal_installments;
create policy deal_installments_select on public.deal_installments
  for select
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_installments.deal_id
        and (d.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );

drop policy if exists deal_installments_insert on public.deal_installments;
create policy deal_installments_insert on public.deal_installments
  for insert
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_installments.deal_id
        and (d.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );

drop policy if exists deal_installments_update on public.deal_installments;
create policy deal_installments_update on public.deal_installments
  for update
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_installments.deal_id
        and (d.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  )
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_installments.deal_id
        and (d.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );

drop policy if exists deal_installments_delete on public.deal_installments;
create policy deal_installments_delete on public.deal_installments
  for delete
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_installments.deal_id
        and (d.agent_id = auth.uid() or public.is_admin_or_manager())
    )
  );
