# Roadmap — Mantenimiento multi-proyecto (Finance + CRM + Ava)

Origen: cierre del roadmap Intereses+Campañas (2026-06-24). Quedaron pendientes acotados en 3 proyectos:
Advance Finance (tasa USD/DOP), Advance CRM (deuda técnica) y Ava (bugs de prod + hardening).
Cada sesión está dimensionada para una ventana/chat independiente y despliega SOLO su proyecto.

## Reglas comunes a todas las sesiones
- **Flujo 10 Pilares por sesión:** Architect (antes de tocar código) → specify → execute →
  security-review + code-reviewer (aplicar CRITICAL/HIGH) → deploy SOLO del proyecto → QA en prod.
- **Deploy aislado:** Finance → all-deploy (Vercel `advance-finance`). CRM → all-deploy (Vercel `advance-crm`).
  Ava → **git push al repo `iopv86/remax-advance-ava`** (auto-deploy Railway). NUNCA `railway up` a secas
  desde `whatsapp-agentkit` (ese dir linkea al servicio `n8n-orchestrator`).
- **DB:** CRM + Ava = Supabase `zlnqsgepzfghlmsfolko`; Finance = `wswxhztqdaclgasouknt`. Migraciones via MCP
  apply_migration con verificación de impacto previa. Build en verde (tsc/next build o py_compile) antes de desplegar.
- **Verificar, no asumir:** la memoria puede estar desfasada → confirmar contra código/prod antes de afirmar.
- **Nunca decir "listo" sin QA en prod.** Al cerrar: actualizar memoria del proyecto + next-session-prompt +
  wiki log + este roadmap (marcar la sesión hecha).
- **Agentes:** architect, code-reviewer, security-reviewer, Playwright MCP (QA web). **Ava usa OpenAI GPT-4o — NUNCA Anthropic.**

## Orden: S1 → S2 → S3 → S4 → S5 → S6
Prioridad: quick-win de alta visibilidad y bugs de prod primero; luego limpieza; luego hardening/docs; features al final; bloqueados/diferidos al cierre.

---

### Sesión 1 — Finance: tasa USD/DOP (quick win)  ✅ HECHA (2026-06-25, commit 36319a2)
**Resultado:** ticker muestra `USD/DOP 60.25` (Banco Popular venta, = pill del CRM; fuente TasaReal.com). Fix en
`lib/bcrd-client.ts` → `fetchFromTasaReal()`: URL real `tasareal.com/api/v1/rates`, parse `rates[]`, cadena
`popular.sell → bcrd.sell → primer banco con sell>0` (Ivan eligió Popular sobre BCRD oficial 59.68 para empatar
con el CRM y no subestimar comisiones USD). Banda de plausibilidad 40–100 antes de commission-engine (security HIGH).
Shape `{rate,source,timestamp}`, cache 5min y orden de fuentes intactos. `TASAREAL_API_KEY` puesta en Vercel prod.
QA prod Playwright PASS: ticker 60.25 + dashboard + /commissions intactos. **Siguiente: S2 Ava.**

<details><summary>Spec original</summary>
**Proyecto:** Advance Finance — `C:\Users\ivanp\advance-finance` (Vercel). NO toca CRM/Ava.
**Objetivo:** que el header (UsdDopTicker) deje de mostrar "USD/DOP --" y muestre la VENTA real.
**Root cause YA identificado (solo confirmar):** `lib/bcrd-client.ts` apunta a `https://api.tasareal.com/v1/rates/USD`
= HOST MUERTO (HTTP 000). URL real: `https://tasareal.com/api/v1/rates?currency=USD` (auth `Authorization: Bearer <key>`;
devuelve `{date,count,rates:[{institution,institution_name,institution_type,buy,sell,verification}]}`; free tier 50 req/día).
`BCRD_API_TOKEN` y `TASAREAL_API_KEY` estaban VACÍOS → caía a "--".
**Key válida (la misma del CRM):** `TASAREAL_API_KEY = tcrd_uAKKNjukTy9jlumBYtbYJfd2P7I7nR3uZ0dMAK7MwONj9z0Y`
**Alcance:** corregir URL+parse en `bcrd-client.ts`, leer la VENTA de la oficial BCRD (`institution:"bcrd"`, `sell`)
para empatar con el CRM; mantener cache 5 min y orden de fuentes; poner `TASAREAL_API_KEY` en Vercel env (production).
**NO romper:** commission-engine (usa `getUsdDopRate`) ni el invariante "montos se guardan NATIVO" (v3.8).
**QA prod:** ticker con venta real + `/commissions` y dashboard intactos.
**Accesos:** https://advance-finance-iota.vercel.app (ipimentel@remaxadvance.com / Advance2026). Constraint: `db` port 6543 en TODOS los routes.
</details>

### Sesión 2 — Ava: bug de prod `obtener_info_proyecto` + verificación B14  ✅ HECHA (2026-06-25, commit 88fa3be + migración b14_deals_ava_bot_rls)
**Resultado:** las dos "verdades" de la memoria eran STALE. Root cause real, verificado contra prod:
1. **`obtener_info_proyecto` NO estaba roto por auth.** Sign-in (SUPABASE_AVA_EMAIL/PASSWORD, presentes en
   Railway con esos nombres; `AVA_EMAIL`/`AVA_PASS` nunca los lee el código) → 200; OpenAI → 200; RPC
   `match_project_content` → 200 con 3 chunks. La path vectorial SIEMPRE funcionó. **Bug real:** el fallback
   tsvector usaba el operador PostgREST `fts` (→ `to_tsquery`), que da **HTTP 400** ante cualquier frase
   multi-palabra ("amenidades del proyecto"). Si OpenAI fallaba, el fallback 400 → devolvía vacío (de ahí el
   síntoma "roto para los 6"). Fix 1 línea en `agent/tools.py`: `fts` → `plfts` (`plainto_tsquery`, prod-test 200).
   Deploy: git push → Railway build **SUCCESS** (88fa3be). QA prod: vector 200/3 chunks + plfts 200; e2e real
   `obtener_info_proyecto` devuelve 3 chunks para bcr/gv/col (los 6 tienen embeddings).
2. **B14 sí estaba roto — descubierto en la verificación.** `registrar_lead` con score creaba el contacto pero
   `_create_deal_for_contact` daba **403 RLS** al insertar en `deals` (la policy `deals_insert` no incluía
   `is_ava_bot()`; el bot no es agente ni admin/manager). Fix: **migración `b14_deals_ava_bot_rls`** (aplicada a
   prod via MCP) — añade `OR is_ava_bot()` a `deals_insert` (WITH CHECK) y `deals_select` (USING), espejando el
   patrón YA existente en `contacts`. QA prod live: HOT→deal nuevo_sin_contactar+agente; WARM-A/WARM-B→idem
   (ambos mapean a warm); COLD→sin agente/sin deal. Filas QA limpiadas (0 remanentes). security-review (0 CRIT/HIGH;
   1 MEDIUM diferido: deals_insert no limita qué agent_id puede poner el bot — el FK ya bloquea UUIDs inexistentes,
   y un constraint is_active re-rompería deals de contactos cuyo agente se desactiva) + code-reviewer APPROVE.
**Deuda:** orchestrator.py tenía cambios sin commitear (NO míos) → dejados intactos. RR pointer avanzó +3 por el test.
**Siguiente: S3 CRM cleanup.**

<details><summary>Spec original</summary>
**Proyecto:** Ava — `C:\Users\ivanp\whatsapp-agentkit` (Railway, Python FastAPI + GPT-4o).
1. **BUG `obtener_info_proyecto` roto para los 6 proyectos.** Memoria dice `AVA_EMAIL`/`AVA_PASS` faltantes,
   pero Railway lista `SUPABASE_AVA_EMAIL`/`SUPABASE_AVA_PASSWORD`. VERIFICAR qué var lee el código, confirmar
   en Railway, probar el tool en prod. Root cause antes de parchear.
2. **Verificación funcional B14:** `registrar_lead` con `score` (HOT/WARM-A/WARM-B/COLD) → crea deal en
   `nuevo_sin_contactar` para hot/warm, COLD solo follow-up.
**DB:** `zlnqsgepzfghlmsfolko`. **Accesos:** https://remax-advance-ava-production.up.railway.app.
</details>

### Sesión 3 — CRM: cleanup técnico (deuda)  ✅ HECHA (2026-06-25, commits 9fe1c88 · 7c9e052 · dd139df, Vercel prod, NO toca Ava)
**3 items independientes, 3 commits, 3 deploys + QA prod Playwright por item.** Architect validó el diseño de los 3 al inicio.
1. **Cleanup 1C (commit 9fe1c88 + migración `drop_legacy_contact_columns`):** verificado en prod — `move_timeline` 0/150
   filas, 0 lectores; `property_type_interest` (5) totalmente espejado en `property_types` (5). App migrada PRIMERO
   (CSV export `app/api/contacts/export` ahora emite `property_types` con labels ES vía `PROPERTY_TYPE_LABELS`;
   `page.tsx`/`contacts-table`/`matching.ts`/`types.ts` array-only), desplegada, LUEGO migración (replace-then-drop:
   reescribe `apply_auto_qualification()` sin el mirror escalar, recrea trigger sin el escalar en el watch list,
   dropea ambas columnas). **Sorpresa:** 4 views legacy (`contacts_active/archived/export/with_email`) dependían del
   escalar → drop+recreate sin la columna + re-grant exacto (NO usadas por app/funciones; deuda pre-existente:
   son views definer que exponen contacts a anon, fuera de scope). QA: lista 150 contactos OK, CSV "Tipo Propiedad"=
   "Apartamento" (label del array, sin escalar), detalle contacto + matched properties OK; DB verificada (0 dead cols,
   trigger watch correcto, 4 views, property_types intacto 5).
2. **Deuda S2 webhook (commit 7c9e052):** `app/api/meta/lead-webhook/route.ts` 396→145 líneas — delega a
   `processLead(db, lead, null)` (autoridad única compartida con el poller); elimina duplicación (notifyAgent con emoji,
   GRAPH_VERSION local, isValidPhone, assignRrAgent, notifyLead, createIntakeDeal). Preserva GET challenge, HMAC,
   gate `META_LEAD_WEBHOOK_ENABLED`, fetchLeadData; fallback `lead.ad_id ?? change.value.ad_id`. Fixes de review
   aplicados: guard `lead.id` (Meta puede dar 2xx con error body) + fetch+process dentro de un try/catch por-change
   (un lead malo no aborta el batch ni 500ea a Meta). QA prod: GET token-malo→403, POST sin firma→401, app 200.
3. **Pill USD/DOP mobile (commit dd139df):** `FxRatePill` gana prop `align` (left|right, default right); render
   mobile-only (`flex md:hidden`) como **hermano** del hero strip (NO dentro — su `overflow:hidden` recortaría el
   popover); `align="left"` ancla el popover de 280px al borde izquierdo. QA Playwright: 375px→1 pill visible +
   popover sin overflow + lista completa; 320px→popover cabe (left16/right296); 1440px→1 pill en el header + ancla
   derecha (desktop intacto).
**Reviews:** security-reviewer + code-reviewer por item (0 CRITICAL/HIGH sin resolver; HIGH+MEDIUM del webhook aplicados).
**Accesos:** https://remax-advance-crm.vercel.app (ipimentel@remaxadvance.com / Rodrigo2016). **Siguiente: S4 Ava hardening+n8n+docs.**

### Sesión 4 — Ava: hardening + n8n + docs  ✅ HECHA (2026-06-25, Ava commits `1b7d366` (hardening) · `e6bcb71` (docs) + migración `drop_legacy_contacts_pii_views` + fix n8n WF05 vía REST PUT)
**4 items independientes, verificados contra prod (la memoria estaba parcialmente STALE). n8n-MCP NO conectó esta sesión → se usó la REST API pública de n8n (`N8N_API_KEY`).**
1. **Hardening (commit `1b7d366`, Railway deploy + QA PASS):** la premisa "reads en service-role" estaba STALE —
   **TODAS las lecturas YA usaban anon apikey + JWT autenticado** (`memory.py`/`tools.py`/`brain.py`/`follow_up.py`
   vía `_headers`/`_supabase_headers`). RLS verificada: permite todos los reads de Ava (`mensajes` por `auth.email()`,
   `contacts`/`deals` por `is_ava_bot()`, `projects`/`agents`/`project_units` para authenticated; `project_content`/
   `project_availability` con RLS off). La ÚNICA exposición service-role restante = el **fallback de
   `get_access_token()`** que devolvía la service-role key como bearer si el sign-in fallaba (god-mode, bypass RLS).
   Fix: **fail-closed** (raise RuntimeError, sin escalación) + guard en `inicializar_db()` (todo el arranque auth+probe
   bajo un try/except → no tumba el boot). security-review + code-reviewer CLEAN. QA prod: health 200 + `/cron/follow-ups?dry_run=true` 200 (auth path OK, sin regresión).
2. **n8n WF05 (fix + QA PASS) — estaba FUNCIONALMENTE MUERTO:** activo y "10/10 success" pero **nunca envió nada**.
   Root cause: los nodos Fetch/Patch leían `contacts` con `Authorization: Bearer <anon>` → la RLS `contacts_select`
   devuelve **0 filas a anon** (curl: anon→0, JWT-Ava→16; `follow_up_state` step/exhausted = 0 en 150 contactos =
   nunca disparó). Fix vía REST PUT: nodo nuevo **`S0 Supabase Auth`** (sign-in como `info@remaxadvance.com`) + los 6
   nodos de contacts usan ese JWT (`is_ava_bot()` pasa). **Segundo bug descubierto en la QA:** los `Patch State` usaban
   `$('Prep').item` (paired-item a través del Send) → sólo actualizaban 1 fila/run → 15/16 enviados sin registrar =
   **duplicados diarios**. Reescritos a un **PATCH bulk `id=in.(…)`** (idempotente). QA prod live: **16 plantillas
   `ava_reengagement_24h` enviadas y aceptadas por Meta** (wamid por fila), `step1=16` registrado, `s1_eligible=0`
   (cero duplicados el próximo cron). **NOTA: se enviaron 16 WhatsApp reales hoy** (Ivan lo aprobó).
3. **P3 M4 docs (commit `e6bcb71`):** documentados los 2 workflows WA legacy en `n8n/README.md` — ambos `active` pero
   **0 ejecuciones** (Meta apunta a Railway), `WA - Lead Capture & Qualify` = la Ava pre-Railway (25 nodos, tablas
   legacy `messages`/`tasks`, anon-key inline → mismo bug de RLS que WF05 si se revivieran). Desactivación diferida (dueño).
4. **Deuda de seguridad (migración `drop_legacy_contacts_pii_views`):** decisión Ivan (AskUserQuestion) = **DROP de las
   4 views**. Verificado **0 consumidores** (ni función/view DB ni código advance-crm). PII leak a `anon` cerrado;
   0 views restantes. Reversible desde historial de migración.
**Deuda S2 sin tocar** (deals_insert agent_id, MEDIUM, a propósito). **Nota:** `orchestrator.py` tenía cambios sin commitear (NO míos) → dejados intactos; sólo se commitearon los 2 archivos del item 1 + el README del item 3.
**Siguiente: S5 CRM B-15 CAPI.**

<details><summary>Spec original</summary>
**Proyecto:** Ava — `C:\Users\ivanp\whatsapp-agentkit` + n8n (`irmgroup.app.n8n.cloud`).
1. **Hardening:** migrar las lecturas read-only de Ava de service-role key → anon key (pendiente v9). VERIFICAR
   que las RLS de Ava (`is_ava_bot`) permiten los reads con anon+JWT ANTES de cambiar.
2. **n8n WF05 Follow-up QA:** validar exec del workflow 05 (`5zfxCLHPgMMG2DJY`) — Step 1/2/3 re-engagement.
3. **P3 M4:** documentar los WA workflows legacy (`WA - Webhook Verify`, `WA - Lead Capture & Qualify`).
4. **Deuda de seguridad (CRM DB):** las 4 views legacy `contacts_*` exponen `contacts` a `anon` vía definer-rights.
   Decidir con AskUserQuestion entre (a) `DROP` o (b) `security_invoker=on` + `REVOKE anon`.
**Deploy:** git push a `iopv86/remax-advance-ava`; el item 4 es migración Supabase pura. **Plugins:** n8n-MCP, Supabase MCP.
</details>

### Sesión 5 — CRM: B-15 CAPI Enhancement (feature)  🟡 CÓDIGO HECHO + DESPLEGADO + QA-LÓGICA PASS · ENTREGA A META BLOQUEADA por pixel id inválido (config pre-existente)
**Desplegado 2026-06-25 (Vercel prod, NO toca Ava/Finance). Migración `0021_capi_outbox` aplicada via MCP.**
Decisiones delegadas a experto Meta (Tracking & Measurement Specialist), luego Architect → spec → execute → security+code review → deploy → QA Playwright.

**Verdicts del experto (adoptados):** D1 disparador = **solo closed_lost**; D2 cobertura = **solo si Meta ya vio al
contacto** (tiene ctwa_clid O una fila previa en el outbox); D3 evento = **`Lead` estándar con `value:0` +
`lead_event_status:"disqualified"`** (NO custom event — lo que optimiza en 2026 es value-based + audiencias de
exclusión); D4 transporte = **outbox + cron** (un evento perdido mis-entrena el bidding).

**Implementado (commit pendiente):** (1) `lib/meta-capi.ts` reescrito — `buildCapiEvent` puro con **2 formas de
payload**: CTWA (`action_source:"business_messaging"` + `messaging_channel:"whatsapp"` + `user_data.ctwa_clid` raw +
`page_id`) vs web (`action_source:"other"`); `enqueueCapiEvent` (inserta en outbox, service-role); `dispatchCapiOutbox`
(drena, POST Graph **v23.0**, retry backoff 5 intentos, AbortController 8s); `resolvePixelId` = **env → agency_config**
(el fix real: el resto de la app usa fallback DB, meta-capi NO lo hacía). `event_id` determinista **por stage**
(`${dealId}:${stage}`) para no colisionar entre stages que mapean al mismo evento Meta. (2) migración `0021_capi_outbox`
(tabla aditiva, `event_id` único, RLS **deny-all** = solo service-role). (3) cron `/api/cron/capi-dispatch` (`*/2`,
CRON_SECRET) + 4º cron en vercel.json. (4) rewire 4 call sites a `enqueueCapiEvent` (`createIntakeDeal` devuelve id;
dedup lee `ctwa_clid`). (5) trigger **closed_lost** + gate **D2** + **anti-IDOR** en `/api/meta/capi` (lee el deal por
user-client/RLS, encola por admin); cliente manda solo `{deal_id, stage}`.

**Reviews:** security-reviewer **CLEAR** (0 CRIT/HIGH; anti-IDOR sólido, PII sha256, RLS deny-all, secretos no logueados).
code-reviewer 3 HIGH **aplicados** (event_id por-stage anti-colisión, guard `if(newDealId)` en new-contact, +timeout/429).
tsc + next build EXIT 0.

**QA prod Playwright (PASS a nivel lógica):** C1 ctwa→closed_lost = fila `business_messaging` + ctwa_clid + page_id +
value:0 disqualified (D2 abierto vía ctwa); C2 →qualified→closed_lost = 2 filas distintas (`:qualified` Lead "other" +
`:closed_lost` disqualified, D2 abierto vía prior, **sin colisión de event_id**); C3 →closed_lost directo = **0 filas**
(D2 cerrado correctamente). Dispatcher corrió, reintentó con backoff, capturó error. Test data limpiada (0 remanentes).

**🔴 BLOCKER (config, NO código) — por esto el CAPI llevaba MUERTO en prod:** el `agency_config.meta_pixel_id` =
`443666763866610744` es **inválido** → Meta responde **400 "Object with ID … does not exist / missing permissions"**.
(El Meta App ID es `4436676386610744` de 16 díg; el pixel guardado tiene 18 díg = parece app-id mal tecleado.)
`META_PIXEL_ID` tampoco está en Vercel env (por eso cayó al valor malo de agency_config). **El dispatcher, token, v23,
ambas formas de payload y el retry FUNCIONAN — Meta solo rechaza por el pixel id.** Para cerrar S5 falta: el dueño
provee el **Pixel/Dataset ID correcto** (de Events Manager) + confirma que `META_ACCESS_TOKEN` tiene acceso CAPI a ese
dataset → setearlo en `agency_config.meta_pixel_id` (editable desde Settings → Integraciones, sin redeploy) o en Vercel
`META_PIXEL_ID` → re-QA: el outbox debe pasar a `status=sent` y el evento aparecer en Events Manager/Test Events.
**Sin regresión:** antes ya no entregaba (fire-and-forget silencioso); ahora encola + reintenta + deja traza del error.

**Accesos:** CRM prod (admin Rodrigo2016). DB `zlnqsgepzfghlmsfolko`.

### Sesión 6 — Diferidos / bloqueados (opcional)  ⬜ PENDIENTE
1. **CRM:** quick-edit de clasificación hot/warm/cold en la card del pipeline (diferido por conflicto dnd-kit —
   resolver el conflicto de drag-and-drop primero). UX chico.
2. **Ava — C03 Voz (Retell): BLOQUEADO** por cuentas externas. Requiere que Ivan: cree el voice agent en
   `dashboard.retellai.com` (→ `RETELL_AGENT_ID`), importe número Twilio como SIP trunk (→ `RETELL_FROM_NUMBER`),
   y entregue `RETELL_API_KEY`. Solo ejecutable cuando Ivan provea esas 3 vars; entonces: set en Railway + set webhook
   `https://remax-advance-ava-production.up.railway.app/retell/webhook` + QA de llamada saliente.

---

## Estado
- ✅ S1 Finance tasa (2026-06-25, commit 36319a2) · ✅ S2 Ava bug+B14 (2026-06-25, commit 88fa3be + migración b14_deals_ava_bot_rls) · ✅ S3 CRM cleanup (2026-06-25, commits 9fe1c88·7c9e052·dd139df + migración drop_legacy_contact_columns) · ✅ S4 Ava hardening+n8n+docs (2026-06-25, commits 1b7d366·e6bcb71 + migración drop_legacy_contacts_pii_views + fix WF05 vía n8n REST) · ⬜ S5 CRM B-15 CAPI · ⬜ S6 diferidos/bloqueados
- Sugerencia: S1–S4 son las de mayor valor/menor riesgo. S5 es feature. S6 es opcional/bloqueado.
