-- 0034_contacts_phone_key.sql
--
-- D01-P01 (Etapa 2.0): clave canonica de telefono en contacts.
--
-- Que cierra: el CRM busca el contacto con `.eq("phone", phone)` exacto (lib/meta-leads.ts:562) y Ava con
-- `phone=eq.<wa_id>` (agent/tools.py:375). El mismo cliente llega como "+18095550101" (formulario), "18095550101"
-- (wa_id de WhatsApp) u "809-555-0101" (alta manual), y cada camino crea su propio contacto.
--
-- Medido en prod el 2026-10-24: 700 contactos; 14 grupos duplicados por los ultimos 10 digitos (28 contactos, la
-- misma persona en los 14); 1 fila con un marcador del modelo en phone ("[numero de contacto del cliente]").
--
-- Diseno (D01-CONTEXT 4.A y 4.C):
--   phone_digits_ok  NULL si hay letras o corchetes; si no, solo los digitos.
--   phone_key        clave canonica: con "+" y 8-15 digitos, los digitos; sin "+", 10 digitos con forma NANP ->
--                    "1"||digitos, 11-15 digitos -> los digitos; resto y basura conocida (1234567890, digitos
--                    repetidos) -> NULL. Sin "+" no se inventa el pais: por eso Ava manda '+'||wa_id.
--   phone_match_set  claves y digitos (>= 9) de phone y whatsapp_number: lo que se busca con && y @>.
--   phone_variants   la misma linea escrita con o sin el prefijo nacional (NANP, ES, AR, MX, BR). Resto de paises:
--                    solo coincidencia exacta. Nunca terminacion literal de 10 digitos.
-- Las dos columnas son GENERATED ALWAYS ... STORED: cubren las 6 rutas de escritura sin tocarlas y sin backfill.
-- Ningun escritor reenvia una fila completa leida con select * (verificado en ambos repos el 2026-10-24), que es
-- lo unico que una columna generada rechaza (428C9).
--
-- Grants: las 4 funciones son puras (IMMUTABLE, sin acceso a datos, sin SECURITY DEFINER) y la expresion de una
-- columna generada se evalua con los privilegios de QUIEN inserta; anon tiene INSERT/UPDATE en contacts (medido),
-- asi que se conceden a anon, authenticated y service_role. No abren nada.
--
-- Riesgo conocido y aceptado (D01-CONTEXT 4.A): sin "+", un numero de 10 digitos con forma NANP se lee como NANP
-- (p. ej. un movil colombiano 310... escrito sin prefijo recibe la clave 1310...). Solo afecta a la entrada humana:
-- el wa_id de Meta siempre trae el pais y Ava lo manda con '+'.
--
-- Puramente aditiva: 4 funciones, 2 columnas generadas y 2 indices. Sin indice unico (va en P04: si se creara
-- ahora, processLead recibiria 23505 y perderia el lead).
--
-- El ALTER TABLE reescribe contacts (700 filas, milisegundos) con ACCESS EXCLUSIVE: si una transaccion larga tiene la
-- tabla, la migracion falla a los 3 s en vez de quedar en cola bloqueando todas las lecturas detras de ella.
set local lock_timeout = '3s';

create or replace function public.phone_digits_ok(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when p is null or btrim(p) = '' or p ~ '[A-Za-z\[\]]' then null
           else nullif(regexp_replace(p, '\D', '', 'g'), '')
         end
$$;

create or replace function public.phone_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when s.d is null or s.d = '1234567890' or s.d ~ '^(\d)\1+$' then null
           when s.t like '+%' then case when length(s.d) between 8 and 15 then s.d end
           when length(s.d) = 10 and s.d ~ '^[2-9]\d{2}[2-9]\d{6}$' then '1' || s.d
           when length(s.d) between 11 and 15 then s.d
         end
  from (select public.phone_digits_ok(p) as d, btrim(p) as t) s
$$;

create or replace function public.phone_match_set(p_phone text, p_wa text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_agg(distinct v.x order by v.x), '{}'::text[])
  from (
    select public.phone_key(p_phone) as x
    union all select public.phone_key(p_wa)
    union all select d from (values (public.phone_digits_ok(p_phone)), (public.phone_digits_ok(p_wa))) r(d)
               where length(d) >= 9 and d <> '1234567890' and d !~ '^(\d)\1+$'
  ) v
  where v.x is not null
$$;

create or replace function public.phone_variants(p_key text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           -- NANP: 1 + 10 <-> 10
           when k ~ '^1[2-9]\d{2}[2-9]\d{6}$' then array[substr(k, 2)]
           when k ~ '^[2-9]\d{2}[2-9]\d{6}$' then array['1' || k]
           -- Espana: 34 + 9 (movil y fijo 6-9) <-> 9
           when k ~ '^34[6-9]\d{8}$' then array[substr(k, 3)]
           when k ~ '^[6-9]\d{8}$' then array['34' || k]
           -- Argentina: el wa_id movil lleva 549; el formulario suele traer 54 sin el 9
           when k ~ '^549\d{10}$' then array['54' || substr(k, 4)]
           when k ~ '^54[0-8]\d{9}$' then array['549' || substr(k, 3)]
           -- Mexico: wa_id 521 + 10 <-> 52 + 10
           when k ~ '^521[2-9]\d{9}$' then array['52' || substr(k, 4)]
           when k ~ '^52[2-9]\d{9}$' then array['521' || substr(k, 3)]
           -- Brasil: movil con y sin el 9 tras el DDD
           when k ~ '^55[1-9]{2}9[6-9]\d{7}$' then array['55' || substr(k, 3, 2) || substr(k, 6)]
           when k ~ '^55[1-9]{2}[6-9]\d{7}$' then array['55' || substr(k, 3, 2) || '9' || substr(k, 5)]
           else '{}'::text[]
         end
  from (select p_key as k) s
$$;

alter table public.contacts
  add column phone_key text
    generated always as (coalesce(public.phone_key(whatsapp_number), public.phone_key(phone))) stored,
  add column phone_match text[]
    generated always as (public.phone_match_set(phone, whatsapp_number)) stored;

create index contacts_phone_match_gin on public.contacts using gin (phone_match);
create index contacts_phone_key_idx on public.contacts (phone_key) where phone_key is not null;

revoke all on function public.phone_digits_ok(text), public.phone_key(text), public.phone_match_set(text, text),
  public.phone_variants(text) from public;
grant execute on function public.phone_digits_ok(text), public.phone_key(text), public.phone_match_set(text, text),
  public.phone_variants(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
