-- scripts/d01/fusion-plan.sql
--
-- D01-P04 (Etapa 2c, D8), paso 1 de 4: plan de fusion de los grupos duplicados de H1.
-- Orden: fusion-plan.sql -> fusion-preview.sql -> (checkpoint de Ivan) -> fusion-apply.sql. Reversion:
-- fusion-rollback.sql mientras exista d01_private (se borra en P06).
--
-- Solo LEE public y escribe en el esquema d01_private, que PostgREST no expone y sobre el que PUBLIC, anon,
-- authenticated y service_role no tienen ningun privilegio (fusion-preview.sql lo mide y aborta si no).
-- Re-ejecutable mientras la fusion no se haya aplicado (recalcula el plan y obliga a repetir el preview).
--
-- Grupos: la consulta H1 de D01 (contactos con phone y los mismos ultimos 10 digitos).
-- Superviviente (D8): public.contact_survivor, la misma regla que usa resolve_contact (agente activo en el
-- round-robin; si empatan, el mas antiguo). Override de Ivan (2026-10-24): en el grupo con un contacto de Joanny Mejia
-- (CTWA, mayo) y otro de Jenny Rojas (formulario, septiembre) gana el de Jenny, la asignacion reciente.
-- Afirmaciones (si una falla no queda nada escrito):
--   - exactamente 1 grupo con el override, con exactamente un contacto de Jenny;
--   - en todo grupo con un contacto del admin (fuera del RR) el superviviente tiene un agente activo en el RR;
--   - toda phone_key repetida esta entera dentro de un solo grupo del plan (si no, el indice unico de 0040 fallaria
--     despues de fusionar);
--   - en cada grupo, cada par de contactos comparte clave o la clave de uno es variante de pais del otro (lo mismo que
--     usa resolve_contact): H1 agrupa por los ultimos 10 digitos y +1 809... y +52 809... caerian juntos. Medido en
--     prod el 2026-10-29: 14 grupos con la misma clave y 1 por la variante NANP (un 10 digitos con '+' frente al
--     mismo numero con '+1').
--   - ningun superviviente archivado con un perdedor activo (los mensajes y deals del perdedor quedarian en un contacto
--     que el CRM oculta; resolve_contact lo desarchivaria, la fusion no). 0 archivados en los grupos de prod (2026-10-29).
-- Un solo DO block: atomico tanto por execute_sql como en el banco. Las tablas de d01_private llevan RLS sin
-- politicas (solo postgres, que la salta). Las funciones que crea fusion-preview.sql nacen con EXECUTE para PUBLIC (un
-- REVOKE por esquema de los default privileges no quita el global): lock_down() lo revoca y lo mide, y sin USAGE en el
-- esquema nadie mas puede llamarlas.

do $plan$
declare
  v_n int;
  v_list text;
  v_rel record;
begin
  perform set_config('lock_timeout', '3s', true);

  if to_regclass('d01_private.fusion_log') is not null then
    if exists (select 1 from d01_private.fusion_log where event = 'applied') then
      raise exception 'fusion-plan: la fusion ya se aplico (d01_private.fusion_log): el plan no se recalcula';
    end if;
  end if;

  create schema if not exists d01_private;
  revoke all on schema d01_private from public, anon, authenticated, service_role;

  create table if not exists d01_private.fusion_log (
    id bigint generated always as identity primary key,
    at timestamptz not null default now(),
    event text not null check (event in ('applied', 'rolled_back')),
    detail jsonb not null default '{}'::jsonb
  );

  -- Un plan nuevo invalida el preview anterior.
  drop view if exists d01_private.v_grupos;
  drop view if exists d01_private.v_resumen;
  drop table if exists d01_private.preview_ids;
  drop table if exists d01_private.fk_snapshot;
  drop table if exists d01_private.fusion_losers;
  drop table if exists d01_private.fusion_plan;

  create table d01_private.fusion_plan as
  with n as (
    select c.id, right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) as s10
      from public.contacts c
     where c.phone is not null
  ), g as (
    select n.s10, array_agg(n.id order by n.id) as ids
      from n
     where length(n.s10) = 10
     group by n.s10
    having count(*) > 1
  )
  select g.s10, g.ids,
         public.contact_survivor(g.ids) as survivor_regla,
         public.contact_survivor(g.ids) as survivor_final,
         'D8 regla'::text as motivo
    from g;
  alter table d01_private.fusion_plan add primary key (s10);

  update d01_private.fusion_plan p
     set survivor_final = j.id,
         motivo = 'D8: gana la asignacion reciente (Jenny)'
    from (select p2.s10, c.id
            from d01_private.fusion_plan p2
            join public.contacts c on c.id = any(p2.ids)
            join public.agents a on a.id = c.agent_id
           where a.full_name = 'Jenny Rojas') j
   where j.s10 = p.s10
     and exists (select 1 from public.contacts c join public.agents a on a.id = c.agent_id
                  where c.id = any(p.ids) and a.full_name = 'Joanny Mejia');

  select count(*) into v_n from d01_private.fusion_plan where motivo <> 'D8 regla';
  if v_n <> 1 then
    raise exception 'fusion-plan: % grupos con el override Joanny/Jenny (se espera 1)', v_n;
  end if;
  if exists (select 1 from d01_private.fusion_plan p
              where p.motivo <> 'D8 regla'
                and (select count(*) from public.contacts c join public.agents a on a.id = c.agent_id
                      where c.id = any(p.ids) and a.full_name = 'Jenny Rojas') <> 1) then
    raise exception 'fusion-plan: el grupo del override no tiene exactamente un contacto de Jenny';
  end if;
  if exists (select 1 from d01_private.fusion_plan p
               join public.contacts s on s.id = p.survivor_final
              where exists (select 1 from public.contacts c join public.agents a on a.id = c.agent_id
                             where c.id = any(p.ids) and a.role = 'admin')
                and not exists (select 1 from public.round_robin_config r
                                 where r.agent_id = s.agent_id and r.is_active)) then
    raise exception 'fusion-plan: un grupo con un contacto del admin no elige un contacto con agente activo en el RR';
  end if;
  if exists (select 1 from d01_private.fusion_plan p where not (p.survivor_final = any(p.ids))) then
    raise exception 'fusion-plan: un superviviente no pertenece a su grupo';
  end if;
  if exists (select 1 from d01_private.fusion_plan p
               join public.contacts s on s.id = p.survivor_final
              where (s.lead_status = 'archived' or s.archived_at is not null)
                and exists (select 1 from public.contacts c
                             where c.id = any(p.ids) and c.id <> p.survivor_final
                               and c.lead_status <> 'archived' and c.archived_at is null)) then
    raise exception 'fusion-plan: un superviviente archivado con un perdedor activo (sus mensajes y deals quedarian ocultos)';
  end if;
  select string_agg(distinct right(p.s10, 4), ', ') into v_list
    from d01_private.fusion_plan p
    join public.contacts a on a.id = any(p.ids)
    join public.contacts b on b.id = any(p.ids) and b.id > a.id
   where not ((a.phone_key is not null and b.phone_match && (array[a.phone_key] || public.phone_variants(a.phone_key)))
              or (b.phone_key is not null and a.phone_match && (array[b.phone_key] || public.phone_variants(b.phone_key))));
  if v_list is not null then
    raise exception 'fusion-plan: grupos de H1 (...%) con contactos que no comparten ni clave ni variante de pais', v_list;
  end if;
  if exists (select 1
               from (select c.phone_key, array_agg(c.id) as ids
                       from public.contacts c
                      where c.phone_key is not null
                      group by c.phone_key
                     having count(*) > 1) k
              where not exists (select 1 from d01_private.fusion_plan p where k.ids <@ p.ids)) then
    raise exception 'fusion-plan: hay claves de telefono repetidas fuera de los grupos de H1 (el indice unico fallaria)';
  end if;

  create table d01_private.fusion_losers as
  select p.s10, p.survivor_final, l.loser
    from d01_private.fusion_plan p
    cross join lateral unnest(p.ids) as l(loser)
   where l.loser <> p.survivor_final;
  alter table d01_private.fusion_losers add primary key (loser);

  -- Lo que Ivan revisa en el checkpoint: un contacto por fila, sin telefono (solo los ultimos 4 digitos).
  create view d01_private.v_grupos with (security_invoker = true) as
  select right(p.s10, 4) as ultimos4,
         c.id as contact_id,
         c.created_at,
         c.source::text as source,
         coalesce(a.full_name, '(sin agente)') as agente,
         exists (select 1 from public.round_robin_config r where r.agent_id = c.agent_id and r.is_active) as activo_rr,
         (c.lead_status = 'archived' or c.archived_at is not null) as archivado,
         (select string_agg(d.stage::text, ',' order by d.created_at) from public.deals d where d.contact_id = c.id) as deals,
         (select count(*) from public.messages m where m.contact_id = c.id) as mensajes,
         c.id = p.survivor_final as superviviente,
         p.motivo
    from d01_private.fusion_plan p
    join public.contacts c on c.id = any(p.ids)
    left join public.agents a on a.id = c.agent_id;

  revoke all on all tables in schema d01_private from public, anon, authenticated, service_role;
  revoke all on all sequences in schema d01_private from public, anon, authenticated, service_role;
  for v_rel in select c.oid::regclass as t from pg_catalog.pg_class c
                where c.relnamespace = 'd01_private'::regnamespace and c.relkind = 'r' loop
    execute format('alter table %s enable row level security', v_rel.t);
  end loop;
end
$plan$;

select ultimos4, contact_id, created_at, source, agente, activo_rr, archivado, deals, mensajes, superviviente, motivo
  from d01_private.v_grupos
 order by ultimos4, created_at;
