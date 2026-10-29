-- scripts/d01/fusion-apply.sql
--
-- D01-P04 (Etapa 2c, D8), paso 3 de 4: la fusion. UN solo DO block: si algo no cuadra, aborta y no cambia nada.
-- Requisitos: fusion-plan.sql y fusion-preview.sql ejecutados y revisados por Ivan (checkpoint, con el preview_hash
-- que muestra el preview). Ejecutar como postgres (salta RLS), en un momento sin mensajes recientes en los contactos
-- del plan. Reversion: fusion-rollback.sql (mientras exista d01_private; antes, el rollback de 0040).
--
-- Que hace, en este orden:
--   0. Cerrojos, en el mismo orden que el resto del sistema. Advisory: (73010, ultimos 8 digitos) de cada grupo, el MISMO
--      que toma resolve_contact (Ava y el CRM esperan y despues ven solo al superviviente); hashtext(contacto) de
--      create_intake_deal (no puede leer "sin deal abierto" mientras se mueve uno) y (73013, contacto) de
--      record_preferred_contact_time; (73012, deal) de record_campaign_return. Filas, FOR UPDATE por orden de id: las
--      hijas en CASCADE de los deals del plan (agent_lead_notifications, ...: el emisor bloquea su fila y despues el
--      deal); los contactos; los deals (un insert con FK bloquea el contacto y despues el deal). Un insert concurrente
--      con FK hacia ellos espera.
--   1. La huella de FK, las reglas de columnas y el conjunto son los del preview: fusion_sets() devuelve EXACTAMENTE
--      d01_private.preview_ids (las dos direcciones, con de y a) y su md5 es el preview_hash. Si no: 'el conjunto de X
--      cambio desde el preview' y no se toca nada (W11). Repite assert_schema() (tablas nuevas) y assert_survivors()
--      (agentes) del preview.
--   2. Copia d01_private.bkp_<tabla> de toda fila que aparece en preview_ids. Las copias nacen sin privilegios para los
--      roles de la API (anon, authenticated, service_role: sin default privileges en d01_private ni USAGE) y nadie las
--      ve hasta el commit; al final, d01_private.lock_down() les pone RLS, revoca de nuevo y lo mide (si algo es
--      legible, aborta todo). Los roles internos de Supabase con pg_read_all_data o BYPASSRLS (postgres,
--      supabase_admin, ...) las leen, igual que ya leen public.contacts; las copias se borran en P06.
--   3. Supervivientes: meta_lead_id del perdedor a NULL (indice unico) y, perdedor a perdedor del mas antiguo al mas
--      nuevo, las reglas de d01_private.contact_rules(). Nunca cambia agent_id (trg_cascade_contact_agent y
--      trg_contact_reassigned no se disparan). lead_status y lead_classification vuelven a su valor (los recalcula
--      trg_auto_qualification al copiar presupuesto, tipos o plazo; su regla es 'conservar'). Cada columna que cambio
--      queda en d01_private.fusion_writes con su valor antes y despues (to_jsonb en UTC).
--   4. Mueve, con los ids del preview y comprobando la columna de origen: hijos de los perdedores -> superviviente;
--      hijos SET NULL / NO ACTION de los deals a borrar -> deal conservado. Cada UPDATE debe tocar tantas filas como su
--      conjunto del preview; queda en d01_private.fusion_moves.
--   5. Borra los deals a borrar tras comprobar que solo los referencian las filas 'cascada:' del preview (copiadas);
--      DESPUES mueve los deals de los perdedores que no se borran (sin cambiar deals.agent_id: sin campanitas), para
--      que ningun superviviente tenga dos deals de intake abiertos ni un instante; despues borra los perdedores tras
--      comprobar que NADA los referencia (la cascada de contacts no se lleva nada).
--   6. Postcondiciones: mensajes de cada grupo antes = despues (todos en su superviviente), un contacto por grupo (el
--      superviviente), como mucho un deal de intake abierto por superviviente, H1 sin esos grupos y ninguna clave de
--      telefono repetida en contacts (0040 la exige). d01_private.fusion_log 'applied' con los conteos.

do $apply$
declare
  v_n     bigint;
  v_exp   bigint;
  v_list  text;
  v_col   text;
  v_pk    text;
  v_msgs  jsonb;
  v_hash  text;
  v_detail jsonb := '{}'::jsonb;
  r       record;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('TimeZone', 'UTC', true);

  if to_regclass('d01_private.preview_ids') is null or to_regclass('d01_private.fk_snapshot') is null
     or to_regclass('d01_private.preview_meta') is null then
    raise exception 'fusion-apply: falta el preview (ejecuta fusion-preview.sql)';
  end if;
  if exists (select 1 from d01_private.fusion_log where event = 'applied') then
    raise exception 'fusion-apply: la fusion ya se aplico (d01_private.fusion_log)';
  end if;
  if not (select x.rolsuper or x.rolbypassrls from pg_catalog.pg_roles x where x.rolname = current_user) then
    raise exception 'fusion-apply: % no salta RLS', current_user;
  end if;

  -- 0. cerrojos. Primero todos los advisory (nadie los toma despues de bloquear filas de estos contactos), cada clase
  --    por orden; despues las filas.
  for r in select distinct right(p.s10, 8) as k from d01_private.fusion_plan p order by 1 loop
    perform pg_advisory_xact_lock(73010, hashtext(r.k));                       -- resolve_contact
  end loop;
  for r in select m.id from d01_private.fusion_plan p cross join lateral unnest(p.ids) as m(id) order by m.id loop
    perform pg_advisory_xact_lock(hashtext(r.id::text));                       -- create_intake_deal
    perform pg_advisory_xact_lock(73013, hashtext(r.id::text));                -- record_preferred_contact_time
  end loop;
  for r in select d.id from public.deals d
            where d.contact_id in (select unnest(p.ids) from d01_private.fusion_plan p) order by d.id loop
    perform pg_advisory_xact_lock(73012, hashtext(r.id::text));                -- record_campaign_return
  end loop;
  for r in select s.child, s.col, s.pk from d01_private.fk_snapshot s
            where s.parent = 'public.deals' and s.on_delete = 'c' order by s.child, s.col loop
    execute format(
      'select 1 from %s t where t.%I in (select d.id from public.deals d
         where d.contact_id in (select unnest(p.ids) from d01_private.fusion_plan p)) order by t.%I for update',
      r.child::regclass, r.col, r.pk);
  end loop;
  perform 1 from public.contacts c
   where c.id in (select unnest(p.ids) from d01_private.fusion_plan p)
   order by c.id
     for update;
  perform 1 from public.deals d
   where d.contact_id in (select unnest(p.ids) from d01_private.fusion_plan p)
   order by d.id
     for update;

  -- 1. lo que se toca es lo que vio Ivan
  select count(*) into v_n
    from ((select f.parent, f.child, f.col, f.pk, f.on_delete
             from (select 'public.contacts'::text as parent, x.* from d01_private.fk_children('public.contacts'::regclass) x
                   union all
                   select 'public.deals'::text, x.* from d01_private.fk_children('public.deals'::regclass) x) f
           except
           select s.parent, s.child, s.col, s.pk, s.on_delete from d01_private.fk_snapshot s)
          union all
          (select s.parent, s.child, s.col, s.pk, s.on_delete from d01_private.fk_snapshot s
           except
           select f.parent, f.child, f.col, f.pk, f.on_delete
             from (select 'public.contacts'::text as parent, x.* from d01_private.fk_children('public.contacts'::regclass) x
                   union all
                   select 'public.deals'::text, x.* from d01_private.fk_children('public.deals'::regclass) x) f)) d;
  if v_n > 0 then
    raise exception 'fusion-apply: el catalogo de FK hacia contacts/deals cambio desde el preview';
  end if;
  if d01_private.contact_rules_gap() is not null then
    raise exception 'fusion-apply: reglas de columnas de contacts incompletas (%)', d01_private.contact_rules_gap();
  end if;
  select string_agg(distinct x.vista, ', ' order by x.vista) into v_list
    from ((select s.vista, s.tabla, s.row_id, s.de, s.a from d01_private.fusion_sets() s
           except
           select p.vista, p.tabla, p.row_id, p.de, p.a from d01_private.preview_ids p)
          union all
          (select p.vista, p.tabla, p.row_id, p.de, p.a from d01_private.preview_ids p
           except
           select s.vista, s.tabla, s.row_id, s.de, s.a from d01_private.fusion_sets() s)) x;
  if v_list is not null then
    raise exception 'fusion-apply: el conjunto de % cambio desde el preview', v_list;
  end if;
  v_hash := d01_private.sets_hash();
  if v_hash is distinct from (select m.hash from d01_private.preview_meta m) then
    raise exception 'fusion-apply: el md5 del conjunto no es el preview_hash';
  end if;
  perform d01_private.assert_schema();
  perform d01_private.assert_survivors();

  select jsonb_object_agg(p.s10, (select count(*) from public.messages m where m.contact_id = any(p.ids)))
    into v_msgs
    from d01_private.fusion_plan p;

  -- 2. copias
  for r in select distinct p.tabla from d01_private.preview_ids p order by 1 loop
    v_pk := d01_private.pk_col(r.tabla::regclass);
    execute format(
      'create table d01_private.%I as select * from %s t
        where t.%I::text in (select p.row_id from d01_private.preview_ids p where p.tabla = %L)',
      'bkp_' || split_part(r.tabla, '.', 2), r.tabla, v_pk, r.tabla);
  end loop;
  create table d01_private.fusion_moves (
    id bigint generated always as identity primary key,
    vista text not null, tabla text not null, columna text not null,
    row_id text not null, de text not null, a text not null
  );
  create table d01_private.fusion_writes (
    contact_id uuid not null, columna text not null, antes jsonb, despues jsonb,
    primary key (contact_id, columna)
  );

  -- 3. supervivientes
  update public.contacts c
     set meta_lead_id = null
   where c.id in (select p.row_id::uuid from d01_private.preview_ids p where p.vista = 'contactos_perdedores')
     and c.meta_lead_id is not null;

  for r in select l.loser, l.survivor_final
             from d01_private.fusion_losers l
             join d01_private.bkp_contacts b on b.id = l.loser
            order by l.survivor_final, b.created_at, b.id loop
    update public.contacts c
       set email                  = coalesce(c.email, x.email),
           source_detail          = coalesce(c.source_detail, x.source_detail),
           campaign_id            = coalesce(c.campaign_id, x.campaign_id),
           meta_ad_id             = coalesce(c.meta_ad_id, x.meta_ad_id),
           ctwa_clid              = coalesce(c.ctwa_clid, x.ctwa_clid),
           ai_summary             = coalesce(c.ai_summary, x.ai_summary),
           agent_notes            = coalesce(c.agent_notes, x.agent_notes),
           tags                   = coalesce(c.tags, x.tags),
           city                   = coalesce(c.city, x.city),
           bedrooms               = coalesce(c.bedrooms, x.bedrooms),
           decision_maker         = coalesce(c.decision_maker, x.decision_maker),
           linked_property_id     = coalesce(c.linked_property_id, x.linked_property_id),
           preferred_locations    = coalesce(c.preferred_locations, x.preferred_locations),
           property_types         = coalesce(c.property_types, x.property_types),
           operation_type         = coalesce(c.operation_type, x.operation_type),
           "condition"            = coalesce(c."condition", x."condition"),
           follow_up_state        = coalesce(c.follow_up_state, x.follow_up_state),
           meta_campaign_id       = coalesce(c.meta_campaign_id, x.meta_campaign_id),
           lead_form_answers      = coalesce(c.lead_form_answers, x.lead_form_answers),
           meta_campaign_name     = coalesce(c.meta_campaign_name, x.meta_campaign_name),
           meta_adset_id          = coalesce(c.meta_adset_id, x.meta_adset_id),
           meta_adset_name        = coalesce(c.meta_adset_name, x.meta_adset_name),
           meta_ad_name           = coalesce(c.meta_ad_name, x.meta_ad_name),
           meta_form_name         = coalesce(c.meta_form_name, x.meta_form_name),
           meta_platform          = coalesce(c.meta_platform, x.meta_platform),
           preferred_contact_time = coalesce(c.preferred_contact_time, x.preferred_contact_time),
           purpose        = case when (c.purpose is null or c.purpose = 'unknown')
                                  and x.purpose is not null and x.purpose <> 'unknown' then x.purpose else c.purpose end,
           payment_method = case when (c.payment_method is null or c.payment_method = 'unknown')
                                  and x.payment_method is not null and x.payment_method <> 'unknown'
                                 then x.payment_method else c.payment_method end,
           timeline       = case when (c.timeline is null or c.timeline = 'exploring')
                                  and x.timeline is not null and x.timeline <> 'exploring' then x.timeline else c.timeline end,
           lead_score     = case when coalesce(c.lead_score, 0) = 0 and coalesce(x.lead_score, 0) <> 0
                                 then x.lead_score else c.lead_score end,
           desired_amenities = case when coalesce(cardinality(c.desired_amenities), 0) = 0
                                     and coalesce(cardinality(x.desired_amenities), 0) > 0
                                    then x.desired_amenities else c.desired_amenities end,
           first_name = case when (c.first_name is null or c.first_name = 'Importado') and x.first_name is not null
                             then x.first_name else c.first_name end,
           last_name  = case when (c.first_name is null or c.first_name = 'Importado') and x.first_name is not null
                             then coalesce(x.last_name, c.last_name) else c.last_name end,
           meta_lead_id           = coalesce(c.meta_lead_id, x.meta_lead_id),
           budget_min      = case when c.budget_min is null and c.budget_max is null then x.budget_min else c.budget_min end,
           budget_max      = case when c.budget_min is null and c.budget_max is null then x.budget_max else c.budget_max end,
           budget_currency = case when c.budget_min is null and c.budget_max is null
                                   and (x.budget_min is not null or x.budget_max is not null)
                                  then x.budget_currency else c.budget_currency end,
           last_activity_at     = greatest(c.last_activity_at, x.last_activity_at),
           last_message_at      = greatest(c.last_message_at, x.last_message_at),
           follow_up_count      = greatest(c.follow_up_count, x.follow_up_count),
           wa_opted_out         = case when x.wa_opted_out then true else c.wa_opted_out end,
           ava_paused           = case when x.ava_paused then true else c.ava_paused end,
           is_recruit_candidate = case when x.is_recruit_candidate then true else c.is_recruit_candidate end
      from d01_private.bkp_contacts x
     where c.id = r.survivor_final and x.id = r.loser;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'fusion-apply: el superviviente % no se actualizo', r.survivor_final;
    end if;
  end loop;

  -- lead_status y lead_classification no estan en la lista de trg_auto_qualification: este UPDATE no lo dispara.
  update public.contacts c
     set lead_status = b.lead_status, lead_classification = b.lead_classification
    from d01_private.bkp_contacts b
   where b.id = c.id
     and c.id in (select p.row_id::uuid from d01_private.preview_ids p where p.vista = 'contactos_supervivientes')
     and (c.lead_status is distinct from b.lead_status or c.lead_classification is distinct from b.lead_classification);

  insert into d01_private.fusion_writes (contact_id, columna, antes, despues)
  select c.id, k.key, to_jsonb(b) -> k.key, k.value
    from public.contacts c
    join d01_private.bkp_contacts b on b.id = c.id
   cross join lateral jsonb_each(to_jsonb(c)) k
   where c.id in (select p.row_id::uuid from d01_private.preview_ids p where p.vista = 'contactos_supervivientes')
     and k.key not in (select a.attname::text from pg_catalog.pg_attribute a
                        where a.attrelid = 'public.contacts'::regclass and a.attgenerated <> '')
     and k.value is distinct from (to_jsonb(b) -> k.key);
  get diagnostics v_n = row_count;
  v_detail := v_detail || jsonb_build_object('columnas_escritas', v_n);

  -- 4. hijos de los perdedores y de los deals a borrar
  for r in select p.vista, p.tabla, count(*) as n
             from d01_private.preview_ids p
            where p.vista like 'mover:%' or p.vista like 'repuntar:%'
            group by p.vista, p.tabla
            order by case when p.vista like 'mover:%' then 1 else 2 end, p.vista loop
    v_col := substring(r.vista from '\.([^.]+)$');
    v_pk := d01_private.pk_col(r.tabla::regclass);
    execute format(
      'update %s t set %I = p.a::uuid from d01_private.preview_ids p
        where p.vista = %L and p.row_id = t.%I::text and t.%I::text = p.de',
      r.tabla, v_col, r.vista, v_pk, v_col);
    get diagnostics v_n = row_count;
    if v_n <> r.n then
      raise exception 'fusion-apply: % movio % filas, el preview tenia %', r.vista, v_n, r.n;
    end if;
    insert into d01_private.fusion_moves (vista, tabla, columna, row_id, de, a)
    select p.vista, p.tabla, v_col, p.row_id, p.de, p.a from d01_private.preview_ids p where p.vista = r.vista;
    v_detail := v_detail || jsonb_build_object(r.vista, v_n);
  end loop;

  -- 5. deals a borrar, deals de los perdedores, perdedores
  for r in select f.child, f.col, f.on_delete from d01_private.fk_children('public.deals'::regclass) f loop
    execute format(
      'select count(*) from %s t where t.%I::text in (select p.row_id from d01_private.preview_ids p where p.vista = %L)',
      r.child, r.col, 'deals_a_borrar') into v_n;
    v_exp := case when r.on_delete = 'c'
                  then (select count(*) from d01_private.preview_ids p where p.vista = 'cascada:' || r.child || '.' || r.col)
                  else 0 end;
    if v_n <> v_exp then
      raise exception 'fusion-apply: % filas de %.% apuntan a deals a borrar (se esperan %)', v_n, r.child, r.col, v_exp;
    end if;
    if r.on_delete = 'c' and v_n > 0 then
      v_detail := v_detail || jsonb_build_object('cascada:' || r.child || '.' || r.col, v_n);
    end if;
  end loop;
  delete from public.deals d
   using d01_private.preview_ids p
   where p.vista = 'deals_a_borrar' and p.row_id = d.id::text;
  get diagnostics v_n = row_count;
  if v_n <> (select count(*) from d01_private.preview_ids p where p.vista = 'deals_a_borrar') then
    raise exception 'fusion-apply: se borraron % deals, el preview tenia otros', v_n;
  end if;
  v_detail := v_detail || jsonb_build_object('deals_a_borrar', v_n);

  update public.deals t
     set contact_id = p.a::uuid
    from d01_private.preview_ids p
   where p.vista = 'deals_a_mover' and p.row_id = t.id::text and t.contact_id::text = p.de;
  get diagnostics v_n = row_count;
  if v_n <> (select count(*) from d01_private.preview_ids p where p.vista = 'deals_a_mover') then
    raise exception 'fusion-apply: deals_a_mover movio % deals, el preview tenia otros', v_n;
  end if;
  insert into d01_private.fusion_moves (vista, tabla, columna, row_id, de, a)
  select p.vista, p.tabla, 'contact_id', p.row_id, p.de, p.a from d01_private.preview_ids p where p.vista = 'deals_a_mover';
  v_detail := v_detail || jsonb_build_object('deals_a_mover', v_n);

  for r in select f.child, f.col from d01_private.fk_children('public.contacts'::regclass) f loop
    execute format('select count(*) from %s t where t.%I in (select l.loser from d01_private.fusion_losers l)',
                   r.child, r.col) into v_n;
    if v_n <> 0 then
      raise exception 'fusion-apply: % filas de %.% apuntan todavia a un perdedor (la cascada las borraria)', v_n, r.child, r.col;
    end if;
  end loop;
  delete from public.contacts c
   using d01_private.preview_ids p
   where p.vista = 'contactos_perdedores' and p.row_id = c.id::text;
  get diagnostics v_n = row_count;
  if v_n <> (select count(*) from d01_private.fusion_losers) then
    raise exception 'fusion-apply: se borraron % perdedores, el plan tenia otros', v_n;
  end if;
  v_detail := v_detail || jsonb_build_object('contactos_perdedores', v_n);

  -- 6. postcondiciones
  if exists (select 1 from d01_private.fusion_plan p
              where (select count(*) from public.messages m where m.contact_id = p.survivor_final)
                    <> (v_msgs ->> p.s10)::bigint) then
    raise exception 'fusion-apply: un grupo no conserva todos sus mensajes en el superviviente';
  end if;
  if exists (select 1 from d01_private.fusion_plan p
              where (select array_agg(c.id) from public.contacts c where c.id = any(p.ids)) is distinct from array[p.survivor_final]) then
    raise exception 'fusion-apply: un grupo no quedo con solo su superviviente';
  end if;
  if exists (select 1 from public.deals d
              where d.contact_id in (select p.survivor_final from d01_private.fusion_plan p)
                and d.stage in ('nuevo_sin_contactar', 'lead_captured')
              group by d.contact_id having count(*) > 1) then
    raise exception 'fusion-apply: un superviviente quedo con mas de un deal de intake abierto';
  end if;
  if exists (select 1 from public.contacts c
              where c.phone is not null
                and right(regexp_replace(c.phone, '\D', '', 'g'), 10) in (select p.s10 from d01_private.fusion_plan p)
              group by right(regexp_replace(c.phone, '\D', '', 'g'), 10) having count(*) > 1) then
    raise exception 'fusion-apply: H1 sigue mostrando un grupo del plan';
  end if;
  select count(*) into v_n
    from (select c.phone_key from public.contacts c where c.phone_key is not null group by c.phone_key having count(*) > 1) k;
  if v_n > 0 then
    raise exception 'fusion-apply: quedarian % claves de telefono repetidas (0040 no se podria aplicar)', v_n;
  end if;

  perform d01_private.lock_down();
  insert into d01_private.fusion_log (event, detail)
  values ('applied', v_detail || jsonb_build_object(
    'mensajes', (select sum(value::bigint) from jsonb_each_text(v_msgs)), 'preview_hash', v_hash));
end
$apply$;

select id, event, at, detail from d01_private.fusion_log order by id desc limit 1;
