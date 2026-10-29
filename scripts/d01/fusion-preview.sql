-- scripts/d01/fusion-preview.sql
--
-- D01-P04 (Etapa 2c, D8), paso 2 de 4: calcula y GUARDA lo que la fusion va a tocar. Solo lee public; escribe en
-- d01_private. Re-ejecutable mientras la fusion no se haya aplicado (despues de un plan nuevo hay que repetirlo).
--
-- d01_private.fusion_sets() devuelve (vista, tabla, row_id, de, a) para cada fila que la fusion toca:
--   h1                        miembros VIVOS de los grupos de H1 (un contacto nuevo en un grupo cambia el conjunto)
--   contactos_supervivientes  reciben las columnas que les faltan (reglas de d01_private.contact_rules())
--   contactos_perdedores      se borran al final (de = el perdedor, a = su superviviente)
--   mover:<tabla>.<col>       filas de cualquier tabla con FK de una columna hacia contacts (salvo deals) que apuntan
--                             a un perdedor: pasan al superviviente
--   deals_intake              deals abiertos de intake (nuevo_sin_contactar, lead_captured) de todo el grupo
--   deal_conservado           uno por grupo: el de agent_id = agente del superviviente, el mas antiguo; si ninguno
--                             coincide, el mas antiguo del superviviente; si no tiene, el mas antiguo de los perdedores
--   deals_a_borrar            los demas deals de intake abiertos del grupo (a = el deal conservado)
--   deals_a_mover             el resto de deals de los perdedores (y el conservado si es de un perdedor): al superviviente
--   repuntar:<tabla>.<col>    filas con FK SET NULL / NO ACTION hacia un deal a borrar: pasan al deal conservado
--   cascada:<tabla>.<col>     filas con FK ON DELETE CASCADE hacia un deal a borrar: se copian y se van con el deal
-- Las tablas salen del catalogo (pg_constraint), no de una lista escrita a mano: una tabla hija que nadie enumero
-- tambien se mueve. d01_private.fk_snapshot guarda la huella de esas FK y d01_private.preview_meta el md5 del conjunto
-- (el que se ensena a Ivan en el checkpoint); fusion-apply.sql aborta si cualquiera de los dos cambia.
--
-- Aserciones (abortan):
--   - el rol que ejecuta salta RLS (si no, el preview y el apply verian el mismo subconjunto);
--   - toda FK hacia contacts y deals es de una columna uuid, apunta a su clave primaria y la tabla hija tiene una PK de
--     una columna;
--   - d01_private.assert_schema(): columnas contact_id / deal_id sin FK, FK hacia tablas con filas 'cascada:' e
--     indices unicos que harian fallar un UPDATE de la fusion (el apply la repite);
--   - d01_private.assert_survivors(): el deal conservado tiene el agente del superviviente (la fusion nunca cambia
--     deals.agent_id ni contacts.agent_id: ni campanitas ni avisos) y en los grupos del admin el superviviente tiene un
--     agente activo en el RR;
--   - d01_private.lock_down(): PUBLIC, anon, authenticated y service_role sin USAGE en d01_private ni privilegio
--     alguno (tampoco por columna) sobre sus tablas, vistas, secuencias y funciones; RLS en toda tabla; toda vista con
--     security_invoker.

do $preview$
declare
  v_list text;
begin
  perform set_config('lock_timeout', '3s', true);

  if to_regclass('d01_private.fusion_plan') is null or to_regclass('d01_private.fusion_losers') is null then
    raise exception 'fusion-preview: falta el plan (ejecuta antes fusion-plan.sql)';
  end if;
  if exists (select 1 from d01_private.fusion_log where event = 'applied') then
    raise exception 'fusion-preview: la fusion ya se aplico (d01_private.fusion_log)';
  end if;
  if not (select r.rolsuper or r.rolbypassrls from pg_catalog.pg_roles r where r.rolname = current_user) then
    raise exception 'fusion-preview: % no salta RLS: el preview no veria todas las filas', current_user;
  end if;

  create or replace function d01_private.pk_col(p_table regclass)
  returns text
  language plpgsql
  stable
  set search_path = ''
  as $fn$
  declare
    v_cols text[];
  begin
    select array_agg(a.attname::text order by a.attnum) into v_cols
      from pg_catalog.pg_index i
      join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
     where i.indrelid = p_table and i.indisprimary;
    if cardinality(v_cols) is distinct from 1 then
      raise exception 'pk_col: % no tiene una clave primaria de una columna', p_table;
    end if;
    return v_cols[1];
  end
  $fn$;

  create or replace function d01_private.fk_children(p_parent regclass)
  returns table (child text, col text, pk text, on_delete text)
  language plpgsql
  stable
  set search_path = ''
  as $fn$
  declare
    r record;
  begin
    for r in
      select k.conrelid, k.conname, k.conkey, k.confkey, k.confdeltype::text as deltype,
             k.conrelid::regclass::text as child_name
        from pg_catalog.pg_constraint k
       where k.contype = 'f' and k.confrelid = p_parent
       order by k.conrelid::regclass::text, k.conname
    loop
      if cardinality(r.conkey) <> 1 then
        raise exception 'fk_children: % (%) es una FK de varias columnas', r.child_name, r.conname;
      end if;
      if (select a.attname::text from pg_catalog.pg_attribute a where a.attrelid = p_parent and a.attnum = r.confkey[1])
         <> d01_private.pk_col(p_parent) then
        raise exception 'fk_children: % (%) no apunta a la clave primaria de %', r.child_name, r.conname, p_parent;
      end if;
      if (select n.nspname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where c.oid = r.conrelid) <> 'public' then
        raise exception 'fk_children: % no esta en public', r.child_name;
      end if;
      child := r.child_name;
      select a.attname::text into col
        from pg_catalog.pg_attribute a where a.attrelid = r.conrelid and a.attnum = r.conkey[1];
      if (select a.atttypid from pg_catalog.pg_attribute a where a.attrelid = r.conrelid and a.attnum = r.conkey[1])
         <> 'uuid'::regtype then
        raise exception 'fk_children: %.% no es uuid', r.child_name, col;
      end if;
      pk := d01_private.pk_col(r.conrelid::regclass);
      on_delete := r.deltype;
      return next;
    end loop;
  end
  $fn$;

  -- Regla de fusion de CADA columna no generada de contacts (lista cerrada: el preview y el apply abortan si una
  -- columna no tiene regla o una regla nombra una columna que no existe). Lo aplica fusion-apply.sql, perdedor a
  -- perdedor del mas antiguo al mas nuevo:
  --   conservar     el valor del superviviente (identidad, agente, telefonos, estado y clasificacion, fechas propias)
  --   si_nulo       el del perdedor solo si el superviviente lo tiene NULL
  --   si_vacio      el del perdedor si el del superviviente es NULL o su default ('unknown', 'exploring', 0, '{}') y
  --                 el del perdedor no lo es (estas columnas nunca son NULL en la practica)
  --   nombre        si el superviviente no tiene first_name (NULL o 'Importado', el que pone el import sin nombre):
  --                 el first_name del perdedor, y su last_name solo si trae uno
  --   meta_lead_id  si_nulo, poniendo antes a NULL el del perdedor (indice unico)
  --   presupuesto   budget_min, budget_max y budget_currency juntos, si el superviviente no tiene ni min ni max
  --   mayor         greatest (ultima actividad, ultimo mensaje, numero de seguimientos)
  --   o             true si cualquiera es true (baja de WhatsApp, pausa de Ava, candidato a agente)
  -- lead_status y lead_classification son 'conservar' aunque trg_auto_qualification los recalcule al copiar
  -- presupuesto, tipos o plazo: el apply los devuelve a su valor. is_responded y first_response_at son del agente del
  -- superviviente (trg_contact_reassigned), por eso 'conservar'.
  create or replace function d01_private.contact_rules()
  returns table (columna text, regla text)
  language sql
  immutable
  set search_path = ''
  as $fn$
    select v.c, v.r from (values
      ('id', 'conservar'), ('agent_id', 'conservar'), ('phone', 'conservar'), ('whatsapp_number', 'conservar'),
      ('source', 'conservar'), ('lead_status', 'conservar'), ('lead_classification', 'conservar'),
      ('qualification_source', 'conservar'),
      ('score_budget', 'conservar'), ('score_urgency', 'conservar'), ('score_payment', 'conservar'),
      ('score_location', 'conservar'), ('score_property_type', 'conservar'), ('score_purpose', 'conservar'),
      ('is_qualified', 'conservar'), ('qualified_at', 'conservar'), ('qualified_by', 'conservar'),
      ('next_follow_up_at', 'conservar'), ('language', 'conservar'), ('country', 'conservar'),
      ('created_at', 'conservar'), ('updated_at', 'conservar'), ('assigned_at', 'conservar'),
      ('reassignment_count', 'conservar'), ('previous_agent_id', 'conservar'), ('first_response_at', 'conservar'),
      ('is_responded', 'conservar'), ('archived_at', 'conservar'),
      ('email', 'si_nulo'), ('source_detail', 'si_nulo'), ('campaign_id', 'si_nulo'), ('meta_ad_id', 'si_nulo'),
      ('ctwa_clid', 'si_nulo'), ('ai_summary', 'si_nulo'), ('agent_notes', 'si_nulo'), ('tags', 'si_nulo'),
      ('city', 'si_nulo'), ('bedrooms', 'si_nulo'), ('decision_maker', 'si_nulo'), ('linked_property_id', 'si_nulo'),
      ('preferred_locations', 'si_nulo'), ('property_types', 'si_nulo'), ('operation_type', 'si_nulo'),
      ('condition', 'si_nulo'), ('follow_up_state', 'si_nulo'), ('meta_campaign_id', 'si_nulo'),
      ('lead_form_answers', 'si_nulo'), ('meta_campaign_name', 'si_nulo'), ('meta_adset_id', 'si_nulo'),
      ('meta_adset_name', 'si_nulo'), ('meta_ad_name', 'si_nulo'), ('meta_form_name', 'si_nulo'),
      ('meta_platform', 'si_nulo'), ('preferred_contact_time', 'si_nulo'),
      ('purpose', 'si_vacio'), ('payment_method', 'si_vacio'), ('timeline', 'si_vacio'), ('lead_score', 'si_vacio'),
      ('desired_amenities', 'si_vacio'),
      ('first_name', 'nombre'), ('last_name', 'nombre'),
      ('meta_lead_id', 'meta_lead_id'),
      ('budget_min', 'presupuesto'), ('budget_max', 'presupuesto'), ('budget_currency', 'presupuesto'),
      ('last_activity_at', 'mayor'), ('last_message_at', 'mayor'), ('follow_up_count', 'mayor'),
      ('wa_opted_out', 'o'), ('ava_paused', 'o'), ('is_recruit_candidate', 'o')
    ) as v(c, r)
  $fn$;

  create or replace function d01_private.contact_rules_gap()
  returns text
  language sql
  stable
  set search_path = ''
  as $fn$
    select nullif(concat_ws('; ',
      'sin regla: ' || (select string_agg(a.attname::text, ', ' order by a.attnum)
                          from pg_catalog.pg_attribute a
                         where a.attrelid = 'public.contacts'::regclass and a.attnum > 0 and not a.attisdropped
                           and a.attgenerated = ''
                           and a.attname::text not in (select r.columna from d01_private.contact_rules() r)),
      'regla sin columna: ' || (select string_agg(r.columna, ', ')
                                  from d01_private.contact_rules() r
                                 where r.columna not in (select a.attname::text from pg_catalog.pg_attribute a
                                                          where a.attrelid = 'public.contacts'::regclass and a.attnum > 0
                                                            and not a.attisdropped and a.attgenerated = ''))), '')
  $fn$;

  create or replace function d01_private.deal_sets()
  returns table (vista text, row_id text, de text, a text)
  language sql
  stable
  set search_path = ''
  as $fn$
    with grp as (
      select p.s10, p.survivor_final, m.id as cid
        from d01_private.fusion_plan p
        cross join lateral unnest(p.ids) as m(id)
    ), intake as (
      select g.s10, g.survivor_final, d.id, d.contact_id, d.agent_id, d.created_at
        from public.deals d
        join grp g on g.cid = d.contact_id
       where d.stage in ('nuevo_sin_contactar', 'lead_captured')
    ), kept as (
      select distinct on (i.s10) i.s10, i.id, i.survivor_final
        from intake i
        join public.contacts s on s.id = i.survivor_final
       order by i.s10,
                (i.agent_id is not distinct from s.agent_id) desc,
                case when i.agent_id is not distinct from s.agent_id then false
                     else i.contact_id = i.survivor_final end desc,
                i.created_at, i.id
    )
    select 'deals_intake', i.id::text, i.contact_id::text, i.survivor_final::text from intake i
    union all
    select 'deal_conservado', k.id::text, null, k.survivor_final::text from kept k
    union all
    select 'deals_a_borrar', i.id::text, i.id::text, k.id::text
      from intake i join kept k on k.s10 = i.s10
     where i.id <> k.id
    union all
    select 'deals_a_mover', d.id::text, d.contact_id::text, l.survivor_final::text
      from public.deals d
      join d01_private.fusion_losers l on l.loser = d.contact_id
     where not exists (select 1 from intake i join kept k on k.s10 = i.s10 where i.id = d.id and i.id <> k.id)
  $fn$;

  create or replace function d01_private.fusion_sets()
  returns table (vista text, tabla text, row_id text, de text, a text)
  language plpgsql
  stable
  set search_path = ''
  as $fn$
  #variable_conflict use_column
  declare
    r record;
  begin
    return query
      with n as (
        select c.id, right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) as s10
          from public.contacts c
         where c.phone is not null
      )
      select 'h1'::text, 'public.contacts'::text, n.id::text, n.s10, null::text
        from n
       where length(n.s10) = 10
         and n.s10 in (select n2.s10 from n n2 where length(n2.s10) = 10 group by n2.s10 having count(*) > 1);

    return query
      select 'contactos_supervivientes'::text, 'public.contacts'::text, p.survivor_final::text, p.s10, null::text
        from d01_private.fusion_plan p;
    return query
      select 'contactos_perdedores'::text, 'public.contacts'::text, l.loser::text, l.loser::text, l.survivor_final::text
        from d01_private.fusion_losers l;

    for r in select f.child, f.col, f.pk from d01_private.fk_children('public.contacts'::regclass) f
              where f.child <> 'public.deals' loop
      return query execute format(
        'select %L::text, %L::text, t.%I::text, t.%I::text, l.survivor_final::text
           from %s t join d01_private.fusion_losers l on l.loser = t.%I',
        'mover:' || r.child || '.' || r.col, r.child, r.pk, r.col, r.child, r.col);
    end loop;

    return query
      select ds.vista, 'public.deals'::text, ds.row_id, ds.de, ds.a from d01_private.deal_sets() ds;

    for r in select f.child, f.col, f.pk, f.on_delete from d01_private.fk_children('public.deals'::regclass) f loop
      return query execute format(
        'select %L::text, %L::text, t.%I::text, t.%I::text, %s
           from %s t join d01_private.deal_sets() b on b.vista = %L and b.row_id = t.%I::text',
        case when r.on_delete = 'c' then 'cascada:' else 'repuntar:' end || r.child || '.' || r.col,
        r.child, r.pk, r.col,
        case when r.on_delete = 'c' then 'null::text' else 'b.a' end,
        r.child, 'deals_a_borrar', r.col);
    end loop;
  end
  $fn$;

  create or replace function d01_private.sets_hash()
  returns text
  language sql
  stable
  set search_path = ''
  as $fn$
    select md5(coalesce(string_agg(s.vista || '|' || s.tabla || '|' || s.row_id || '|' || coalesce(s.de, '') || '|'
                                   || coalesce(s.a, ''), ',' order by s.vista, s.row_id), ''))
      from d01_private.fusion_sets() s
  $fn$;

  -- Comprobaciones que dependen de datos que fusion_sets() no compara (agentes): el apply las repite.
  create or replace function d01_private.assert_survivors()
  returns void
  language plpgsql
  stable
  set search_path = ''
  as $fn$
  begin
    if exists (select 1
                 from d01_private.deal_sets() k
                 join public.deals d on d.id::text = k.row_id
                 join public.contacts s on s.id::text = k.a
                where k.vista = 'deal_conservado' and d.agent_id is distinct from s.agent_id) then
      raise exception 'assert_survivors: un deal conservado tiene un agente distinto del agente del superviviente';
    end if;
    if exists (select 1 from d01_private.fusion_plan p
                 join public.contacts s on s.id = p.survivor_final
                where exists (select 1 from public.contacts c join public.agents a on a.id = c.agent_id
                               where c.id = any(p.ids) and a.role = 'admin')
                  and not exists (select 1 from public.round_robin_config r
                                   where r.agent_id = s.agent_id and r.is_active)) then
      raise exception 'assert_survivors: en un grupo con un contacto del admin el superviviente no tiene un agente activo en el RR';
    end if;
  end
  $fn$;

  -- Cierra d01_private y lo mide: lo llaman el preview y el apply (que crea las copias con PII).
  create or replace function d01_private.lock_down()
  returns void
  language plpgsql
  set search_path = ''
  as $fn$
  declare
    r record;
  begin
    revoke all on schema d01_private from public, anon, authenticated, service_role;
    revoke all on all tables in schema d01_private from public, anon, authenticated, service_role;
    revoke all on all sequences in schema d01_private from public, anon, authenticated, service_role;
    revoke all on all functions in schema d01_private from public, anon, authenticated, service_role;
    for r in select c.oid::regclass as t from pg_catalog.pg_class c
              where c.relnamespace = 'd01_private'::regnamespace and c.relkind = 'r' and not c.relrowsecurity loop
      execute format('alter table %s enable row level security', r.t);
    end loop;
    if has_schema_privilege('anon', 'd01_private', 'usage')
       or has_schema_privilege('authenticated', 'd01_private', 'usage')
       or has_schema_privilege('service_role', 'd01_private', 'usage') then
      raise exception 'lock_down: un rol cliente tiene USAGE en d01_private';
    end if;
    if exists (select 1 from pg_catalog.pg_class c cross join (values ('anon'), ('authenticated'), ('service_role')) x(rol)
                where c.relnamespace = 'd01_private'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')
                  and (has_table_privilege(x.rol, c.oid, 'select,insert,update,delete,truncate,references,trigger,maintain')
                       or has_any_column_privilege(x.rol, c.oid, 'select,insert,update,references'))) then
      raise exception 'lock_down: un rol cliente tiene privilegios sobre una tabla o vista de d01_private';
    end if;
    if exists (select 1 from pg_catalog.pg_class c cross join (values ('anon'), ('authenticated'), ('service_role')) x(rol)
                where c.relnamespace = 'd01_private'::regnamespace and c.relkind = 'S'
                  and has_sequence_privilege(x.rol, c.oid, 'usage,select,update')) then
      raise exception 'lock_down: un rol cliente tiene privilegios sobre una secuencia de d01_private';
    end if;
    if exists (select 1 from pg_catalog.pg_proc f cross join (values ('anon'), ('authenticated'), ('service_role')) x(rol)
                where f.pronamespace = 'd01_private'::regnamespace and has_function_privilege(x.rol, f.oid, 'execute')) then
      raise exception 'lock_down: un rol cliente puede ejecutar una funcion de d01_private';
    end if;
    if exists (select 1 from pg_catalog.pg_class c
                where c.relnamespace = 'd01_private'::regnamespace and c.relkind = 'v'
                  and not coalesce(c.reloptions @> array['security_invoker=true'], false)) then
      raise exception 'lock_down: una vista de d01_private no es security_invoker';
    end if;
    if exists (select 1 from pg_catalog.pg_class c
                where c.relnamespace = 'd01_private'::regnamespace and c.relkind = 'r' and not c.relrowsecurity) then
      raise exception 'lock_down: una tabla de d01_private sin RLS';
    end if;
  end
  $fn$;

  -- Aserciones sobre el esquema (no sobre filas): las repite el apply, porque una tabla nueva entre el preview y el
  -- apply no cambia fusion_sets() si sus filas no estan en los conjuntos.
  --   - columnas contact_id / deal_id sin FK en tablas de public (referencias que el catalogo no ve). Los arrays
  --     historicos de ids (contact_match_events.candidate_ids) no entran: son un registro de auditoria, no un enlace;
  --   - FK hacia una tabla con filas 'cascada:' (la cascada de segundo nivel borraria sin copia);
  --   - indice unico de una tabla hija a mover sobre su columna FK, o de contacts sobre una columna que se copia (salvo
  --     meta_lead_id, que se trata aparte). deals_a_mover no entra: un indice unico parcial de intake por contacto es
  --     compatible porque el apply borra los deals sobrantes ANTES de mover el conservado (probado en el banco); otro
  --     indice daria 23505 y el apply, una sola transaccion, abortaria entero.
  create or replace function d01_private.assert_schema()
  returns void
  language plpgsql
  stable
  set search_path = ''
  as $fn$
  declare
    v_list text;
  begin
    select string_agg(format('public.%I.%I', c.relname, a.attname), ', ') into v_list
      from pg_catalog.pg_class c
      join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       and a.attname ~ '(^|_)(contact|deal)_id$'
       and not exists (select 1 from pg_catalog.pg_constraint k
                        where k.contype = 'f' and k.conrelid = c.oid and a.attnum = any(k.conkey));
    if v_list is not null then
      raise exception 'assert_schema: columnas con referencia a contactos o deals sin FK: %', v_list;
    end if;

    select string_agg(distinct format('%s -> %s', k.conrelid::regclass, k.confrelid::regclass), ', ') into v_list
      from pg_catalog.pg_constraint k
     where k.contype = 'f'
       and k.confrelid in (select p.tabla::regclass from d01_private.preview_ids p where p.vista like 'cascada:%');
    if v_list is not null then
      raise exception 'assert_schema: FK hacia tablas que se borran en cascada con los deals: %', v_list;
    end if;

    if exists (
      select 1
        from (select distinct p.tabla, substring(p.vista from '\.([^.]+)$') as col
                from d01_private.preview_ids p
               where p.vista like 'mover:%' or p.vista like 'repuntar:%') m
        join pg_catalog.pg_index i on i.indrelid = m.tabla::regclass and i.indisunique
        join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where a.attname = m.col) then
      raise exception 'assert_schema: una tabla a mover tiene un indice unico sobre su columna FK';
    end if;
    select string_agg(distinct format('%s(%s)', i.indexrelid::regclass, a.attname), ', ') into v_list
      from pg_catalog.pg_index i
      join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
     where i.indrelid = 'public.contacts'::regclass and i.indisunique
       and a.attname::text in (select r.columna from d01_private.contact_rules() r
                                where r.regla not in ('conservar', 'meta_lead_id'));
    if v_list is not null then
      raise exception 'assert_schema: indices unicos de contacts sobre columnas que se copian: %', v_list;
    end if;
  end
  $fn$;

  if d01_private.contact_rules_gap() is not null then
    raise exception 'fusion-preview: reglas de columnas de contacts incompletas (%)', d01_private.contact_rules_gap();
  end if;

  drop view if exists d01_private.v_resumen;
  drop table if exists d01_private.preview_ids;
  drop table if exists d01_private.preview_meta;
  drop table if exists d01_private.fk_snapshot;

  create table d01_private.fk_snapshot as
  select 'public.contacts'::text as parent, f.child, f.col, f.pk, f.on_delete
    from d01_private.fk_children('public.contacts'::regclass) f
  union all
  select 'public.deals'::text, f.child, f.col, f.pk, f.on_delete
    from d01_private.fk_children('public.deals'::regclass) f;

  create table d01_private.preview_ids as select * from d01_private.fusion_sets();
  alter table d01_private.preview_ids add primary key (vista, row_id);
  create table d01_private.preview_meta as select d01_private.sets_hash() as hash, now() as at;

  perform d01_private.assert_schema();
  perform d01_private.assert_survivors();

  create view d01_private.v_resumen with (security_invoker = true) as
  select p.vista, p.tabla, count(*) as filas from d01_private.preview_ids p group by p.vista, p.tabla;

  perform d01_private.lock_down();
end
$preview$;

select vista, tabla, filas, (select hash from d01_private.preview_meta) as preview_hash
  from d01_private.v_resumen
 order by tabla, vista;
