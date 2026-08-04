-- 0030_close_public_read_and_dispatch_rpc
--
-- Cierra las dos vias que 0029 dejo abiertas A PROPOSITO por falta de decision:
--   FASE D: la RPC SECURITY DEFINER mark_project_dispatched, invocable por anon.
--   FASE F/G: las policies FOR SELECT sin clausula TO (= TO PUBLIC) con
--             USING (true) de properties y agent_zones.
--
-- La letra E queda RESERVADA para los 4 predicados (is_admin,
-- is_admin_or_manager, is_ava_bot, is_privileged_user), fuera de alcance aqui:
-- ver 0029 FASE E. Se salta la letra a proposito para que el mapa de fases de
-- 0029 siga siendo grepeable. `ava_config` queda fuera por decision de Ivan.
--
-- ==================== GATES MEDIDOS ANTES DE ESCRIBIR ESTO ==================
-- No son deducciones. Se corrieron contra prod el 2026-08-04:
--   G1 mark_project_dispatched: 1 sola firma (uuid, timestamptz), prosecdef=t,
--      acl = "=X/postgres ; postgres=X/postgres ; anon=X/postgres ;
--      authenticated=X/postgres ; service_role=X/postgres".
--      *** anon tiene grant EXPLICITO, no heredado. Por eso el `, anon` del
--      *** REVOKE es OBLIGATORIO: `from public` a secas seria un NO-OP que
--      *** parece un logro (TRAMPA 1 de 0029).
--   G2: 0 policies de RLS citan mark_project_dispatched -> revocar EXECUTE no
--      puede tumbar ninguna policy con 42501 (TRAMPA 2 de 0029).
--   G3 properties: properties_select (SELECT, PUBLIC, true) es la UNICA policy
--      de SELECT. Existe ademas properties_agent_scope (ALL, PUBLIC,
--      agent_id = auth.uid() OR is_privileged_user()).
--      *** Las policies permisivas se combinan con OR, y una policy FOR ALL
--      *** tambien cubre SELECT. Asi que un DROP a secas de properties_select
--      *** NO deja deny-all: deja a cada agente viendo SOLO lo suyo... y a Ava
--      *** en CERO filas, porque info@remaxadvance.com es usuario huerfano sin
--      *** fila en `agents` (ver 0028) -> agent_id nunca casa y
--      *** is_privileged_user() es falso. Ese modo de fallo es SILENCIOSO y
--      *** parcial, que es peor de diagnosticar que un deny-all limpio.
--      *** Por eso esto es una SUSTITUCION (DROP + CREATE en la MISMA
--      *** transaccion), no un borrado.
--   G3 agent_zones: zones_select (SELECT, PUBLIC, true) + zones_manage (ALL,
--      PUBLIC, is_admin_or_manager()).
--   G4: anon tiene SELECT, INSERT y DELETE sobre AMBAS tablas -> la FASE G es
--      necesaria. authenticated conserva SELECT/INSERT/UPDATE/DELETE en las dos.
--   Linea base para las sondas: properties = 1 fila total, 1 con status=active.
--      Ava debe seguir viendo 1 despues de la migracion.
--
-- ===================== POR QUE mark_project_dispatched ======================
-- Es SECURITY DEFINER y anon puede invocarla (0029: HTTP 204 sin sesion). No es
-- una fuga de lectura, es peor de diagnosticar: quien conozca UN uuid de
-- proyecto puede poner last_synced_at = now() en bucle, y el orquestador no
-- vuelve a considerar ese proyecto vencido NUNCA. Ava sirve disponibilidad y
-- precios obsoletos sin un solo error en ningun log. Negacion de frescura,
-- silenciosa por diseno.
--
-- SU UNICO CONSUMIDOR: n8n/orchestrator/orchestrator.py:80 (el POST a la RPC;
-- la funcion mark_dispatched() se define en :76). Servicio n8n-orchestrator en
-- Railway, cron horario.
--   *** VERIFICADO MIDIENDO HOY, NO SUPUESTO: ese cron YA corre con la service
--   *** key. Prueba: fetch_due_projects() hace GET /rest/v1/projects y anon NO
--   *** tiene SELECT sobre `projects` desde 0028; el cron lee y despacha
--   *** (projects.last_synced_at de `bcr` avanzo a 2026-08-04 14:04). Luego la
--   *** credencial es service_role y conserva su grant explicito (G1).
--   *** TRAMPA FUTURA: si alguien "arregla" algo re-concediendo anon sobre
--   *** `projects` en vez de usar la service key, se topara con un SEGUNDO 401
--   *** aqui y perseguira dos bugs. El arreglo correcto es la service key.
--
-- ===================== POR QUE properties Y agent_zones =====================
-- MEDIDO en 0029 con la sola anon key y SIN sesion:
--   properties  HTTP 200, 2.951 B, 59 columnas, entre ellas price,
--               commission_pct, is_exclusive y agent_id. Hoy hay 1 propiedad y
--               commission_pct viene null: lo que se fuga AHORA es poco. Lo que
--               se fuga es la comision y la exclusividad de TODA propiedad
--               futura. Se cierra por lo que va a contener.
--   agent_zones HTTP 200, [] (vacia, pero abierta igual).
-- Origen: el schema inicial del dashboard, no una migracion de este repo.
--   *** Una policy SIN clausula TO es TO PUBLIC, y PUBLIC incluye anon. Misma
--   *** leccion que 0028 con projects_select_all: RLS activo NO implica dato
--   *** protegido; hay que mirar polroles, no relrowsecurity.
--
-- CONSUMIDORES DE `properties` (grep en los dos repos, no supuesto):
--   /p/[slug] pagina publica   app/p/[slug]/page.tsx:6-9,53 -> SERVICE_ROLE.
--                              Bypass total de RLS: INMUNE. Es el consumidor
--                              "anonimo" aparente y NO lo es.
--   /api/proposals/view        route.ts:8-11 -> SERVICE_ROLE. Inmune.
--   /api/pdf                   route.ts:97, detras del gate de middleware.ts.
--   lib/properties/matching.ts cliente de sesion por cookie.
--   15 call-sites de app/dashboard/**  todos detras de middleware.ts
--     (medido: grep -rn 'from("properties")' app/dashboard = 15; en app+lib = 18).
--   Ava  whatsapp-agentkit/agent/tools.py:1021 -> rol AUTHENTICATED.
--   anon: CERO consumidores reales. middleware.ts es el unico sitio con la anon
--     key y solo llama auth.getUser() -> eso es GoTrue, NO PostgREST.
--
--   *** AVA FALLA EN SILENCIO, POR ESO LA SONDA F ES OBLIGATORIA:
--   *** tools.py:1031-33 hace `if r.status_code != 200: return []`. Un 401 por
--   *** policy mal puesta NO revienta: Ava le contesta al cliente por WhatsApp
--   *** "No encontre propiedades disponibles en ese rango de precio". Un
--   *** catalogo cerrado por error es INDISTINGUIBLE de un catalogo vacio.
--   *** Y por eso la policy va atada al ROL y JAMAS a agent_id/auth.uid().
--
-- CONSUMIDORES DE `agent_zones`: NINGUNO en ninguno de los dos repos.
--
-- FUERA DE ALCANCE A PROPOSITO: property_proposals::public_read_proposals y
--   proposal_views::public_insert_views. Tambien son true, pero son el tracking
--   de propuestas publicas = INTENCIONALES. No tocar.
-- Realtime NO esta implicado: 0026 solo anadio deals y activities.
--
--   *** PRECISION SOBRE EL ROLLBACK, igual que en 0029: devolver la policy a
--   *** PUBLIC reabre anon POR HERENCIA. Los rollbacks dan paridad FUNCIONAL
--   *** para los consumidores conocidos, NO paridad literal de ACL.
--
-- Run in: Supabase SQL Editor (project zlnqsgepzfghlmsfolko)
-- Aplicar POR FASES. Tras cada fase: commit, notify, y la SONDA con su control.

-- ============================== FASE D =====================================
begin;
-- `public, anon` y no solo `public`: ver G1. anon tiene grant explicito.
-- authenticated y service_role conservan el suyo; service_role es quien la
-- llama de verdad desde Railway.
-- ROLLBACK: grant execute on function
--             public.mark_project_dispatched(uuid, timestamptz) to anon;
revoke execute on function public.mark_project_dispatched(uuid, timestamptz)
  from public, anon;
commit;
notify pgrst, 'reload schema';

-- >>> SONDA FASE D <<<
-- (1) SQL: re-correr G1. anon_exec debe pasar de t a f; auth_exec y srole_exec
--     siguen en t. Usar has_function_privilege y NO leer proacl a ojo: la
--     funcion resuelve la herencia de PUBLIC, que es justo lo que engana.
-- (2) HTTP con la anon key publica, SIN sesion y con la FIRMA CORRECTA:
--     POST /rest/v1/rpc/mark_project_dispatched
--       {"p_id":"00000000-0000-0000-0000-000000000000",
--        "p_dispatched_at":"2020-01-01T00:00:00Z"}
--     ANTES 204 -> DESPUES esperado 401 / 42501.
--     *** uuid de relleno A PROPOSITO: el 404 lo causa el desajuste de FIRMA,
--     *** no la inexistencia de la fila, asi que un uuid inexistente sonda
--     *** igual de bien y la sonda PREVIA no escribe last_synced_at en un
--     *** proyecto real. Nunca sondar esto con un uuid de produccion y now().
-- (3) *** CONTROL DE VALIDEZ OBLIGATORIO (el falso verde de 0029):
--     (3a) La MISMA URL con cuerpo {} debe dar 404 PGRST202 -> demuestra que un
--          404 aqui significa "firma", y que el 401 de (2) es otra cosa.
--     (3b) Con la MISMA anon key, POST /rest/v1/rpc/is_admin con {} debe seguir
--          dando 200. FASE E no esta aplicada, luego is_admin SIGUE ABIERTO: si
--          diera 401, la sonda estaria midiendo una key o un proyecto
--          equivocados y el "cerrado" de (2) no valdria nada.
-- (4) Cron: projects.last_synced_at de `bcr` (sync_interval_hours = 1) debe
--     seguir avanzando en la hora siguiente.

-- ============================== FASE F =====================================
begin;
-- properties: SUSTITUCION, no borrado. Ver G3: dropear properties_select a
-- secas deja a Ava en 0 filas por properties_agent_scope. DROP y CREATE van
-- juntos en esta transaccion a proposito: si el CREATE fallara, el DROP se va
-- con el rollback.
-- El predicado sigue siendo `true`: para cualquier usuario CON SESION el
-- resultado es bit a bit el mismo que hoy. Lo unico que cambia es que PUBLIC
-- (= anon) deja de encajar.
-- ROLLBACK (paridad funcional, NO literal):
--   drop policy properties_select on public.properties;
--   create policy properties_select on public.properties
--     for select to authenticated, anon using (true);
drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties
  for select to authenticated using (true);

-- agent_zones: misma forma. Cero consumidores y tabla vacia, asi que hoy el
-- DROP a secas tampoco romperia nada; se re-crea por simetria y porque
-- zones_manage ya cubre a admin/manager.
-- ROLLBACK (paridad funcional, NO literal, igual que el de arriba):
--   drop policy zones_select on public.agent_zones;
--   create policy zones_select on public.agent_zones
--     for select to authenticated, anon using (true);
drop policy if exists zones_select on public.agent_zones;
create policy zones_select on public.agent_zones
  for select to authenticated using (true);
commit;
notify pgrst, 'reload schema';

-- >>> SONDA FASE F <<<
-- (1) SQL: re-correr G3. Las dos policies deben salir ahora con roles
--     `authenticated` (no PUBLIC) y polcmd = 'r'. properties debe conservar
--     INTACTAS sus policies de insert/update/delete y properties_agent_scope.
-- (2) HTTP anon sin sesion: GET /rest/v1/properties?select=id
--     ANTES 200 con 59 columnas -> DESPUES esperado 200 con [].
--     *** [] y NO 401, porque el GRANT de tabla de anon sigue puesto. Ese es
--     *** exactamente el motivo de que exista la FASE G. Un [] aqui es el
--     *** resultado CORRECTO de esta fase, no un cierre a medias.
-- (3) *** CONTROL DE VALIDEZ 1 -- QUE AVA SIGUE VIENDO EL CATALOGO. Con el JWT
--     *** real de info@remaxadvance.com (rol authenticated), correr la query
--     *** literal de tools.py:1009-19 (status=eq.active, rango de precio
--     *** completo). Debe devolver 200 y el MISMO numero de filas que la linea
--     *** base: 1. Si devolviera 200 con [] no se podria distinguir de "no hay
--     *** activas": por eso se compara contra el baseline capturado antes.
-- (4) CONTROL DE VALIDEZ 2 -- agente logueado: /dashboard/properties lista
--     igual, y crear/editar/borrar sigue funcionando (no se toco ninguna
--     policy de escritura ni ningun grant de authenticated).
-- (5) CONTROL DE VALIDEZ 3 -- /p/<slug> de una propuesta real sigue
--     renderizando. Es service_role: si esto se rompiera, el diagnostico seria
--     otro completamente.

-- ============================== FASE G =====================================
begin;
-- Segunda capa independiente (mismo desdoblamiento A/B que 0028). Con la FASE F
-- sola, anon conserva el GRANT y responde 200 []; basta que alguien escriba
-- manana una policy `using (true)` de mas para que la fuga vuelva entera. Con
-- el grant quitado hacen falta DOS errores independientes para reabrirla.
--   *** SOLO se toca `anon`. authenticated conserva SELECT/INSERT/UPDATE/DELETE
--   *** sobre properties: los usa el CRM (property-form, properties-client,
--   *** property-detail-client). Aqui NO se replica el REVOKE a authenticated
--   *** de 0027: alli eran VISTAS de solo lectura, estas son tablas que el CRM
--   *** ESCRIBE. Copiar aquel gesto romperia el alta y el borrado.
-- ROLLBACK: grant select on table public.properties, public.agent_zones to anon;
--   (SELECT y no ALL: el GRANT ALL por defecto de Supabase incluia INSERT,
--    UPDATE, DELETE y TRUNCATE, que anon no necesito jamas.)
revoke all on table public.properties, public.agent_zones from anon;
commit;
notify pgrst, 'reload schema';

-- >>> SONDA FASE G <<<
-- (1) SQL: re-correr G4. Las columnas anon_* deben quedar todas en f en ambas
--     tablas; las auth_* deben seguir en t en properties.
-- (2) HTTP anon: GET /rest/v1/properties?select=id  -> de 200 [] a 401 42501.
--                GET /rest/v1/agent_zones?select=id -> de 200 [] a 401 42501.
-- (3) *** CONTROL DE VALIDEZ: con la MISMA anon key, GET
--     *** /rest/v1/property_proposals debe seguir devolviendo 200. Esa policy es
--     *** el tracking publico INTENCIONAL y esta fuera de alcance: si tambien
--     *** pasara a 401 se ha revocado de mas. Y prueba, ademas, que el 401 de
--     *** (2) es de estas dos tablas y no de la key ni del proyecto.
-- (4) Repetir los controles (3) y (4) de la SONDA F: Ava y el CRM no deben
--     moverse ni una fila.

-- ===========================================================================
-- LINT DE CIERRE (el de 0029, re-corrido: es el criterio de "hecho")
--   (a) SECURITY DEFINER anon-ejecutable, sin triggers ni extensiones:
--       tras 0029 devolvia 5 (los 4 predicados + mark_project_dispatched).
--       Tras esta migracion debe devolver 4 = solo los 4 predicados.
--   (c) policies permisivas a PUBLIC/anon con USING/WITH CHECK literal `true`:
--       deben desaparecer properties::properties_select y
--       agent_zones::zones_select. Deben SEGUIR saliendo, y es correcto:
--       ava_config::ava_config_read_all (fuera de alcance por decision),
--       property_proposals::public_read_proposals y
--       proposal_views::public_insert_views (tracking publico intencional).
--
-- SIGUE PENDIENTE, SIN TOCAR AQUI:
--   - FASE E (los 4 predicados). Deja la superficie SECURITY DEFINER alcanzable
--     por anon en CERO. authenticated JAMAS puede perder EXECUTE sobre ellos:
--     EXECUTE se comprueba al evaluar la policy y se cae el CRM entero.
--   - ALTER DEFAULT PRIVILEGES (la causa raiz estructural). MEDIDO en
--     pg_default_acl para schema `public`, grantor `postgres`: las tablas nuevas
--     nacen con `anon=arwdDxtm` = INSERT/SELECT/UPDATE/DELETE/TRUNCATE/
--     REFERENCES/TRIGGER/MAINTAIN, y las funciones nuevas con `anon=X`.
--     *** O sea NO es "nace filtrando lectura": nace con CRUD COMPLETO para
--     *** anon. Es exactamente como nacieron las 9 tablas de 0028, donde anon
--     *** podia VACIAR la base de conocimiento de Ava. Esto debe arreglarse
--     *** ANTES de crear cualquier tabla nueva en `public`.
--   - orchestrator.py: la variable se sigue llamando SUPABASE_ANON_KEY mientras
--     contiene un secreto de service_role. Exige tocar el repo de Ava.
