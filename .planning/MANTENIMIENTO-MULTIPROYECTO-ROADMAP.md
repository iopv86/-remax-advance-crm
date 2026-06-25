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

### Sesión 4 — Ava: hardening + n8n + docs  ⬜ PENDIENTE
**Proyecto:** Ava — `C:\Users\ivanp\whatsapp-agentkit` + n8n (`irmgroup.app.n8n.cloud`).
1. **Hardening:** migrar las lecturas read-only de Ava de service-role key → anon key (pendiente v9). VERIFICAR
   que las RLS de Ava (`is_ava_bot`) permiten los reads con anon+JWT ANTES de cambiar.
2. **n8n WF05 Follow-up QA (ACTIVO en S4, ya no condicional al 01-jul):** validar exec del workflow 05
   (`5zfxCLHPgMMG2DJY`) — Step 1/2/3 re-engagement, vía n8n-MCP. Nota: los templates Meta resetean mensualmente,
   así que la QA debe considerar el estado actual de la ventana de templates (no asumir reset reciente).
3. **P3 M4:** documentar los WA workflows legacy (`WA - Webhook Verify`, `WA - Lead Capture & Qualify`).
4. **Deuda de seguridad (CRM DB, descubierta en S3, solo Supabase) — definer-views que filtran PII:** las 4 views
   `contacts_active`/`contacts_archived`/`contacts_export`/`contacts_with_email` (Supabase `zlnqsgepzfghlmsfolko`)
   corren con **definer rights** y conceden `SELECT` a `anon`/`authenticated` → exponen `contacts` (incl. `phone`,
   `email`) saltándose la RLS owner-scoped de la tabla. Además están **stale** (les faltan `property_types` y todo lo
   post-0012). NO las usa ningún código de app ni función DB (verificado en S3). **Acción:** decidir con AskUserQuestion
   entre (a) `DROP` de las 4 (no hay consumidor conocido — lo más limpio) o (b) `ALTER VIEW … SET (security_invoker=on)`
   + `REVOKE` de `anon` para que respeten la RLS de quien consulta. Migración via MCP; **encaja en S4 por ser hardening
   de exposición anon en la misma DB compartida** (pero es cambio CRM-DB: NO toca código Ava/Vercel/Railway, solo SQL).
**Deploy:** git push a `iopv86/remax-advance-ava` si toca código Ava; el item 4 es migración Supabase pura (sin deploy de app). **Plugins:** n8n-MCP, Supabase MCP.

### Sesión 5 — CRM: B-15 CAPI Enhancement (feature)  ⬜ PENDIENTE
**Proyecto:** Advance CRM. Del roadmap original (B-15): señal negativa **closed_lost** a Meta CAPI + **match por
`ctwa_clid`**. Es feature, no cleanup → Architect + spec completos, posible migración. QA prod Playwright + verificar
el evento llega a Meta (Events Manager / test events). **Accesos:** CRM prod (admin Rodrigo2016).

### Sesión 6 — Diferidos / bloqueados (opcional)  ⬜ PENDIENTE
1. **CRM:** quick-edit de clasificación hot/warm/cold en la card del pipeline (diferido por conflicto dnd-kit —
   resolver el conflicto de drag-and-drop primero). UX chico.
2. **Ava — C03 Voz (Retell): BLOQUEADO** por cuentas externas. Requiere que Ivan: cree el voice agent en
   `dashboard.retellai.com` (→ `RETELL_AGENT_ID`), importe número Twilio como SIP trunk (→ `RETELL_FROM_NUMBER`),
   y entregue `RETELL_API_KEY`. Solo ejecutable cuando Ivan provea esas 3 vars; entonces: set en Railway + set webhook
   `https://remax-advance-ava-production.up.railway.app/retell/webhook` + QA de llamada saliente.

---

## Estado
- ✅ S1 Finance tasa (2026-06-25, commit 36319a2) · ✅ S2 Ava bug+B14 (2026-06-25, commit 88fa3be + migración b14_deals_ava_bot_rls) · ✅ S3 CRM cleanup (2026-06-25, commits 9fe1c88·7c9e052·dd139df + migración drop_legacy_contact_columns) · ⬜ S4 Ava hardening+n8n+docs · ⬜ S5 CRM B-15 CAPI · ⬜ S6 diferidos/bloqueados
- Sugerencia: S1–S4 son las de mayor valor/menor riesgo. S5 es feature. S6 es opcional/bloqueado.
