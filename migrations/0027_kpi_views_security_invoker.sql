-- 0027_kpi_views_security_invoker
-- Cierra una fuga de datos SIN AUTENTICAR.
--
-- Las vistas agent_monthly_kpis, agent_historical_kpis y pipeline_summary se
-- quedaron sin la opcion security_invoker, por lo que se ejecutaban con los
-- privilegios de su owner (postgres) y SALTABAN las politicas RLS de
-- deals/agents/tasks/contacts/messages. Con los grants por defecto de Supabase,
-- anon tiene SELECT sobre ellas: con la sola anon key publica (la que viaja en el
-- bundle del navegador) y SIN iniciar sesion se leia revenue, pipeline y ranking
-- de toda la agencia. Verificado contra prod via PostgREST: HTTP 200 con 911 /
-- 570 / 299 bytes de datos reales.
--
-- Las otras 4 vistas del schema (agent_response_times, funnel_conversion,
-- leads_at_risk, stale_leads) si tenian la opcion y devolvian vacio a anon: ese
-- contraste prueba que la causa es exactamente esta opcion.
--
-- CAUSA HISTORICA (verificada en transaccion con rollback):
--   CREATE OR REPLACE VIEW sin clausula WITH (...) BORRA las reloptions
--   existentes; Postgres sustituye el conjunto completo. Al re-crear estas vistas
--   en 0012 y 0022 se perdio security_invoker en silencio.
--   *** Cualquier redefinicion futura de estas vistas DEBE incluir
--   *** WITH (security_invoker = true), o la fuga vuelve sin que nadie lo note.
--
-- Dos capas independientes:
--   1. security_invoker: la vista evalua RLS como quien consulta.
--      anon (auth.uid() nulo) -> 0 filas. Agente -> solo lo suyo.
--      admin/manager -> is_admin_or_manager() -> ni una fila perdida.
--   2. REVOKE: anon pierde el acceso; authenticated conserva SELECT (lo usa el
--      dashboard) y pierde la escritura absurda del GRANT ALL por defecto.
--      Sobrevive a un CREATE OR REPLACE, que no toca los grants.
--
-- Ensayo en seco contra prod (transaccion + rollback), filas visibles:
--   owner actual   -> monthly 5, historical 4, pipeline 9
--   admin Ivan     -> monthly 5, historical 4, pipeline 9   (IDENTICO)
--   agente Joanny  -> monthly 5, historical 1, pipeline 1
--   anon           -> monthly 0, historical 0, pipeline 0   (fuga cerrada)
--
-- NO se redefine el SQL de las vistas. Solo su modo de seguridad y sus grants.
-- No toca Finance ni Ava.
--
-- Run in: Supabase SQL Editor (project zlnqsgepzfghlmsfolko)

BEGIN;

-- 1. Causa raiz: ejecutar la vista con los privilegios de quien consulta.
ALTER VIEW public.agent_monthly_kpis    SET (security_invoker = true);
ALTER VIEW public.agent_historical_kpis SET (security_invoker = true);
ALTER VIEW public.pipeline_summary      SET (security_invoker = true);

-- 2. Defensa en profundidad: ninguna ruta del codigo consulta estas vistas sin sesion.
REVOKE ALL ON public.agent_monthly_kpis    FROM anon;
REVOKE ALL ON public.agent_historical_kpis FROM anon;
REVOKE ALL ON public.pipeline_summary      FROM anon;

-- 3. authenticated conserva SELECT; se le retira la escritura.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.agent_monthly_kpis,
     public.agent_historical_kpis,
     public.pipeline_summary
  FROM authenticated;

COMMIT;

-- PostgREST: refresca el cache de esquema (inocuo si ya estaba al dia).
NOTIFY pgrst, 'reload schema';
