-- 0040_contacts_phone_key_unique.sql
--
-- D01-P04 (Etapa 2c, REQ 10): un cliente = un contacto, garantizado por la BD.
--   1. Indice unico parcial contacts_phone_key_uidx sobre phone_key (0034): dos contactos con el mismo telefono en
--      formatos distintos ("+18095550101", "8095550101", "809-555-0101") ya no pueden coexistir.
--   2. Retira idx_contacts_meta_lead_id, duplicado exacto de contacts_meta_lead_id_uidx (0032); medido en prod el
--      2026-10-29: los dos con la definicion `UNIQUE ... (meta_lead_id) WHERE (meta_lead_id IS NOT NULL)` y ninguna
--      constraint respaldada por idx_.
--
-- Precondiciones (en prod se cumplen tras scripts/d01/fusion-apply.sql):
--   - 0 claves de telefono repetidas (si no, aborta con el aviso y NO crea nada: ejecutar antes la fusion);
--   - los dos repos ya resuelven por resolve_contact en prod (CRM desde 2026-10-26 22:47 UTC, D01-P02; Ava desde
--     2026-10-27 23:15 UTC, D01-P03, primer contacto '+wa_id' medido el 2026-10-29 13:38 UTC). Antes, processLead y
--     el codigo viejo de Ava insertaban por telefono exacto y habrian recibido 23505 (D01-CONTEXT 4.B).
--   - contacts_meta_lead_id_uidx existe, es unico y valido y tiene la misma definicion que idx_contacts_meta_lead_id.
-- resolve_contact ya trata un 23505 (relee y sigue por el contacto que gano; 0035 paso 8); el formulario manual y el
-- import lo muestran con un mensaje claro desde el despliegue del CRM de D01-P04, que va ANTES de esta migracion.
-- CREATE INDEX no concurrente: ~770 filas, el SHARE lock dura milisegundos y la migracion es una transaccion.
-- Idempotente. Rollback: migrations/rollback/0040-down.sql (para revertir P02 o P03 despues de P04, primero este).

set local lock_timeout = '3s';
do $$
begin
  if current_setting('lock_timeout') <> '3s' then
    raise exception '0040: lock_timeout no aplicado (la migracion debe correr dentro de una transaccion)';
  end if;
end $$;

-- 1. Precondicion.
do $$
declare
  v_n int;
  v_uidx text;
  v_idx text;
begin
  select count(*) into v_n
    from (select c.phone_key from public.contacts c where c.phone_key is not null
           group by c.phone_key having count(*) > 1) k;
  if v_n > 0 then
    raise exception '0040: precondicion: % claves de telefono repetidas (aplica antes scripts/d01/fusion-apply.sql)', v_n;
  end if;

  if to_regclass('public.contacts_meta_lead_id_uidx') is null then
    raise exception '0040: precondicion: falta contacts_meta_lead_id_uidx (0032): no se retira su duplicado';
  end if;
  if not exists (select 1 from pg_index i
                  where i.indexrelid = 'public.contacts_meta_lead_id_uidx'::regclass and i.indisunique and i.indisvalid) then
    raise exception '0040: precondicion: contacts_meta_lead_id_uidx no es unico y valido';
  end if;
  if to_regclass('public.idx_contacts_meta_lead_id') is not null then
    if exists (select 1 from pg_constraint where conindid = 'public.idx_contacts_meta_lead_id'::regclass) then
      raise exception '0040: precondicion: idx_contacts_meta_lead_id respalda una constraint';
    end if;
    v_uidx := replace(pg_get_indexdef('public.contacts_meta_lead_id_uidx'::regclass), 'contacts_meta_lead_id_uidx', '<i>');
    v_idx := replace(pg_get_indexdef('public.idx_contacts_meta_lead_id'::regclass), 'idx_contacts_meta_lead_id', '<i>');
    if v_uidx <> v_idx then
      raise exception '0040: precondicion: idx_contacts_meta_lead_id no es identico a contacts_meta_lead_id_uidx';
    end if;
  end if;
end $$;

-- 2. Indice duplicado de meta_lead_id. Va antes del CREATE: el DROP toma ACCESS EXCLUSIVE y el CREATE SHARE; en este
--    orden la transaccion no sube de SHARE a ACCESS EXCLUSIVE con lectores esperando.
drop index if exists public.idx_contacts_meta_lead_id;

-- 3. Indice unico de telefono.
create unique index if not exists contacts_phone_key_uidx on public.contacts (phone_key) where phone_key is not null;

-- 4. Postcondicion.
do $$
begin
  if not exists (select 1 from pg_index i
                  where i.indexrelid = to_regclass('public.contacts_phone_key_uidx') and i.indisunique and i.indisvalid)
     or pg_get_indexdef('public.contacts_phone_key_uidx'::regclass)
        <> 'CREATE UNIQUE INDEX contacts_phone_key_uidx ON public.contacts USING btree (phone_key) WHERE (phone_key IS NOT NULL)' then
    raise exception '0040: postcondicion: contacts_phone_key_uidx no es el indice esperado';
  end if;
  if to_regclass('public.idx_contacts_meta_lead_id') is not null then
    raise exception '0040: postcondicion: idx_contacts_meta_lead_id sigue existiendo';
  end if;
  if to_regclass('public.contacts_meta_lead_id_uidx') is null then
    raise exception '0040: postcondicion: falta contacts_meta_lead_id_uidx';
  end if;
end $$;
