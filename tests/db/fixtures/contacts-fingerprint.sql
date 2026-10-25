-- Huella del DDL de contacts, deals y las tablas nuevas de D01-P01 (columnas con attgenerated/attidentity,
-- constraints con convalidated, indices, triggers, politicas, ACL y RLS) y de las funciones que tocan
-- 0034-0037 (md5 del cuerpo, proconfig, prosecdef, volatilidad y ACL). Misma estructura que
-- advance-finance/lib/__tests__/fixtures/ncf-sequences-fingerprint.sql.
-- La MISMA consulta corre en prod (contacts-fingerprint.pre.prod.json / .post.prod.json) y en el banco:
-- si difieren, el banco no prueba la base de prod.
-- Normalizacion para que prod y banco sean comparables: el ACL se reduce a PUBLIC, anon, authenticated y
-- service_role (sin grantor; prod tiene roles internos de Supabase que el banco no crea) y se omiten las FK
-- a tablas que el banco no tiene (campaigns, properties).
WITH tbl(name) AS (VALUES ('contacts'), ('deals'), ('contact_match_events'), ('agent_lead_notifications'),
                          ('agent_time_notifications')),
bench(name) AS (VALUES ('public.contacts'), ('public.deals'), ('public.agents'), ('public.round_robin_config'),
                       ('public.activities'), ('public.messages'), ('public.notifications'), ('public.agency_config'),
                       ('public.deal_stage_history'), ('auth.users'), ('public.contact_match_events'),
                       ('public.agent_lead_notifications'), ('public.agent_time_notifications')),
roles(oid, name) AS (SELECT 0::oid, 'PUBLIC'
                     UNION ALL SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')),
fns(name) AS (VALUES ('apply_auto_qualification'), ('cascade_contact_agent_to_deals'), ('update_assigned_at'),
                     ('calculate_commission'), ('log_deal_stage_change'), ('notify_deal_assigned'),
                     ('is_ava_bot'), ('is_admin'), ('is_admin_or_manager'), ('is_privileged_user'),
                     ('assign_next_rr_agent'), ('create_intake_deal'), ('contact_qualification_gate'),
                     ('phone_digits_ok'), ('phone_key'), ('phone_match_set'), ('phone_variants'),
                     ('contact_survivor'), ('rr_agent_with_retry'), ('resolve_contact'), ('resolve_deal_agent'),
                     ('claim_agent_lead_notifications'), ('mark_agent_lead_notification'),
                     ('record_campaign_return'), ('record_preferred_contact_time'),
                     ('notify_agent_client_returned')),
t AS (SELECT tbl.name, c.oid, c.relacl, c.relowner, c.relrowsecurity, c.relforcerowsecurity
        FROM tbl JOIN pg_class c ON c.oid = to_regclass('public.' || tbl.name))
SELECT jsonb_build_object(
  'columns', (SELECT jsonb_object_agg(t.name, (
      SELECT jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
                                         pg_get_expr(d.adbin, d.adrelid), a.attgenerated::text, a.attidentity::text)
                       ORDER BY a.attnum)
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped)) FROM t),
  'constraints', (SELECT jsonb_object_agg(t.name, (
      SELECT jsonb_agg(jsonb_build_array(k.conname, pg_get_constraintdef(k.oid), k.convalidated) ORDER BY k.conname)
        FROM pg_constraint k
       WHERE k.conrelid = t.oid
         AND (k.contype <> 'f'
              OR (SELECT n.nspname || '.' || r.relname FROM pg_class r JOIN pg_namespace n ON n.oid = r.relnamespace
                   WHERE r.oid = k.confrelid) IN (SELECT name FROM bench)))) FROM t),
  'indexes', (SELECT jsonb_object_agg(t.name, (
      SELECT jsonb_agg(i.indexdef ORDER BY i.indexname)
        FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = t.name)) FROM t),
  'triggers', (SELECT jsonb_object_agg(t.name, (
      SELECT jsonb_agg(jsonb_build_array(g.tgname, pg_get_triggerdef(g.oid), g.tgenabled::text) ORDER BY g.tgname)
        FROM pg_trigger g WHERE g.tgrelid = t.oid AND NOT g.tgisinternal)) FROM t),
  'policies', (SELECT jsonb_object_agg(t.name, (
      SELECT jsonb_agg(jsonb_build_array(p.policyname, p.permissive, p.roles::text, p.cmd, p.qual, p.with_check)
                       ORDER BY p.policyname)
        FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.name)) FROM t),
  'relacl', (SELECT jsonb_object_agg(t.name, (
      SELECT jsonb_agg(r.name || ':' || x.privilege_type ORDER BY r.name, x.privilege_type)
        FROM aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) x JOIN roles r ON r.oid = x.grantee)) FROM t),
  'rls', (SELECT jsonb_object_agg(t.name, jsonb_build_array(t.relrowsecurity, t.relforcerowsecurity)) FROM t),
  'functions', (SELECT jsonb_agg(jsonb_build_array(
                         p.oid::regprocedure::text, md5(p.prosrc), p.proconfig::text, p.prosecdef, p.provolatile::text,
                         (SELECT jsonb_agg(r.name || ':' || x.privilege_type ORDER BY r.name, x.privilege_type)
                            FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                            JOIN roles r ON r.oid = x.grantee))
                       ORDER BY p.oid::regprocedure::text)
                  FROM pg_proc p
                 WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (SELECT name FROM fns))
) AS fp;
