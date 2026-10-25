-- 0036_agent_lead_notifications.sql
--
-- D01-P01 (Etapa 2.0): aviso al agente exactamente una vez (D12), hora preferida del cliente (D14) y campanita de
-- cliente que vuelve (D19).
--
-- Que cierra: hoy avisan dos sitios. El CRM manda la plantilla al crear el deal sin comprobar la respuesta de Meta
-- (lib/meta-leads.ts:336-360) y Ava avisa desde registrar_lead solo si assigned_at < 30 s (agent/tools.py:795-814).
-- Medido el 2026-10-24: deals.agent_notified_at vacio en los 539 deals de intake de 120 dias.
--
-- Diseno (D01-CONTEXT 4.D):
--   agent_lead_notifications  una fila por deal (deal_id UNIQUE), insertada por create_intake_deal en la MISMA
--                             transaccion que el deal: un deal sin aviso es imposible. Sin contact_id ni agent_id: el
--                             emisor los lee del deal (la fusion de P04 y un cambio de dueno no dejan avisos viejos).
--   create_intake_deal        misma firma que 0033; ahora tambien la llama Ava (guard is_ava_bot/service_role).
--                             Bandera de transicion agency_config.agent_notify_queue_live (SUPUESTO S8): mientras no
--                             valga 'true', la fila queda 'skipped' y el CRM viejo sigue avisando por su camino (no hay
--                             doble aviso). P02 la enciende.
--   claim/mark                el emisor unico de P02 reclama con FOR UPDATE SKIP LOCKED y marca el resultado.
--   record_campaign_return    D13: cliente con deal de intake abierto que vuelve por un anuncio -> nota en el CRM
--                             (activity 'note', is_automated: no cuenta como respuesta del agente), sin plantilla.
--   preferred_contact_time    D4-bis + D14: la hora que pide el cliente va al contacto y al deal, y le llega al agente
--                             como campanita del CRM y correo pendiente (agent_time_notifications, lo envia el cron de
--                             P02). Nunca una segunda plantilla de WhatsApp.
--   notify_agent_client_returned  D19: campanita "tu cliente volvio a escribir" al dueno del deal de intake abierto,
--                             como mucho 1 cada 24 h por deal, sin plantilla.
-- Medido: notifications.type no tiene CHECK (tipos propios 'preferred_contact_time' y 'client_returned');
-- notifications.user_id = agents.id (mismo mapeo que trg_notify_deal_assigned); deals.agent_id es NOT NULL.
--
-- Entrega: al menos una vez. Lo exactamente-una-vez es el encolado (deal_id UNIQUE); un emisor que tarde mas de 5
-- minutos puede coincidir con el que reclama la fila despues (mark devuelve false al segundo): el emisor de P02 debe
-- ser rapido y comprobar el retorno de mark.
--
-- Puramente aditiva: 2 tablas nuevas, 2 columnas nullable nuevas (contacts y deals), 5 funciones nuevas y
-- create_intake_deal ampliada con la misma firma. No toca ninguna fila existente.

create table public.agent_lead_notifications (
  id bigint generated always as identity primary key,
  deal_id uuid not null unique references public.deals(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'dead', 'skipped')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  wa_message_id text,
  notified_agent_id uuid references public.agents(id),
  email_sent_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  alerted_at timestamptz
);

alter table public.agent_lead_notifications enable row level security;
revoke all on table public.agent_lead_notifications from public, anon, authenticated, service_role;
grant select, insert, update on table public.agent_lead_notifications to service_role;
revoke all on sequence public.agent_lead_notifications_id_seq from public, anon, authenticated, service_role;

create or replace function public.create_intake_deal(p_contact_id uuid, p_agent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing uuid;
  v_new      uuid;
begin
  if not (coalesce(public.is_ava_bot(), false) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'create_intake_deal: llamador no autorizado' using errcode = '42501';
  end if;

  -- Se libera solo al terminar la transaccion de esta llamada.
  perform pg_advisory_xact_lock(hashtext(p_contact_id::text));

  select d.id into v_existing
  from public.deals d
  where d.contact_id = p_contact_id
    and d.stage in ('nuevo_sin_contactar', 'lead_captured')
  limit 1;

  if v_existing is not null then
    return null;   -- ya hay uno abierto: NO se notifica otra vez
  end if;

  insert into public.deals (contact_id, agent_id, stage, currency)
  values (p_contact_id, p_agent_id, 'nuevo_sin_contactar', 'USD')
  returning id into v_new;

  -- El aviso nace en la misma transaccion que el deal (D12).
  insert into public.agent_lead_notifications (deal_id, status)
  values (v_new, case when lower(btrim(coalesce((select a.value from public.agency_config a
                                                  where a.key = 'agent_notify_queue_live'), '')))
                           in ('true', '"true"')
                      then 'pending' else 'skipped' end);

  return v_new;
end;
$function$;

create or replace function public.claim_agent_lead_notifications(p_limit int default 10)
returns setof public.agent_lead_notifications
language sql
security definer
set search_path = ''
as $$
  -- 'sending' con mas de 5 minutos = emisor caido a medias: se reclama otra vez, salvo que ya lleve 5 intentos
  -- (una fila que tumba al emisor una y otra vez reenviaria la plantilla para siempre): esa pasa a 'dead'.
  update public.agent_lead_notifications n
     set status = 'dead', last_error = coalesce(n.last_error, 'abandonada en sending tras 5 intentos')
   where n.status = 'sending' and n.claimed_at < now() - interval '5 minutes' and n.attempts >= 5;

  update public.agent_lead_notifications n
     set status = 'sending', attempts = n.attempts + 1, claimed_at = now()
   where n.id in (select q.id
                    from public.agent_lead_notifications q
                   where (q.status in ('pending', 'failed') and q.next_attempt_at <= now())
                      or (q.status = 'sending' and q.claimed_at < now() - interval '5 minutes' and q.attempts < 5)
                   order by q.created_at
                   limit greatest(1, least(coalesce(p_limit, 10), 50))
                   for update skip locked)
  returning n.*
$$;

create or replace function public.mark_agent_lead_notification(
  p_id bigint,
  p_ok boolean,
  p_error text,
  p_wa_message_id text,
  p_agent_id uuid,
  p_email_sent boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal     uuid;
  v_attempts int;
begin
  select n.deal_id, n.attempts into v_deal, v_attempts
  from public.agent_lead_notifications n
  where n.id = p_id and n.status = 'sending'
  for update;
  if not found then
    return false;
  end if;

  if p_ok then
    update public.agent_lead_notifications n
       set status = 'sent', sent_at = now(), wa_message_id = p_wa_message_id, notified_agent_id = p_agent_id,
           last_error = null,
           email_sent_at = case when coalesce(p_email_sent, false) then coalesce(n.email_sent_at, now())
                                else n.email_sent_at end
     where n.id = p_id;
    update public.deals d set agent_notified_at = now() where d.id = v_deal and d.agent_notified_at is null;
  else
    update public.agent_lead_notifications n
       set status = case when v_attempts >= 5 then 'dead' else 'failed' end,
           next_attempt_at = now() + make_interval(mins => power(2, least(v_attempts, 10))::int),
           last_error = left(coalesce(p_error, 'sin detalle del emisor'), 300),
           email_sent_at = case when coalesce(p_email_sent, false) then coalesce(n.email_sent_at, now())
                                else n.email_sent_at end
     where n.id = p_id;
  end if;
  return true;
end;
$$;

create or replace function public.record_campaign_return(p_contact_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal  uuid;
  v_agent uuid;
  v_text  text;
  v_id    uuid;
begin
  if not (coalesce(public.is_ava_bot(), false) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'record_campaign_return: llamador no autorizado' using errcode = '42501';
  end if;

  select d.id, d.agent_id into v_deal, v_agent
  from public.deals d
  where d.contact_id = p_contact_id and d.stage in ('nuevo_sin_contactar', 'lead_captured')
  order by d.created_at desc
  limit 1;
  if v_deal is null then
    return null;
  end if;

  -- Serializa notas del mismo deal para que la deduplicacion no tenga carrera.
  perform pg_advisory_xact_lock(73012, hashtext(v_deal::text));

  v_text := left(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g'), 300);
  if exists (select 1 from public.activities a
              where a.deal_id = v_deal and a.activity_type = 'note' and a.description = v_text
                and a.created_at > now() - interval '10 minutes') then
    return null;
  end if;

  insert into public.activities (contact_id, deal_id, agent_id, activity_type, title, description, is_automated)
  values (p_contact_id, v_deal, v_agent, 'note', 'Volvio por campana', v_text, true)
  returning id into v_id;
  return v_id;
end;
$$;

alter table public.contacts add column if not exists preferred_contact_time text;
alter table public.deals add column if not exists preferred_contact_time text;

create table public.agent_time_notifications (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals(id) on delete cascade,
  preferred_contact_time text not null,
  created_at timestamptz not null default now(),
  attempts int not null default 0,
  email_sent_at timestamptz,
  last_error text
);

create index agent_time_notifications_deal_idx on public.agent_time_notifications (deal_id);

alter table public.agent_time_notifications enable row level security;
revoke all on table public.agent_time_notifications from public, anon, authenticated, service_role;
grant select, update on table public.agent_time_notifications to service_role;
revoke all on sequence public.agent_time_notifications_id_seq from public, anon, authenticated, service_role;

create or replace function public.record_preferred_contact_time(p_contact_id uuid, p_text text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text  text;
  v_cur   text;
  v_name  text;
  v_deal  uuid;
  v_agent uuid;
  v_deal_time text;
begin
  if not (coalesce(public.is_ava_bot(), false) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'record_preferred_contact_time: llamador no autorizado' using errcode = '42501';
  end if;

  v_text := left(btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g')), 80);
  if v_text = '' then
    raise exception 'record_preferred_contact_time: hora vacia' using errcode = '22023';
  end if;

  -- Serializa por contacto: dos mensajes simultaneos con la misma hora no crean dos avisos.
  perform pg_advisory_xact_lock(73013, hashtext(p_contact_id::text));

  select c.preferred_contact_time, c.first_name into v_cur, v_name
  from public.contacts c
  where c.id = p_contact_id;
  if not found then
    raise exception 'record_preferred_contact_time: contacto inexistente' using errcode = 'P0002';
  end if;

  select d.id, d.agent_id, d.preferred_contact_time into v_deal, v_agent, v_deal_time
  from public.deals d
  where d.contact_id = p_contact_id and d.stage in ('nuevo_sin_contactar', 'lead_captured')
  order by d.created_at desc
  limit 1;

  if v_cur is distinct from v_text then
    update public.contacts c set preferred_contact_time = v_text where c.id = p_contact_id;
  end if;
  -- Sin deal abierto solo se guarda en el contacto. Con deal, se avisa si la hora es nueva PARA EL DEAL: una hora dada
  -- antes de que existiera el deal (o en un deal ya cerrado) llega al agente cuando el cliente la repite.
  if v_deal is null or v_deal_time is not distinct from v_text then
    return null;
  end if;

  update public.deals d set preferred_contact_time = v_text where d.id = v_deal;

  -- first_name lo controla el cliente (nombre de perfil): sin caracteres de control y recortado.
  v_name := nullif(btrim(left(regexp_replace(coalesce(v_name, ''), '[[:cntrl:]]', ' ', 'g'), 40)), '');
  insert into public.notifications (user_id, type, title, link)
  values (v_agent, 'preferred_contact_time',
          'Hora preferida de ' || coalesce(v_name, 'tu cliente') || ': ' || v_text,
          '/dashboard/pipeline/' || v_deal);
  insert into public.agent_time_notifications (deal_id, preferred_contact_time) values (v_deal, v_text);
  return v_deal;
end;
$$;

create or replace function public.notify_agent_client_returned(p_contact_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal  uuid;
  v_agent uuid;
  v_name  text;
  v_link  text;
  v_id    uuid;
begin
  if not (coalesce(public.is_ava_bot(), false) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'notify_agent_client_returned: llamador no autorizado' using errcode = '42501';
  end if;

  select d.id, d.agent_id into v_deal, v_agent
  from public.deals d
  where d.contact_id = p_contact_id and d.stage in ('nuevo_sin_contactar', 'lead_captured')
  order by d.created_at desc
  limit 1;
  if v_deal is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(73012, hashtext(v_deal::text));

  v_link := '/dashboard/pipeline/' || v_deal;
  if exists (select 1 from public.notifications n
              where n.user_id = v_agent and n.type = 'client_returned' and n.link = v_link
                and n.created_at > now() - interval '24 hours') then
    return null;   -- como mucho 1 campanita cada 24 h por deal y dueno (si el deal cambia de dueno, el nuevo la recibe)
  end if;

  select nullif(btrim(left(regexp_replace(coalesce(c.first_name, ''), '[[:cntrl:]]', ' ', 'g'), 40)), '')
    into v_name
  from public.contacts c
  where c.id = p_contact_id;

  insert into public.notifications (user_id, type, title, link)
  values (v_agent, 'client_returned', concat_ws(' ', 'Tu cliente', v_name, 'volvio a escribir'), v_link)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_intake_deal(uuid, uuid), public.record_campaign_return(uuid, text),
  public.record_preferred_contact_time(uuid, text), public.notify_agent_client_returned(uuid),
  public.claim_agent_lead_notifications(int),
  public.mark_agent_lead_notification(bigint, boolean, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.create_intake_deal(uuid, uuid), public.record_campaign_return(uuid, text),
  public.record_preferred_contact_time(uuid, text), public.notify_agent_client_returned(uuid)
  to authenticated, service_role;
grant execute on function public.claim_agent_lead_notifications(int),
  public.mark_agent_lead_notification(bigint, boolean, text, text, uuid, boolean) to service_role;

notify pgrst, 'reload schema';
