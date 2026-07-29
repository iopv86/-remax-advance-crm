-- 0028_ava_knowledge_rls
-- Cierra una fuga de datos SIN AUTENTICAR y, peor, ESCRITURA SIN AUTENTICAR.
--
-- Misma clase de fallo que 0027, por otra via: alli fueron vistas sin
-- security_invoker; aqui son tablas que nunca llegaron a definir RLS.
--
-- ORIGEN. Las 7 tablas del subsistema Ava las crean las migraciones del OTRO
-- repo (whatsapp-agentkit/supabase/migrations): 010_project_knowledge_schema
-- (project_content, project_availability, project_images,
-- project_payment_plans, sync_runs), 013_ava_sync_state y 014_ava_call_requests.
-- Ninguna define RLS, policies ni grants. Con los grants por defecto de
-- Supabase, anon y authenticated heredan
-- SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER sobre todo `public`.
-- Sin RLS eso NO es solo lectura: es escritura real.
--
-- MEDIDO CONTRA PROD (curl, sin sesion, con la sola anon key del bundle):
--   project_content        HTTP 200  526.917 B  (content + embedding + tsvector)
--   sync_runs              HTTP 200  245.818 B
--   project_availability   HTTP 200   10.918 B
--   project_images         HTTP 200    4.446 B
--   ava_call_requests      HTTP 200      743 B  PII: telefono, call_summary,
--                                               recording_url
--   ava_sync_state         HTTP 200      940 B
--   project_payment_plans  HTTP 200          [] (vacia, pero abierta)
--   projects               HTTP 200    1.653 B  (ver PROJECTS mas abajo)
--   capi_outbox            HTTP 200          [] (RLS de 0021 la protege;
--                                               solo sobra el grant)
-- Y en transaccion con rollback, asumiendo el rol anon:
--   delete from ava_sync_state          -> 4 filas   BORRA
--   delete from deals (control con RLS) -> 0 filas   RLS bloquea
--
-- PROJECTS es un caso distinto y por eso el advisor NO la reporta: si tiene RLS,
-- pero su unica policy `projects_select_all` es FOR SELECT *TO PUBLIC* USING
-- (true), y PUBLIC incluye a anon. Esa policy no existe en ninguna migracion de
-- ningun repo: se creo a mano en el dashboard. Se re-crea aqui apuntando a
-- `authenticated`, que es lo que de verdad se necesitaba.
--   *** Leccion gemela a la de 0027: RLS activo NO implica dato protegido.
--   *** Una policy `TO PUBLIC USING (true)` es exactamente igual de abierta que
--   *** no tener RLS. Al auditar hay que mirar polroles, no solo relrowsecurity.
--
-- CONSUMIDORES REALES (leidos en codigo, no supuestos):
--   n8n x4 (01-sheets-sync, 02-image-sync, 03-content-sync,
--     05-drive-change-detector): usan SUPABASE_SERVICE_ROLE_KEY -> BYPASSRLS.
--     Inmunes a esta migracion.
--   Ava (whatsapp-agentkit en Railway): agent/supabase_auth.py hace sign-in por
--     password como info@remaxadvance.com y manda ese JWT -> rol efectivo
--     AUTHENTICATED. Es fail-closed a proposito: jamas escala a service_role
--     como bearer. Lee project_availability, project_payment_plans,
--     project_images, project_content (via el RPC match_project_content) y
--     projects (resuelve slug->id en cada tool call). INSERTA, lee y ACTUALIZA
--     ava_call_requests.
--   CRM: no referencia ninguna de las 7. Solo capi_outbox, y siempre con
--     adminClient() (service_role) -- app/api/meta/capi/route.ts:40,47.
--   anon: CERO consumidores en todo el ecosistema (grep en advance-crm,
--     whatsapp-agentkit, marketing-agency, remax-crm, claude-seo,
--     agency-agents, advance-crm-mobile).
--
--   *** info@remaxadvance.com es un usuario auth HUERFANO: no tiene fila en
--   *** `agents`. Por eso NINGUNA policy de aqui puede depender de `agents`,
--   *** is_admin_or_manager() ni del uid: todas se atan al rol `authenticated`.
--   *** Una policy al estilo 0017/0018 dejaria a Ava en 0 filas y tumbaria el
--   *** agente entero.
--
--   *** Ava usa `Prefer: return=representation` por defecto (tools.py:55), asi
--   *** que su INSERT en ava_call_requests lleva RETURNING implicito: Postgres
--   *** exige policy de INSERT *Y* de SELECT. Un diseno "solo INSERT" habria
--   *** pasado la revision y roto la cola de voz en produccion.
--
-- DOS CAPAS INDEPENDIENTES (mismo patron que 0027):
--   1. RLS ON + policies `to authenticated` de minimo privilegio.
--      Sobrevive a que alguien reponga los grants por defecto.
--   2. REVOKE ALL a anon; a authenticated se le reconcede solo lo medido.
--      Sobrevive a que alguien escriba una policy `using (true)` de mas.
--   Para que la fuga vuelva hacen falta DOS errores independientes.
--
-- Se toca `authenticated`, no solo `anon`, y esa es la mitad del valor: hoy
-- cualquier usuario logueado puede vaciar estas tablas igual que anon. Y
-- authenticated NO es sinonimo de personal de confianza aqui: 10 auth.users
-- contra 5 filas en `agents` (medido en V14), con al menos un huerfano que hace
-- login real.
--
-- Descartado con medicion: ninguna de las 16 funciones SECURITY DEFINER
-- ejecutables por anon referencia ninguna de estas 9 tablas (si lo hiciera,
-- saltaria RLS y la fuga sobreviviria a esta migracion). match_project_content
-- es SECURITY INVOKER (prosecdef = false), luego respeta la policy de
-- project_content. Ningun grant a PUBLIC en estas tablas: solo a anon y
-- authenticated. Ningun objeto dependiente.
--
-- No toca service_role. No toca advance-finance. No toca el codigo de Ava.
--
-- PENDIENTE, FUERA DEL ALCANCE DE ESTA MIGRACION:
--   ALTER DEFAULT PRIVILEGES de Supabase seguira concediendo ALL a anon y
--   authenticated en CADA tabla nueva de `public`. Mientras eso siga asi, la
--   proxima tabla creada fuera del CRM nace filtrando igual que estas.
--
-- Run in: Supabase SQL Editor (project zlnqsgepzfghlmsfolko)
-- Aplicar FASE A, correr el probe, aplicar FASE B, correr el probe otra vez.

-- ============================================================
-- FASE A -- causa raiz: RLS + policies + grants minimos
-- ============================================================
BEGIN;

ALTER TABLE public.project_content       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_availability  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ava_call_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ava_sync_state        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs             ENABLE ROW LEVEL SECURITY;
-- capi_outbox ya tiene RLS desde 0021 y projects ya la tenia, pero se reafirma:
-- ENABLE es idempotente y asi la migracion no depende de una medicion externa
-- para ser correcta al re-ejecutarla.
ALTER TABLE public.capi_outbox           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects              ENABLE ROW LEVEL SECURITY;

-- Base de conocimiento de Ava: solo LEE. Quien escribe es n8n con service_role,
-- que no pasa por RLS. `for select` y no `for all` a proposito: si manana se
-- repone el GRANT ALL por defecto, seguira sin haber policy que autorice
-- escribir.
DROP POLICY IF EXISTS project_availability_select ON public.project_availability;
CREATE POLICY project_availability_select ON public.project_availability
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_content_select ON public.project_content;
CREATE POLICY project_content_select ON public.project_content
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_images_select ON public.project_images;
CREATE POLICY project_images_select ON public.project_images
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_payment_plans_select ON public.project_payment_plans;
CREATE POLICY project_payment_plans_select ON public.project_payment_plans
  FOR SELECT TO authenticated USING (true);

-- projects: misma forma, pero AQUI el cambio es de TO PUBLIC a TO authenticated.
-- Ava la necesita para resolver slug->id en cada tool call, y va como
-- authenticated -> sigue funcionando. anon deja de leer nombres, slugs,
-- drive_folder_id y rangos de precio.
DROP POLICY IF EXISTS projects_select_all ON public.projects;
CREATE POLICY projects_select_all ON public.projects
  FOR SELECT TO authenticated USING (true);

-- Cola de voz: Ava inserta (solicitar_llamada, tools.py:1555), lee la cola
-- (main.py:111) y parchea el resultado (main.py:130). SELECT es ademas
-- requisito del RETURNING implicito del INSERT.
-- Sin policy de DELETE a proposito: nadie borra filas, solo mueven `status`.
--
-- Acotadas a is_ava_bot() y NO a todo `authenticated`. La primera version usaba
-- USING (true) y la security-review lo levanto como HIGH; se MIDIO en
-- transaccion con rollback y era cierto: un agente normal del CRM podia leer la
-- PII de todas las llamadas (telefono, call_summary, recording_url), poner
-- consent_at = now() en una fila ajena e insertar una fila con telefono
-- arbitrario. Como consent_at es la senal que el drain job usa para marcar, eso
-- es una llamada saliente real sin consentimiento.
--   is_ava_bot() ya existia en el schema (auth.email() = 'info@remaxadvance.com',
--   STABLE SECURITY DEFINER) y es el idiom del repo para esto. Se usa en lugar
--   de cablear el uuid, que se romperia si la cuenta se recreara.
--   El CRM no referencia esta tabla en ningun sitio (0 coincidencias), asi que
--   acotar no le quita nada a nadie. Medido: Ava conserva lee=1,
--   insert+returning=1, update=2, rpc=3; un agente normal pasa a lee=0,
--   consent=0, insert=42501, y conserva intacto el catalogo de proyectos.
DROP POLICY IF EXISTS ava_call_requests_select ON public.ava_call_requests;
CREATE POLICY ava_call_requests_select ON public.ava_call_requests
  FOR SELECT TO authenticated USING (public.is_ava_bot());

DROP POLICY IF EXISTS ava_call_requests_insert ON public.ava_call_requests;
CREATE POLICY ava_call_requests_insert ON public.ava_call_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_ava_bot());

DROP POLICY IF EXISTS ava_call_requests_update ON public.ava_call_requests;
CREATE POLICY ava_call_requests_update ON public.ava_call_requests
  FOR UPDATE TO authenticated USING (public.is_ava_bot())
  WITH CHECK (public.is_ava_bot());

-- ava_sync_state, sync_runs y capi_outbox se quedan con RLS ON y CERO policies:
-- deny-all para todo lo que no sea service_role. Verificado por grep: ni el
-- agente Python ni el CRM las referencian; solo las tocan los workflows n8n.

-- Grants: borron y cuenta nueva. `authenticated` recupera exactamente lo medido.
REVOKE ALL ON TABLE
    public.project_content,
    public.project_availability,
    public.project_images,
    public.project_payment_plans,
    public.projects,
    public.ava_call_requests,
    public.ava_sync_state,
    public.sync_runs,
    public.capi_outbox
  FROM authenticated;

GRANT SELECT ON TABLE
    public.project_content,
    public.project_availability,
    public.project_images,
    public.project_payment_plans,
    public.projects
  TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.ava_call_requests TO authenticated;

-- Tercera capa, sobre el RPC pgvector. El objeto vive en el OTRO repo
-- (whatsapp-agentkit/supabase/migrations/011) y nacio con el EXECUTE a PUBLIC
-- por defecto de Postgres. Hoy no es una fuga: es SECURITY INVOKER, asi que al
-- llamarlo anon revienta con 42501 en el SELECT interno (medido). Pero es una
-- via sin blindaje propio: si manana alguien repusiera el SELECT de
-- project_content a anon, el RPC se reabriria en silencio y nadie estaria
-- mirando el RPC. `authenticated` y `service_role` tienen grant EXPLICITO en el
-- ACL (no heredado de PUBLIC), asi que quitarselo a PUBLIC no los afecta:
-- verificado en seco, Ava conserva rpc=3 y anon pasa a 42501.
REVOKE EXECUTE ON FUNCTION public.match_project_content(uuid, vector, integer)
  FROM PUBLIC, anon;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- >>> Correr aqui el probe. Esperado: anon ya en 0 filas / 0 borrados por RLS,
--     aun conservando los grants. Ava intacta. <<<

-- ============================================================
-- FASE B -- defensa en profundidad: anon fuera
-- ============================================================
BEGIN;

REVOKE ALL ON TABLE
    public.project_content,
    public.project_availability,
    public.project_images,
    public.project_payment_plans,
    public.projects,
    public.ava_call_requests,
    public.ava_sync_state,
    public.sync_runs,
    public.capi_outbox
  FROM anon;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- >>> Probe otra vez. Esperado: anon pasa de 0 filas a 42501 / HTTP 401. <<<
