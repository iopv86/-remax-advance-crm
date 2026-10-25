-- 0035_resolve_contact.sql
--
-- D01-P01 (Etapa 2.0): RPC atomico resolve_contact, el unico camino para "buscar o crear" un contacto por telefono
-- que usaran el CRM (P02) y Ava (P03).
--
-- Que cierra: hoy los dos repos hacen select-y-luego-insert sin cerrojo. Medido el 2026-10-24: en 7 de los 10 grupos
-- duplicados formulario + WhatsApp, Ava creo el contacto 2-47 s ANTES de que el poller del CRM ingiriera el
-- formulario, y el CRM no lo encontro (busca phone exacto). Con dos llamadas simultaneas del mismo cliente, ambas ven
-- "no existe" y ambas insertan.
--
-- Orden dentro de la funcion (D01-CONTEXT 4.B):
--   (1) guard: Ava (is_ava_bot) o service_role (CRM); cualquier otro llamador -> 42501.
--   (2) 22023 si faltan p_key y p_meta_lead_id, o si p_key no es la clave de p_phone (no se acepta una clave forjada).
--   (3) cerrojos de transaccion, siempre en este orden: (73010, ultimos 8 digitos de la clave) y (73011,
--       meta_lead_id). Los ultimos 8 digitos son comunes a todas las variantes de pais de la misma linea, asi que
--       "+18095550101" y "8095550101" esperan el uno al otro. La forma de dos int4 no choca con el bigint de
--       create_intake_deal.
--   (4) exacta por phone_match; 2 o mas = grupo ya duplicado -> superviviente (contact_survivor) y evento dup_group.
--   (5) variantes por pais; 1 -> found/variant con evento; 2 o mas -> ambiguous: NO crea, evento con los candidatos.
--   (6) respaldo por meta_lead_id.
--   (8) no encontrado: alta minima (telefono, nombre, source, meta_lead_id, agente); el resto lo escribe el llamador
--       por id. 23505 (otra sesion sin cerrojo, p. ej. la UI, inserto el mismo phone) -> relee y sigue por (7).
--   (7) encontrado (tambien tras un 23505): si esta archivado (lead_status 'archived' o archived_at no nulo; el CRM
--       archiva con lead_status, D17) se desarchiva en el MISMO UPDATE y queda evento 'unarchived' (D16). Con agente:
--       NUNCA round-robin (R7, D13). Sin agente y p_assign_rr: el dueno de su deal de intake abierto si sigue activo en
--       el round-robin (si no, trg_cascade_contact_agent moveria ese deal en silencio a otro agente); si no hay,
--       rr_agent_with_retry. Se escribe con `where agent_id is null`.
--
-- contact_match_events guarda solo los ultimos 4 digitos del telefono; la escribe solo esta funcion. Los eventos
-- 'dup_group' y 'variant' se escriben como mucho 1 vez cada 24 h por contacto: el poller y cada mensaje de Ava vuelven
-- a encontrar los 14 grupos duplicados y, sin ventana, la alerta de P02 se llenaria de ruido.
--
-- rr_agent_with_retry (N3): assign_next_rr_agent usa FOR UPDATE SKIP LOCKED sobre round_robin_config; con 2 agentes
-- activos y 3 o mas transacciones solapadas, la tercera recibe NULL aunque haya agentes (medido en el banco: 4 de 6
-- llamadas solapadas, 5 de 5 repeticiones). Se reintenta como mucho 3 veces, y solo mientras exista alguna fila activa
-- en round_robin_config (medido: con 3 intentos, 0 de 6 sin agente).
--
-- Aceptado (revision 2026-10-25): si el alta choca con 23505 tras pedir agente al round-robin y el contacto ganador ya
-- tiene agente (o el dueno de su deal tiene preferencia), ese turno del RR se pierde; es una colision rara (UI e import
-- sin cerrojo) y no corrompe datos. Tras un 23505, matched_by es 'exact' si hay p_key aunque chocara el meta_lead_id:
-- es una etiqueta de diagnostico. `set local` de las migraciones exige transaccion: apply_migration la abre.
--
-- Puramente aditiva: 1 tabla nueva y 4 funciones nuevas. No toca ninguna fila existente.

create table public.contact_match_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('variant', 'ambiguous', 'dup_group', 'no_agent', 'unarchived')),
  caller text not null check (caller in ('ava', 'crm')),
  key_last4 text,
  contact_id uuid references public.contacts(id) on delete set null,
  candidate_ids uuid[] not null default '{}',
  source text,
  alerted_at timestamptz
);

create index contact_match_events_contact_kind_idx on public.contact_match_events (contact_id, kind, created_at);

alter table public.contact_match_events enable row level security;
-- Sin politicas: solo la funcion (owner) y service_role (cron de alertas de P02) la leen.
-- ALTER DEFAULT PRIVILEGES concede CRUD a anon y authenticated en toda tabla nueva: revocar nombrandolos (0029).
revoke all on table public.contact_match_events from public, anon, authenticated, service_role;
grant select, insert, update on table public.contact_match_events to service_role;
revoke all on sequence public.contact_match_events_id_seq from public, anon, authenticated, service_role;

create or replace function public.contact_survivor(p_ids uuid[])
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Misma regla que D8: gana el contacto cuyo agente esta activo en el round-robin; si empatan, el mas antiguo.
  select c.id
  from public.contacts c
  where c.id = any(p_ids)
  order by exists (select 1 from public.round_robin_config r where r.agent_id = c.agent_id and r.is_active) desc,
           c.created_at,
           c.id
  limit 1
$$;

create or replace function public.rr_agent_with_retry()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent uuid;
begin
  for v_try in 1..3 loop
    if v_try > 1 then
      -- Sin agentes activos no hay nada que esperar: NULL al primer intento.
      if not exists (select 1 from public.round_robin_config r where r.is_active) then
        return null;
      end if;
      perform pg_sleep(0.05 * v_try);
    end if;
    v_agent := public.assign_next_rr_agent();
    if v_agent is not null then
      return v_agent;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.resolve_contact(
  p_phone text,
  p_key text,
  p_meta_lead_id text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_source text default null,
  p_assign_rr boolean default false,
  p_create_without_agent boolean default false
)
returns table (outcome text, contact_id uuid, agent_id uuid, agent_assigned_now boolean, matched_by text,
               candidate_ids uuid[])
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_caller   text;
  v_meta     text := nullif(btrim(p_meta_lead_id), '');
  v_last4    text;
  v_ids      uuid[];
  v_id       uuid;
  v_by       text;
  v_agent    uuid;
  v_new      uuid;
  v_now      boolean := false;
  v_status   text;
  v_archived timestamptz;
  v_created  boolean := false;
  v_deal_agent uuid;
begin
  -- (1) guard
  if coalesce(public.is_ava_bot(), false) then
    v_caller := 'ava';
  elsif coalesce(auth.role(), '') = 'service_role' then
    v_caller := 'crm';
  else
    raise exception 'resolve_contact: llamador no autorizado' using errcode = '42501';
  end if;

  -- (2) validacion
  if p_key is null and v_meta is null then
    raise exception 'resolve_contact: falta p_key y p_meta_lead_id' using errcode = '22023';
  end if;
  if p_key is not null and (p_key !~ '^\d{8,15}$' or p_key is distinct from public.phone_key(p_phone)) then
    raise exception 'resolve_contact: p_key no es la clave de p_phone' using errcode = '22023';
  end if;
  -- Un telefono con clave llega siempre con ella: sin p_key no se buscaria por telefono y se crearia un duplicado.
  if p_key is null and public.phone_key(p_phone) is not null then
    raise exception 'resolve_contact: p_phone tiene clave y falta p_key' using errcode = '22023';
  end if;
  -- Un source fuera del enum fallaria con 22P02 en el insert, despues de los cerrojos: se rechaza aqui.
  if p_source is not null and p_source <> all (enum_range(null::public.lead_source)::text[]) then
    raise exception 'resolve_contact: p_source no es un lead_source valido' using errcode = '22023';
  end if;
  v_last4 := right(coalesce(p_key, public.phone_digits_ok(p_phone)), 4);

  -- (3) cerrojos, siempre en este orden
  if p_key is not null then
    perform pg_advisory_xact_lock(73010, hashtext(right(p_key, 8)));
  end if;
  if v_meta is not null then
    perform pg_advisory_xact_lock(73011, hashtext(v_meta));
  end if;

  -- (4) exacta
  if p_key is not null then
    select array_agg(c.id order by c.created_at, c.id) into v_ids
    from public.contacts c
    where c.phone_match @> array[p_key];
    if cardinality(v_ids) = 1 then
      v_id := v_ids[1];
      v_by := 'exact';
    elsif cardinality(v_ids) > 1 then
      v_id := public.contact_survivor(v_ids);
      v_by := 'dup_group';
      if not exists (select 1 from public.contact_match_events e
                      where e.contact_id = v_id and e.kind = 'dup_group' and e.created_at > now() - interval '24 hours') then
        insert into public.contact_match_events (kind, caller, key_last4, contact_id, candidate_ids, source)
        values ('dup_group', v_caller, v_last4, v_id, v_ids, p_source);
      end if;
    end if;
  end if;

  -- (5) variantes por pais
  if v_id is null and p_key is not null then
    select array_agg(c.id order by c.created_at, c.id) into v_ids
    from public.contacts c
    where c.phone_match && public.phone_variants(p_key);
    if cardinality(v_ids) = 1 then
      v_id := v_ids[1];
      v_by := 'variant';
      if not exists (select 1 from public.contact_match_events e
                      where e.contact_id = v_id and e.kind = 'variant' and e.created_at > now() - interval '24 hours') then
        insert into public.contact_match_events (kind, caller, key_last4, contact_id, candidate_ids, source)
        values ('variant', v_caller, v_last4, v_id, v_ids, p_source);
      end if;
    elsif cardinality(v_ids) > 1 then
      insert into public.contact_match_events (kind, caller, key_last4, contact_id, candidate_ids, source)
      values ('ambiguous', v_caller, v_last4, null, v_ids, p_source);
      return query select 'ambiguous'::text, null::uuid, null::uuid, false, 'variant'::text, v_ids;
      return;
    end if;
  end if;

  -- (6) respaldo por meta_lead_id
  if v_id is null and v_meta is not null then
    select c.id into v_id
    from public.contacts c
    where c.meta_lead_id = v_meta
    order by c.created_at, c.id
    limit 1;
    if v_id is not null then
      v_by := 'meta_lead_id';
    end if;
  end if;

  -- (8) no encontrado: alta minima
  if v_id is null then
    if p_assign_rr then
      v_new := public.rr_agent_with_retry();
      if v_new is null and not p_create_without_agent then
        insert into public.contact_match_events (kind, caller, key_last4, contact_id, source)
        values ('no_agent', v_caller, v_last4, null, p_source);
        return query select 'no_agent'::text, null::uuid, null::uuid, false, null::text, '{}'::uuid[];
        return;
      end if;
    end if;

    begin
      insert into public.contacts (phone, whatsapp_number, first_name, last_name, source, meta_lead_id, agent_id,
                                   assigned_at, lead_status)
      values (p_phone, p_phone, nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''),
              coalesce(p_source::public.lead_source, 'other'::public.lead_source), v_meta, v_new,
              case when v_new is not null then now() end, 'new')
      returning id into v_id;
      v_created := true;
    exception when unique_violation then
      -- Otra sesion sin el cerrojo (UI, import) inserto el mismo telefono o meta_lead_id: ese contacto es el del
      -- cliente y sigue por (7) (desarchivado y agente) como cualquier contacto encontrado.
      select c.id into v_id
      from public.contacts c
      where (p_key is not null and c.phone_match @> array[p_key])
         or c.phone = p_phone
         or c.whatsapp_number = p_phone
         or (v_meta is not null and c.meta_lead_id = v_meta)
      order by c.created_at, c.id
      limit 1;
      if v_id is null then
        raise;
      end if;
      v_by := case when p_key is null then 'meta_lead_id' else 'exact' end;
    end;

    if v_created then
      if p_assign_rr and v_new is null then
        insert into public.contact_match_events (kind, caller, key_last4, contact_id, source)
        values ('no_agent', v_caller, v_last4, v_id, p_source);
        return query select 'no_agent'::text, v_id, null::uuid, false, null::text, '{}'::uuid[];
        return;
      end if;
      return query select 'created'::text, v_id, v_new, v_new is not null, null::text, '{}'::uuid[];
      return;
    end if;
  end if;

  -- (7) encontrado (tambien tras un 23505)
  select c.agent_id, c.lead_status::text, c.archived_at into v_agent, v_status, v_archived
  from public.contacts c
  where c.id = v_id;

  if v_status = 'archived' or v_archived is not null then
    update public.contacts c set lead_status = 'new', archived_at = null where c.id = v_id;
    insert into public.contact_match_events (kind, caller, key_last4, contact_id, source)
    values ('unarchived', v_caller, v_last4, v_id, p_source);
  end if;

  if v_agent is null and p_assign_rr then
    -- Sin agente pero con deal de intake abierto: su dueno, si sigue activo en el round-robin (Policy C, D13).
    -- Tras un 23505, v_new ya trae un agente del RR: el del deal tiene preferencia; si no hay, se usa ese.
    select d.agent_id into v_deal_agent
    from public.deals d
    where d.contact_id = v_id
      and d.stage in ('nuevo_sin_contactar', 'lead_captured')
      and exists (select 1 from public.round_robin_config r where r.agent_id = d.agent_id and r.is_active)
    order by d.created_at desc
    limit 1;
    v_new := coalesce(v_deal_agent, v_new);
    if v_new is null then
      v_new := public.rr_agent_with_retry();
    end if;
    if v_new is null then
      insert into public.contact_match_events (kind, caller, key_last4, contact_id, source)
      values ('no_agent', v_caller, v_last4, v_id, p_source);
      return query select 'no_agent'::text, v_id, null::uuid, false, v_by, coalesce(v_ids, '{}'::uuid[]);
      return;
    end if;
    update public.contacts c set agent_id = v_new, assigned_at = now() where c.id = v_id and c.agent_id is null;
    if found then
      v_agent := v_new;
      v_now := true;
    else
      select c.agent_id into v_agent from public.contacts c where c.id = v_id;
    end if;
  end if;

  return query select 'found'::text, v_id, v_agent, v_now, v_by, coalesce(v_ids, '{}'::uuid[]);
end;
$$;

create or replace function public.resolve_deal_agent(p_agent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (coalesce(public.is_ava_bot(), false) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'resolve_deal_agent: llamador no autorizado' using errcode = '42501';
  end if;
  -- Policy C (lib/meta-leads.ts:247-262): el agente del contacto si sigue activo en el round-robin; si no, RR.
  if p_agent_id is not null
     and exists (select 1 from public.round_robin_config r where r.agent_id = p_agent_id and r.is_active) then
    return p_agent_id;
  end if;
  return public.rr_agent_with_retry();
end;
$$;

-- ALTER DEFAULT PRIVILEGES concede EXECUTE a anon/authenticated/service_role en toda funcion nueva y revocar a PUBLIC
-- no quita el grant explicito de anon (0029): se nombran public, anon y authenticated.
revoke all on function public.resolve_contact(text, text, text, text, text, text, boolean, boolean),
  public.resolve_deal_agent(uuid), public.contact_survivor(uuid[]), public.rr_agent_with_retry()
  from public, anon, authenticated;
grant execute on function public.resolve_contact(text, text, text, text, text, text, boolean, boolean),
  public.resolve_deal_agent(uuid) to authenticated, service_role;
grant execute on function public.contact_survivor(uuid[]), public.rr_agent_with_retry() to service_role;

notify pgrst, 'reload schema';
