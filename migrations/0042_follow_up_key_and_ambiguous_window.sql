-- 0042_follow_up_key_and_ambiguous_window.sql
--
-- D01-P04 (pendientes de P03, decididos por Ivan el 2026-10-29): dos funciones, sin tocar filas.
--   1. increment_follow_up_count(p_phone): Ava (agent/follow_up.py) la llama con el wa_id SIN '+' y comparaba phone
--      y whatsapp_number EXACTOS; desde P03 los contactos nuevos de Ava guardan '+wa_id', asi que su contador de
--      seguimientos no subia nunca (lo lee brain.py para el prompt). Ahora compara la clave canonica:
--      phone_key = public.phone_key(p_phone), la misma que el indice unico de 0040 (a lo sumo 1 fila; phone_match
--      podria casar 2; medido en prod: 0 contactos con phone y whatsapp_number de claves distintas). Y solo la ejecuta
--      Ava (is_ava_bot) o service_role: era SECURITY DEFINER sin guard y cualquier agente podia subir el contador de un
--      contacto que no ve. Edge logs 2026-10-22/23: 116 llamadas, todas de Ava (python-httpx, sujeto de
--      info@remaxadvance.com); 0 en las ultimas 24 h. search_path vacio y nombres cualificados (R8 de P01). Mismo ACL.
--      No cubre las variantes de pais de resolve_contact (AR 549/54, MX 521/52, ES, BR): un wa_id 549... frente a un
--      contacto +54... sigue sin contar (tampoco contaba antes; el seguimiento no decide por el contador).
--   2. resolve_contact: el evento 'ambiguous' se escribe como mucho 1 vez cada 24 h por conjunto de candidatos, como ya
--      hacian 'dup_group' y 'variant' por contacto; antes cada llamada (cada mensaje de Ava, cada pasada del poller)
--      insertaba uno. El resto del cuerpo es el de 0035 sin cambiar un byte (lo comprueba el banco).
-- Medido en prod el 2026-10-29: md5(prosrc) de resolve_contact 150ed8e45a8981935275599a519c84c3 (= 0035) y de
-- increment_follow_up_count 7217501e00f10335d0984480cff3ba1d (search_path=public); los dos SECURITY DEFINER de postgres con EXECUTE
-- para authenticated y service_role. CREATE OR REPLACE conserva ACL, owner y oid.
-- Idempotente (acepta tambien los cuerpos nuevos). Rollback: migrations/rollback/0042-down.sql.
-- Se aplica con fin de linea LF: con CRLF los cuerpos cambian de md5 y la postcondicion aborta.

set local lock_timeout = '3s';
do $$
begin
  if current_setting('lock_timeout') <> '3s' then
    raise exception '0042: lock_timeout no aplicado (la migracion debe correr dentro de una transaccion)';
  end if;
end $$;

-- 1. Precondicion.
do $$
declare
  v_rc oid := to_regprocedure('public.resolve_contact(text, text, text, text, text, text, boolean, boolean)');
  v_inc oid := to_regprocedure('public.increment_follow_up_count(text)');
begin
  if v_rc is null or v_inc is null then
    raise exception '0042: precondicion: faltan resolve_contact o increment_follow_up_count';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = v_rc and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
                    and md5(p.prosrc) in ('150ed8e45a8981935275599a519c84c3', 'c16356a8631a94884c95d4bd8eca7f09')) then
    raise exception '0042: precondicion: resolve_contact no es la de 0035 (ni la de 0042)';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = v_inc and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
                    and md5(p.prosrc) in ('7217501e00f10335d0984480cff3ba1d', 'c5b91d0c738f56810dd9e890c684a150')) then
    raise exception '0042: precondicion: increment_follow_up_count no es la medida en prod';
  end if;
  if (select array_agg(s.g order by s.g collate "C")
        from (select distinct case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end as g
                from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
               where p.oid = v_rc and x.privilege_type = 'EXECUTE') s)
     is distinct from array['authenticated', 'postgres', 'service_role'] then
    raise exception '0042: precondicion: resolve_contact debe ejecutarla exactamente authenticated, postgres y service_role';
  end if;
  if (select array_agg(s.g order by s.g collate "C")
        from (select distinct case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end as g
                from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
               where p.oid = v_inc and x.privilege_type = 'EXECUTE') s)
     is distinct from array['authenticated', 'postgres', 'service_role'] then
    raise exception '0042: precondicion: increment_follow_up_count debe ejecutarla exactamente authenticated, postgres y service_role';
  end if;
end $$;

-- 2. increment_follow_up_count por clave canonica.
create or replace function public.increment_follow_up_count(p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo Ava o service_role: un agente cualquiera podia subir el contador de un contacto ajeno (lo lee el prompt de Ava).
  if not (coalesce(public.is_ava_bot(), false) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'increment_follow_up_count: llamador no autorizado' using errcode = '42501';
  end if;
  update public.contacts
     set follow_up_count = coalesce(follow_up_count, 0) + 1,
         updated_at      = now()
   where phone_key = public.phone_key(p_phone);
end
$$;

-- 3. resolve_contact (0035) con la ventana de 24 h para 'ambiguous'.
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
      -- 0042: como dup_group y variant, 1 evento cada 24 h por conjunto de candidatos (antes, uno por llamada).
      if not exists (select 1 from public.contact_match_events e
                      where e.kind = 'ambiguous' and e.candidate_ids @> v_ids and e.candidate_ids <@ v_ids
                        and e.created_at > now() - interval '24 hours') then
        insert into public.contact_match_events (kind, caller, key_last4, contact_id, candidate_ids, source)
        values ('ambiguous', v_caller, v_last4, null, v_ids, p_source);
      end if;
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

-- 4. Postcondicion.
do $$
declare
  v_rc oid := to_regprocedure('public.resolve_contact(text, text, text, text, text, text, boolean, boolean)');
  v_inc oid := to_regprocedure('public.increment_follow_up_count(text)');
begin
  if not exists (select 1 from pg_proc p where p.oid = v_rc and p.prosecdef and p.proconfig = array['search_path=""']
                    and md5(p.prosrc) = 'c16356a8631a94884c95d4bd8eca7f09') then
    raise exception '0042: postcondicion: resolve_contact no quedo con el cuerpo de 0042';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = v_inc and p.prosecdef and p.proconfig = array['search_path=""']
                    and md5(p.prosrc) = 'c5b91d0c738f56810dd9e890c684a150') then
    raise exception '0042: postcondicion: increment_follow_up_count no quedo con el cuerpo de 0042';
  end if;
  if (select array_agg(s.g order by s.g collate "C")
        from (select distinct case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end as g
                from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
               where p.oid = v_rc and x.privilege_type = 'EXECUTE') s)
     is distinct from array['authenticated', 'postgres', 'service_role'] then
    raise exception '0042: postcondicion: resolve_contact debe ejecutarla exactamente authenticated, postgres y service_role';
  end if;
  if (select array_agg(s.g order by s.g collate "C")
        from (select distinct case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end as g
                from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
               where p.oid = v_inc and x.privilege_type = 'EXECUTE') s)
     is distinct from array['authenticated', 'postgres', 'service_role'] then
    raise exception '0042: postcondicion: increment_follow_up_count debe ejecutarla exactamente authenticated, postgres y service_role';
  end if;
end $$;

notify pgrst, 'reload schema';
