-- Huella de public.mark_project_dispatched (firma, argumentos, resultado, md5 del cuerpo, proconfig, prosecdef,
-- volatilidad, owner y ACL por rol) y del acceso a public.projects (ACL de tabla, RLS y politicas). Sin columnas ni
-- datos. Misma forma que agents-fingerprint.sql, con COLLATE "C" en todos los ORDER BY (prod ordena en en_US y el
-- banco en C). La MISMA consulta corre en prod (projects-dispatch-fingerprint.pre.prod.json / .post.prod.json) y en
-- el banco: si difieren, el banco no prueba la base de prod. relacl y functions miran solo PUBLIC, anon, authenticated
-- y service_role; acl_full lista TODOS los titulares (con grantor y grantable): un EXECUTE a otro rol no queda oculto.
WITH roles(oid, name) AS (SELECT 0::oid, 'PUBLIC'
                          UNION ALL SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')),
t AS (SELECT c.oid, c.relacl, c.relowner, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c WHERE c.oid = to_regclass('public.projects'))
SELECT jsonb_build_object(
  'relacl', (SELECT jsonb_agg(r.name || ':' || x.privilege_type ORDER BY r.name COLLATE "C", x.privilege_type COLLATE "C")
               FROM t CROSS JOIN LATERAL aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) x
               JOIN roles r ON r.oid = x.grantee),
  'rls', (SELECT jsonb_build_array(t.relrowsecurity, t.relforcerowsecurity) FROM t),
  'policies', (SELECT jsonb_agg(jsonb_build_array(p.policyname, p.permissive, p.roles::text, p.cmd, p.qual, p.with_check)
                                ORDER BY p.policyname COLLATE "C")
                 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'projects'),
  'functions', (SELECT jsonb_agg(jsonb_build_array(
                         p.oid::regprocedure::text, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
                         md5(p.prosrc), p.proconfig::text, p.prosecdef, p.provolatile::text, pg_get_userbyid(p.proowner)::text,
                         (SELECT jsonb_agg(r.name || ':' || x.privilege_type ORDER BY r.name COLLATE "C", x.privilege_type COLLATE "C")
                            FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                            JOIN roles r ON r.oid = x.grantee))
                       ORDER BY p.oid::regprocedure::text COLLATE "C")
                  FROM pg_proc p
                 WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'mark_project_dispatched'),
  'acl_full', (SELECT jsonb_agg(o.k ORDER BY o.k COLLATE "C")
                 FROM (SELECT o.obj || ':' || CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee)::text END
                              || ':' || pg_get_userbyid(x.grantor)::text || ':' || x.privilege_type || ':' || x.is_grantable::text AS k
                         FROM (SELECT 'function ' || p.oid::regprocedure::text AS obj, coalesce(p.proacl, acldefault('f', p.proowner)) AS acl
                                 FROM pg_proc p
                                WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'mark_project_dispatched'
                               UNION ALL
                               SELECT 'table projects', coalesce(t.relacl, acldefault('r', t.relowner)) FROM t) o
                        CROSS JOIN LATERAL aclexplode(o.acl) x) o)
) AS fp;
