-- scripts/d01/fusion-rollback.sql
--
-- D01-P04: reversion de fusion-apply.sql. SOLO valida mientras exista d01_private (copias bkp_*, fusion_moves,
-- fusion_writes y preview_ids); P06 lo borra. Antes hay que revertir 0040 (migrations/rollback/0040-down.sql): con el
-- indice unico de phone_key, reinsertar a los perdedores daria 23505 (aqui se aborta antes).
-- UN solo DO block: si algo no cuadra, aborta y no cambia nada. Ejecutar como postgres. Una reversion no se puede
-- volver a aplicar ni repetir sin limpiar d01_private a mano (fusion_log lo impide).
--
-- Solo deshace lo que hizo la fusion y respeta lo cambiado despues por una persona, Ava o el CRM:
--   1. Supervivientes: cada columna de d01_private.fusion_writes vuelve a su valor anterior SOLO si su valor actual es
--      el que dejo la fusion; las demas quedan como estan y se listan en fusion_log ('omitidas'). Un UPDATE por contacto
--      con todas sus columnas a la vez; despues lead_status y lead_classification vuelven al valor que tenian antes de
--      ese UPDATE (trg_auto_qualification los recalcula). Va antes que los perdedores: meta_lead_id es unico.
--   2. Perdedores reinsertados desde bkp_contacts (sin columnas generadas), con su lead_status y lead_classification de
--      la copia (el mismo trigger los recalcula al insertar).
--   3. Los deals de los perdedores que la fusion movio vuelven a su contacto; DESPUES se reinsertan los deals borrados
--      desde bkp_deals (ningun contacto tiene dos deals de intake abiertos ni un instante). Las campanitas que crea
--      trg_notify_deal_assigned al insertarlos se borran por diferencia de ids (notify_deal_assigned solo escribe en
--      notifications, medido en prod el 2026-10-29).
--   4. Filas 'cascada:' (hijos de los deals borrados) reinsertadas desde sus copias.
--   5. Los demas movimientos (d01_private.fusion_moves) deshechos en orden inverso, comprobando que la fila sigue donde
--      la dejo la fusion; si no, aborta.
--   6. Comprobacion: toda fila REINSERTADA es igual a su copia (md5 de to_jsonb sin updated_at ni columnas generadas, en
--      UTC) y toda columna de superviviente restaurada vale lo que valia antes. fusion_log 'rolled_back'.

do $rollback$
declare
  v_n       bigint;
  v_exp     bigint;
  v_cols    text;
  v_vals    text;
  v_pk      text;
  v_patch   jsonb;
  v_status  public.lead_status;
  v_class   public.lead_classification;
  v_before  uuid[];
  v_links   text[];
  v_excl    text[];
  v_omit    jsonb := '[]'::jsonb;
  r         record;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('TimeZone', 'UTC', true);

  if to_regclass('d01_private.fusion_log') is null
     or not exists (select 1 from d01_private.fusion_log where event = 'applied') then
    raise exception 'fusion-rollback: no hay una fusion aplicada';
  end if;
  if exists (select 1 from d01_private.fusion_log where event = 'rolled_back') then
    raise exception 'fusion-rollback: la fusion ya se revirtio';
  end if;
  if to_regclass('public.contacts_phone_key_uidx') is not null then
    raise exception 'fusion-rollback: existe contacts_phone_key_uidx: aplica antes migrations/rollback/0040-down.sql';
  end if;

  for r in select distinct right(p.s10, 8) as k from d01_private.fusion_plan p order by 1 loop
    perform pg_advisory_xact_lock(73010, hashtext(r.k));
  end loop;
  for r in select m.id from d01_private.fusion_plan p cross join lateral unnest(p.ids) as m(id) order by m.id loop
    perform pg_advisory_xact_lock(hashtext(r.id::text));
    perform pg_advisory_xact_lock(73013, hashtext(r.id::text));
  end loop;
  perform 1 from public.contacts c
   where c.id in (select p.survivor_final from d01_private.fusion_plan p)
   order by c.id
     for update;
  create temp table omitidas (contact_id uuid primary key, columnas jsonb not null) on commit drop;

  -- 1. supervivientes
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg('r.' || quote_ident(a.attname), ', ' order by a.attnum)
    into v_cols, v_vals
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.contacts'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attgenerated = '' and a.attname <> 'id';
  for r in select w.contact_id from d01_private.fusion_writes w group by w.contact_id order by w.contact_id loop
    select jsonb_object_agg(w.columna, w.antes) into v_patch
      from d01_private.fusion_writes w
      join public.contacts c on c.id = w.contact_id
     where w.contact_id = r.contact_id and to_jsonb(c) -> w.columna = w.despues;
    select coalesce(jsonb_agg(w.columna order by w.columna), '[]'::jsonb) into v_omit
      from d01_private.fusion_writes w
      join public.contacts c on c.id = w.contact_id
     where w.contact_id = r.contact_id and to_jsonb(c) -> w.columna is distinct from w.despues;
    if jsonb_array_length(v_omit) > 0 then
      raise notice 'fusion-rollback: el superviviente % cambio despues de la fusion en %: esas columnas no se restauran',
        r.contact_id, v_omit;
      insert into pg_temp.omitidas (contact_id, columnas) values (r.contact_id, v_omit);
    end if;
    if v_patch is not null then
      select c.lead_status, c.lead_classification into v_status, v_class from public.contacts c where c.id = r.contact_id;
      execute format('update public.contacts c set (%s) = (select %s from jsonb_populate_record(c, $1) r) where c.id = $2',
                     v_cols, v_vals)
        using v_patch, r.contact_id;
      update public.contacts c set lead_status = v_status, lead_classification = v_class
       where c.id = r.contact_id and (c.lead_status, c.lead_classification) is distinct from (v_status, v_class);
    end if;
  end loop;

  -- 2. perdedores
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.contacts'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
  execute format(
    'insert into public.contacts (%1$s) select %1$s from d01_private.bkp_contacts b
      where b.id::text in (select p.row_id from d01_private.preview_ids p where p.vista = %2$L)',
    v_cols, 'contactos_perdedores');
  get diagnostics v_n = row_count;
  if v_n <> (select count(*) from d01_private.fusion_losers) then
    raise exception 'fusion-rollback: se reinsertaron % perdedores, el plan tenia otros', v_n;
  end if;
  update public.contacts c
     set lead_status = b.lead_status, lead_classification = b.lead_classification
    from d01_private.bkp_contacts b
   where b.id = c.id and c.id in (select l.loser from d01_private.fusion_losers l)
     and (c.lead_status is distinct from b.lead_status or c.lead_classification is distinct from b.lead_classification);

  -- 3. deals: primero los movidos vuelven a su perdedor, despues los borrados
  update public.deals t
     set contact_id = m.de::uuid
    from d01_private.fusion_moves m
   where m.vista = 'deals_a_mover' and m.row_id = t.id::text and t.contact_id::text = m.a;
  get diagnostics v_n = row_count;
  if v_n <> (select count(*) from d01_private.fusion_moves m where m.vista = 'deals_a_mover') then
    raise exception 'fusion-rollback: deals_a_mover devolvio % deals (alguno cambio de contacto despues de la fusion)', v_n;
  end if;

  select array_agg('/dashboard/pipeline/' || p.row_id) into v_links
    from d01_private.preview_ids p where p.vista = 'deals_a_borrar';
  select array_agg(n.id) into v_before from public.notifications n where n.link = any(coalesce(v_links, '{}'));
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.deals'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
  execute format(
    'insert into public.deals (%1$s) overriding system value select %1$s from d01_private.bkp_deals b
      where b.id::text in (select p.row_id from d01_private.preview_ids p where p.vista = %2$L)',
    v_cols, 'deals_a_borrar');
  get diagnostics v_exp = row_count;
  if v_exp <> (select count(*) from d01_private.preview_ids p where p.vista = 'deals_a_borrar') then
    raise exception 'fusion-rollback: se reinsertaron % deals, el preview tenia otros', v_exp;
  end if;
  delete from public.notifications n
   where n.type = 'deal_assigned'
     and n.link = any(coalesce(v_links, '{}'))
     and not (n.id = any(coalesce(v_before, '{}')));
  get diagnostics v_n = row_count;
  if v_n <> v_exp then
    raise exception 'fusion-rollback: % campanitas nuevas para % deals reinsertados', v_n, v_exp;
  end if;

  -- 4. hijos en cascada de los deals borrados
  for r in select p.vista, p.tabla, count(*) as n
             from d01_private.preview_ids p where p.vista like 'cascada:%'
            group by p.vista, p.tabla order by p.vista loop
    v_pk := d01_private.pk_col(r.tabla::regclass);
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
      from pg_catalog.pg_attribute a
     where a.attrelid = r.tabla::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    execute format(
      'insert into %1$s (%2$s) overriding system value select %2$s from d01_private.%3$I b
        where b.%4$I::text in (select p.row_id from d01_private.preview_ids p where p.vista = %5$L)',
      r.tabla, v_cols, 'bkp_' || split_part(r.tabla, '.', 2), v_pk, r.vista);
    get diagnostics v_n = row_count;
    if v_n <> r.n then
      raise exception 'fusion-rollback: % reinserto % filas, el preview tenia %', r.vista, v_n, r.n;
    end if;
  end loop;

  -- 5. los demas movimientos, en orden inverso
  for r in select m.vista, m.tabla, m.columna, count(*) as n, max(m.id) as mx
             from d01_private.fusion_moves m
            where m.vista <> 'deals_a_mover'
            group by m.vista, m.tabla, m.columna
            order by mx desc loop
    v_pk := d01_private.pk_col(r.tabla::regclass);
    execute format(
      'update %s t set %I = m.de::uuid from d01_private.fusion_moves m
        where m.vista = %L and m.row_id = t.%I::text and t.%I::text = m.a',
      r.tabla, r.columna, r.vista, v_pk, r.columna);
    get diagnostics v_n = row_count;
    if v_n <> r.n then
      raise exception 'fusion-rollback: % devolvio % filas de % (alguna cambio despues de la fusion)', r.vista, v_n, r.n;
    end if;
  end loop;

  -- 6. comprobacion de lo reinsertado y de lo restaurado
  for r in select distinct p.tabla, p.vista from d01_private.preview_ids p
            where p.vista in ('contactos_perdedores', 'deals_a_borrar') or p.vista like 'cascada:%' loop
    v_pk := d01_private.pk_col(r.tabla::regclass);
    select array['updated_at'] || coalesce(array_agg(a.attname::text), '{}') into v_excl
      from pg_catalog.pg_attribute a
     where a.attrelid = r.tabla::regclass and a.attgenerated <> '';
    execute format(
      'select count(*) from d01_private.%1$I b left join %2$s t on t.%3$I = b.%3$I
        where b.%3$I::text in (select p.row_id from d01_private.preview_ids p where p.vista = %4$L)
          and md5((to_jsonb(t) - $1)::text) is distinct from md5((to_jsonb(b) - $1)::text)',
      'bkp_' || split_part(r.tabla, '.', 2), r.tabla, v_pk, r.vista)
      into v_n using v_excl;
    if v_n <> 0 then
      raise exception 'fusion-rollback: % filas reinsertadas de % (%) no quedaron iguales a su copia', v_n, r.tabla, r.vista;
    end if;
  end loop;
  select count(*) into v_n
    from d01_private.fusion_writes w
    join public.contacts c on c.id = w.contact_id
   where not exists (select 1 from pg_temp.omitidas o where o.contact_id = w.contact_id and o.columnas ? w.columna)
     and to_jsonb(c) -> w.columna is distinct from w.antes;
  if v_n <> 0 then
    raise exception 'fusion-rollback: % columnas de supervivientes no volvieron a su valor anterior', v_n;
  end if;

  insert into d01_private.fusion_log (event, detail)
  select 'rolled_back', jsonb_build_object('omitidas',
           coalesce((select jsonb_agg(jsonb_build_object('contact_id', o.contact_id, 'columnas', o.columnas)
                                      order by o.contact_id) from pg_temp.omitidas o), '[]'::jsonb));
end
$rollback$;

select id, event, at, detail from d01_private.fusion_log order by id;
