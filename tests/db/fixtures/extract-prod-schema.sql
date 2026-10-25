-- D01-P01 Tarea 0: lectura del catalogo de prod (SOLO SELECT) para construir el banco.
--
-- T = tablas que tocan las migraciones 0034-0037 y las funciones de trigger de contacts y deals:
--   contacts, deals, agents, round_robin_config, activities, messages, notifications, agency_config
--   + deal_stage_history (log_deal_stage_change() escribe ahi; medido 2026-10-24).
--
-- Cada consulta va precedida de "-- @name <clave>"; build-prod-schema.py las ejecuta una a una
-- (Management API, endpoint database/query) y guarda el resultado en prod-catalog.json.
-- Nada de aqui escribe en la base.

-- @name columns
select c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull,
       pg_get_expr(d.adbin, d.adrelid) as default_expr, a.attgenerated, a.attidentity
from pg_class c
join pg_attribute a on a.attrelid = c.oid
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where c.oid = any(array['public.contacts','public.deals','public.agents','public.round_robin_config','public.activities','public.messages','public.notifications','public.agency_config','public.deal_stage_history']::regclass[])
  and a.attnum > 0 and not a.attisdropped
order by 1, 2;

-- @name constraints
select conrelid::regclass::text as tbl, conname, contype, pg_get_constraintdef(oid) as def,
       confrelid::regclass::text as ref_tbl
from pg_constraint
where conrelid = any(array['public.contacts','public.deals','public.agents','public.round_robin_config','public.activities','public.messages','public.notifications','public.agency_config','public.deal_stage_history']::regclass[])
order by 1, 2;

-- @name indexes
select i.tablename, i.indexname, i.indexdef,
       exists (select 1 from pg_constraint k where k.conindid = (quote_ident(i.schemaname) || '.' || quote_ident(i.indexname))::regclass) as constraint_backed
from pg_indexes i
where i.schemaname = 'public'
  and i.tablename = any(array['contacts','deals','agents','round_robin_config','activities','messages','notifications','agency_config','deal_stage_history'])
order by 1, 2;

-- @name triggers
select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def, tgfoid::regprocedure::text as fn, tgenabled
from pg_trigger
where tgrelid = any(array['public.contacts','public.deals','public.agents','public.round_robin_config','public.activities','public.messages','public.notifications','public.agency_config','public.deal_stage_history']::regclass[])
  and not tgisinternal
order by 1, 2;

-- @name functions
select p.oid::regprocedure::text as sig, p.proname, pg_get_functiondef(p.oid) as def, p.proacl::text[] as acl,
       pg_get_userbyid(p.proowner) as owner
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and (p.oid in (select tgfoid from pg_trigger
                 where tgrelid = any(array['public.contacts','public.deals','public.agents','public.round_robin_config','public.activities','public.messages','public.notifications','public.agency_config','public.deal_stage_history']::regclass[])
                   and not tgisinternal)
       or p.proname in ('is_ava_bot','is_admin','is_admin_or_manager','is_privileged_user','assign_next_rr_agent',
                        'create_intake_deal','contact_qualification_gate','apply_auto_qualification',
                        'cascade_contact_agent_to_deals'))
order by 2, 1;

-- @name auth_functions
select p.proname, pg_get_functiondef(p.oid) as def
from pg_proc p
where p.pronamespace = 'auth'::regnamespace and p.proname in ('uid','email','role','jwt')
order by 1;

-- @name enums
select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typnamespace = 'public'::regnamespace
group by 1 order by 1;

-- @name default_acl
select defaclrole::regrole::text as role, defaclnamespace::regnamespace::text as nsp, defaclobjtype, defaclacl::text[] as acl
from pg_default_acl
order by 1, 2, 3;

-- @name table_acl
select c.relname, c.relacl::text[] as acl, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
where c.oid = any(array['public.contacts','public.deals','public.agents','public.round_robin_config','public.activities','public.messages','public.notifications','public.agency_config','public.deal_stage_history']::regclass[])
order by 1;

-- @name policies
select tablename, policyname, permissive, roles::text[] as roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any(array['contacts','deals','agents','round_robin_config','activities','messages','notifications','agency_config','deal_stage_history'])
order by 1, 2;

-- @name sequences
select s.relname as seq, d.refobjid::regclass::text as tbl, a.attname as col, d.deptype, s.relacl::text[] as acl
from pg_class s
join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
where s.relkind = 'S'
  and d.refobjid = any(array['public.contacts','public.deals','public.agents','public.round_robin_config','public.activities','public.messages','public.notifications','public.agency_config','public.deal_stage_history']::regclass[])
order by 1;

-- @name roles
select rolname, rolsuper, rolbypassrls, rolinherit
from pg_roles
where rolname in ('postgres','anon','authenticated','service_role','authenticator','supabase_admin')
order by 1;

-- @name server
select current_setting('server_version') as server_version, current_setting('server_version_num') as server_version_num;
