-- Huella del DDL de public.agents (columnas, constraints, indices, triggers, politicas, ACL y RLS) y de las
-- funciones que deciden o vigilan quien escribe en ella (md5 del cuerpo, proconfig, prosecdef, volatilidad y ACL).
-- Misma estructura y normalizacion que contacts-fingerprint.sql. La MISMA consulta corre en prod
-- (agents-fingerprint.pre.prod.json / .post.prod.json) y en el banco: si difieren, el banco no prueba la base de prod.
WITH roles(oid, name) AS (SELECT 0::oid, 'PUBLIC'
                          UNION ALL SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')),
fns(name) AS (VALUES ('is_admin'), ('is_admin_or_manager'), ('is_privileged_user'), ('is_ava_bot'),
                     ('update_updated_at'), ('agents_write_guard')),
t AS (SELECT c.oid, c.relacl, c.relowner, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c WHERE c.oid = to_regclass('public.agents'))
SELECT jsonb_build_object(
  'columns', (SELECT jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
                                                 pg_get_expr(d.adbin, d.adrelid), a.attgenerated::text, a.attidentity::text)
                               ORDER BY a.attnum)
                FROM t JOIN pg_attribute a ON a.attrelid = t.oid
                LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
               WHERE a.attnum > 0 AND NOT a.attisdropped),
  'column_acl', (SELECT jsonb_agg(a.attname || ':' || r.name || ':' || x.privilege_type
                                  ORDER BY a.attname, r.name, x.privilege_type)
                   FROM t JOIN pg_attribute a ON a.attrelid = t.oid
                   CROSS JOIN LATERAL aclexplode(a.attacl) x JOIN roles r ON r.oid = x.grantee
                  WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL),
  'constraints', (SELECT jsonb_agg(jsonb_build_array(k.conname, pg_get_constraintdef(k.oid), k.convalidated)
                                   ORDER BY k.conname)
                    FROM t JOIN pg_constraint k ON k.conrelid = t.oid),
  'indexes', (SELECT jsonb_agg(i.indexdef ORDER BY i.indexname)
                FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = 'agents'),
  'triggers', (SELECT jsonb_agg(jsonb_build_array(g.tgname, pg_get_triggerdef(g.oid), g.tgenabled::text) ORDER BY g.tgname)
                 FROM t JOIN pg_trigger g ON g.tgrelid = t.oid WHERE NOT g.tgisinternal),
  'policies', (SELECT jsonb_agg(jsonb_build_array(p.policyname, p.permissive, p.roles::text, p.cmd, p.qual, p.with_check)
                                ORDER BY p.policyname)
                 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'agents'),
  'relacl', (SELECT jsonb_agg(r.name || ':' || x.privilege_type ORDER BY r.name, x.privilege_type)
               FROM t CROSS JOIN LATERAL aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) x
               JOIN roles r ON r.oid = x.grantee),
  'rls', (SELECT jsonb_build_array(t.relrowsecurity, t.relforcerowsecurity) FROM t),
  'functions', (SELECT jsonb_agg(jsonb_build_array(
                         p.oid::regprocedure::text, md5(p.prosrc), p.proconfig::text, p.prosecdef, p.provolatile::text,
                         (SELECT jsonb_agg(r.name || ':' || x.privilege_type ORDER BY r.name, x.privilege_type)
                            FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                            JOIN roles r ON r.oid = x.grantee))
                       ORDER BY p.oid::regprocedure::text)
                  FROM pg_proc p
                 WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (SELECT name FROM fns))
) AS fp;
