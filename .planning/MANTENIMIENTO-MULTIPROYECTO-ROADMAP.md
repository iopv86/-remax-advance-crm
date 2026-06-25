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

### Sesión 1 — Finance: tasa USD/DOP (quick win)  ⬜ PENDIENTE
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

### Sesión 2 — Ava: bug de prod `obtener_info_proyecto` + verificación B14  ⬜ PENDIENTE
**Proyecto:** Ava — `C:\Users\ivanp\whatsapp-agentkit` (Railway, Python FastAPI + GPT-4o).
**Objetivo:** arreglar el tool roto en prod y verificar el flujo de leads con score.
1. **BUG `obtener_info_proyecto` roto para los 6 proyectos.** Memoria dice `AVA_EMAIL`/`AVA_PASS` faltantes,
   pero Railway lista `SUPABASE_AVA_EMAIL`/`SUPABASE_AVA_PASSWORD` → DISCREPANCIA DE NOMBRE. VERIFICAR qué var
   lee el código (`agent/supabase_auth.py` / `tools.py`), confirmar en Railway, probar el tool en prod.
   Root cause antes de parchear (sin auth → PostgREST slug→ID → pgvector RPC no ejecuta).
2. **Verificación funcional B14:** `registrar_lead` con `score` (HOT/WARM-A/WARM-B/COLD) → crea deal en
   `nuevo_sin_contactar` para hot/warm, COLD solo follow-up. Disparar el path (conversación WA real o test que
   invoque `registrar_lead` con score) y confirmar contacto+deal+agente en el CRM.
**Deploy:** git push a `iopv86/remax-advance-ava` (verificar build Railway SUCCESS). py_compile + tests antes de push.
**DB:** Ava lee/escribe en la DB del CRM (`zlnqsgepzfghlmsfolko`: contacts/mensajes) + `project_availability`.
**Accesos:** https://remax-advance-ava-production.up.railway.app.

### Sesión 3 — CRM: cleanup técnico (deuda)  ⬜ PENDIENTE
**Proyecto:** Advance CRM — `C:\Users\ivanp\advance-crm` (Vercel). NO toca Ava. (Roadmap Intereses+Campañas YA completo.)
Items independientes, commitear por separado. Ver `INTERESES-CAMPANAS-ROADMAP.md` sección "Follow-ups / deuda".
1. **Cleanup 1C:** `drop column move_timeline` de `contacts` (muerta, 0 filas — VERIFICAR primero en prod y que
   ningún lector la use). Retirar el escalar `property_type_interest` SOLO tras migrar el CSV export
   (`app/api/contacts/export`) al array `property_types` (resto de lectores ya usan el array). Migración via MCP.
2. **Deuda S2 webhook:** refactor de `app/api/meta/lead-webhook/route.ts` para llamar a `processLead()`
   (`lib/meta-leads.ts`) en vez de duplicar `isValidPhone`/`assignRrAgent`/`notifyAgent`(emoji)/`GRAPH_VERSION`
   (pasar fallback `change.value.ad_id`). Path gated off (`META_LEAD_WEBHOOK_ENABLED`) → bajo riesgo. Quita el emoji.
3. **Pill USD/DOP mobile:** hoy vive en el header `hidden md:flex` (solo desktop). Darle lugar accesible en
   mobile (hero quick-stats o slot del layout mobile) sin romper desktop.
**QA prod Playwright** por item. **Accesos:** https://remax-advance-crm.vercel.app (ipimentel@remaxadvance.com / Rodrigo2016).

### Sesión 4 — Ava: hardening + n8n + docs  ⬜ PENDIENTE
**Proyecto:** Ava — `C:\Users\ivanp\whatsapp-agentkit` + n8n (`irmgroup.app.n8n.cloud`).
1. **Hardening:** migrar las lecturas read-only de Ava de service-role key → anon key (pendiente v9). VERIFICAR
   que las RLS de Ava (`is_ava_bot`) permiten los reads con anon+JWT ANTES de cambiar.
2. **n8n WF05 Follow-up QA:** agendado ≥ 2026-07-01 (reset mensual de templates Meta). Validar exec del workflow 05
   (`5zfxCLHPgMMG2DJY`) — Step 1/2/3 re-engagement. (Si la sesión es antes del 01-jul, saltar este punto.)
3. **P3 M4:** documentar los WA workflows legacy (`WA - Webhook Verify`, `WA - Lead Capture & Qualify`).
**Deploy:** git push a `iopv86/remax-advance-ava` si toca código. **Plugins:** n8n-MCP.

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
- ⬜ S1 Finance tasa · ⬜ S2 Ava bug+B14 · ⬜ S3 CRM cleanup · ⬜ S4 Ava hardening+n8n+docs · ⬜ S5 CRM B-15 CAPI · ⬜ S6 diferidos/bloqueados
- Sugerencia: S1–S4 son las de mayor valor/menor riesgo. S5 es feature. S6 es opcional/bloqueado.
