-- migrations/rollback/0040-down.sql
--
-- Reversion de 0040_contacts_phone_key_unique: quita el indice unico de phone_key y vuelve a crear
-- idx_contacts_meta_lead_id con la definicion medida en prod el 2026-10-29. Necesaria ANTES de fusion-rollback.sql y
-- antes de revertir D01-P02 (CRM) o D01-P03 (Ava): su codigo viejo inserta por telefono exacto y el indice le daria
-- 23505. No toca filas. Idempotente.
set local lock_timeout = '3s';
do $$
begin
  if current_setting('lock_timeout') <> '3s' then
    raise exception '0040-down: lock_timeout no aplicado (debe correr dentro de una transaccion)';
  end if;
end $$;

drop index if exists public.contacts_phone_key_uidx;
create unique index if not exists idx_contacts_meta_lead_id on public.contacts using btree (meta_lead_id)
  where (meta_lead_id is not null);

do $$
begin
  if to_regclass('public.contacts_phone_key_uidx') is not null then
    raise exception '0040-down: postcondicion: contacts_phone_key_uidx sigue existiendo';
  end if;
  if pg_get_indexdef('public.idx_contacts_meta_lead_id'::regclass)
     <> 'CREATE UNIQUE INDEX idx_contacts_meta_lead_id ON public.contacts USING btree (meta_lead_id) WHERE (meta_lead_id IS NOT NULL)' then
    raise exception '0040-down: postcondicion: idx_contacts_meta_lead_id no quedo con la definicion de prod';
  end if;
end $$;
