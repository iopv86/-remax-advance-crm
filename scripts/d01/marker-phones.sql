-- scripts/d01/marker-phones.sql
--
-- D01-P04 (REQ 8): limpia las filas cuyo phone o whatsapp_number lleva un marcador (letras o corchetes, p. ej.
-- "[numero de contacto del cliente]", escrito por el modelo de Ava antes de 31db51c) para poder aplicar 0037.
-- Medido en prod el 2026-10-29: N_VIOL = 1 (ctwa_ad, 2026-05-21). Solo con la aprobacion de Ivan en el checkpoint.
--
-- Orden en prod:
--   1. este script (copia previa en d01_private.bkp_marker_contacts y UPDATE solo de las filas copiadas, con el mismo
--      filtro y el conteo comprobado);
--   2. apply_migration de migrations/0037_contacts_phone_check.sql (CHECK NOT VALID);
--   3. alter table public.contacts validate constraint contacts_phone_no_marker;
-- Reversion: alter table public.contacts drop constraint contacts_phone_no_marker; y despues
--   update public.contacts c set phone = b.phone, whatsapp_number = b.whatsapp_number
--     from d01_private.bkp_marker_contacts b where b.id = c.id;
-- (con el CHECK puesto ese UPDATE da 23514: por eso el DROP va primero).

do $marker$
declare
  v_n   bigint;
  v_exp bigint;
begin
  perform set_config('lock_timeout', '3s', true);

  if to_regnamespace('d01_private') is null then
    raise exception 'marker-phones: falta el esquema d01_private (lo crea fusion-plan.sql)';
  end if;
  if to_regclass('d01_private.bkp_marker_contacts') is not null then
    raise exception 'marker-phones: ya se ejecuto (existe d01_private.bkp_marker_contacts)';
  end if;

  create table d01_private.bkp_marker_contacts as
  select * from public.contacts c
   where c.phone ~ '[A-Za-z\[\]]' or c.whatsapp_number ~ '[A-Za-z\[\]]';
  revoke all on d01_private.bkp_marker_contacts from public, anon, authenticated, service_role;
  alter table d01_private.bkp_marker_contacts enable row level security;
  if has_schema_privilege('anon', 'd01_private', 'usage') or has_schema_privilege('authenticated', 'd01_private', 'usage')
     or has_schema_privilege('service_role', 'd01_private', 'usage')
     or exists (select 1 from (values ('anon'), ('authenticated'), ('service_role')) x(rol)
                 where has_any_column_privilege(x.rol, 'd01_private.bkp_marker_contacts'::regclass, 'select,insert,update,references')
                    or has_table_privilege(x.rol, 'd01_private.bkp_marker_contacts'::regclass, 'select,insert,update,delete,truncate')) then
    raise exception 'marker-phones: la copia con PII es alcanzable por un rol cliente';
  end if;

  perform 1 from public.contacts c
   where c.id in (select b.id from d01_private.bkp_marker_contacts b)
   order by c.id
     for update;

  select count(*) into v_exp from d01_private.bkp_marker_contacts b where b.phone ~ '[A-Za-z\[\]]';
  update public.contacts c
     set phone = null
   where c.id in (select b.id from d01_private.bkp_marker_contacts b)
     and c.phone ~ '[A-Za-z\[\]]';
  get diagnostics v_n = row_count;
  if v_n <> v_exp then
    raise exception 'marker-phones: phone a NULL en % filas, la copia tiene %', v_n, v_exp;
  end if;

  select count(*) into v_exp from d01_private.bkp_marker_contacts b where b.whatsapp_number ~ '[A-Za-z\[\]]';
  update public.contacts c
     set whatsapp_number = null
   where c.id in (select b.id from d01_private.bkp_marker_contacts b)
     and c.whatsapp_number ~ '[A-Za-z\[\]]';
  get diagnostics v_n = row_count;
  if v_n <> v_exp then
    raise exception 'marker-phones: whatsapp_number a NULL en % filas, la copia tiene %', v_n, v_exp;
  end if;

  if exists (select 1 from public.contacts c where c.phone ~ '[A-Za-z\[\]]' or c.whatsapp_number ~ '[A-Za-z\[\]]') then
    raise exception 'marker-phones: quedan marcadores (una fila nueva entre la copia y el UPDATE)';
  end if;
end
$marker$;

-- El patron con los digitos cambiados por 9 dice si era un marcador o un numero real con texto ("809... ext 2").
select b.id, b.source::text as source, b.created_at, regexp_replace(b.phone, '\d', '9', 'g') as patron_phone,
       c.phone is null as phone_nulo, c.whatsapp_number is null as whatsapp_nulo
  from d01_private.bkp_marker_contacts b
  join public.contacts c on c.id = b.id;
