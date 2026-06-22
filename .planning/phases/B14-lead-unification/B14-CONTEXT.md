# B14 — Unificación de Flujos de Lead + Visibilidad de Leads Entrantes

**Created:** 2026-06-22
**Status:** Planning
**Repos:** advance-crm (principal) + whatsapp-agentkit (Ava)
**Supabase:** zlnqsgepzfghlmsfolko
**Decision basis:** Council (4 voces) + Pipeline Analyst + Architect blueprint + dueño

---

## Spec (Qué / Alcance / Listo cuando)

### Qué
Unificar los dos caminos de ingesta de leads (webhook Meta Lead Forms del CRM + Ava CTWA) detrás de una sola autoridad de asignación de agente (RPC `assign_next_rr_agent`), introducir la etapa de deal `nuevo_sin_contactar` como antesala de `lead_captured`, excluir esa etapa de toda contabilidad/reporte, y añadir un tablero "Leads Entrantes" con time-to-first-touch y aging.

### Alcance
- **DB (CRM Supabase):** 3 migraciones (0010 enum, 0011 índices, 0012 recrear vistas KPI con exclusión).
- **CRM backend:** refactor de `app/api/meta/lead-webhook/route.ts`.
- **CRM frontend:** constantes de stage (`lib/types.ts`), kanban (`pipeline-client.tsx`, `deal-detail-client.tsx`), exclusión en reportes/KPI (`reports/page.tsx`, `dashboard/page.tsx`, `agents/[agent_id]/page.tsx`), nuevo tablero `dashboard/leads-entrantes/` + nav.
- **Ava:** `agent/tools.py` — crear deal para leads HOT (paridad).
- **FUERA DE ALCANCE (fase 2):** SLA timer, reasignación automática, auto-decay a closed_lost, avance de etapa anclado a evidencia, columnas denormalizadas en deals.

### Listo cuando
1. Un lead de Meta Lead Forms crea contacto con agente (vía RPC) + deal en `nuevo_sin_contactar`.
2. Un lead HOT de Ava crea deal en `nuevo_sin_contactar` con el agent_id ya asignado.
3. Leads warm/cold de Ava NO crean deal ni asignan agente (siguen en follow-up de Ava).
4. El kanban muestra `nuevo_sin_contactar` como primera columna.
5. Reportes / KPI / conversión / forecast EXCLUYEN `nuevo_sin_contactar`.
6. El tablero "Leads Entrantes" muestra por agente: asignados / sin tocar / tocados, con time-to-first-touch y aging coloreado (24h ámbar, 72h rojo).
7. Build TS limpio (0 errores). Webhook nunca inserta deal con agent_id null (fix del bug NOT NULL).

---

## Decisiones bloqueadas (no re-litigar)

| # | Decisión | Fuente |
|---|----------|--------|
| 1 | `assign_next_rr_agent()` = única autoridad round-robin; eliminar JS count-based del webhook | Council 4/4 |
| 2 | Portar validación E.164 al webhook | Council 3/4 |
| 3 | Etapa `nuevo_sin_contactar` ANTES de `lead_captured` | Pipeline Analyst |
| 4 | Lead Forms: SIEMPRE asigna agente + crea deal en `nuevo_sin_contactar` | Dueño |
| 5 | Ava HOT+WARM(A/B): asigna + crea deal en nuevo_sin_contactar; COLD: solo contacto (follow-up Ava). Requiere AÑADIR param `score` a registrar_lead (HOT/WARM-A/WARM-B/COLD→hot/warm/warm/cold) — hoy el score real se pierde | Dueño (re-decidido 2026-06-22) |
| 6 | Pipeline contable = stage != `nuevo_sin_contactar` (set explícito `NON_COUNTABLE_STAGES`, nunca comparación ordinal de enum) | Architect |
| 7 | Derivar lead_source/lead_classification por JOIN a contacts, NO columnas nuevas en deals | Architect (KISS/DRY) |

---

## Hechos del esquema verificados (2026-06-22)

- `deal_stage` enum: {lead_captured, qualified, contacted, showing_scheduled, showing_done, offer_made, negotiation, promesa_de_venta, financiamiento, contract, due_diligence, closed_won, closed_lost}. Default `lead_captured`.
- `deals`: `agent_id` uuid **NOT NULL** (FK agents ON DELETE RESTRICT); tiene `previous_stage`, `stage_entered_at timestamptz default now()`. **NO** tiene lead_source/lead_classification.
- `contacts`: `source` (enum lead_source: ctwa_ad, lead_form, referral, walk_in, website, social_media, other), `lead_classification` (hot, warm, cold, unqualified), `lead_status` (new, contacted, qualified, unqualified, nurturing, archived), `assigned_at`, `meta_lead_id`, `meta_campaign_id`, `ai_summary`, `ctwa_clid`, `meta_ad_id`, `source_detail`.
- `round_robin_config` existe; RPC `assign_next_rr_agent()` existe; `activities` existe (call|whatsapp_message|email|meeting|showing|note|task_completed).
- Migración más reciente: `0009`. Nuevas: 0010, 0011, 0012.

---

## Riesgos (del Architect)

| Sev | Riesgo | Mitigación |
|-----|--------|-----------|
| ALTO | Vista `agent_monthly_kpis` vive fuera del repo; si se recrea mal, KPIs cuentan leads sin contactar | Obtener `pg_get_viewdef` real antes de recrear; verificar post-migración |
| ALTO | `agent_id` NOT NULL: bug actual inserta null para contacto existente | Garantizar agent_id no-null en los 3 paths (existente-con-agente, existente-sin-agente, nuevo); test de los 3 |
| MEDIO | `ALTER TYPE ADD VALUE` en misma tx que su uso → error | Mantener 0010 aislado, sin DML |
| MEDIO | Doble deal abierto para mismo contacto (webhook + Ava) | Chequeo idempotencia "ya existe deal en (nuevo_sin_contactar, lead_captured)" antes de insertar, en ambos lados |
| MEDIO | Orden enum vs kanban; `>=` ordinal se rompe con ADD VALUE BEFORE | Usar `NON_COUNTABLE_STAGES` (set), nunca ordinal |
| BAJO | Evento CAPI "Lead" debe dispararse aunque etapa interna sea nuevo_sin_contactar | Verificar `lib/meta-capi.ts`, pasar nombre de evento desacoplado de etapa |

---

## Gates verificados (2026-06-22) — RESUELTOS

1. **Vistas que cuentan pipeline y DEBEN excluir `nuevo_sin_contactar`:**
   - `pipeline_summary`: `WHERE stage NOT IN (closed_won, closed_lost)` → añadir exclusión.
   - `agent_monthly_kpis`: CTEs `active_pipeline` y `stalled` usan el mismo WHERE → excluir en ambos. (`funnel_90d`/conversion no afectados.)
   - `agent_historical_kpis`: CTE `created_by_month` cuenta TODOS los deals creados (`total_deals`) → excluir nuevo_sin_contactar.
   - `agent_response_times`: basada en contacts, NO afectada.
2. **RLS:** `deals_select` y `activities_select` = `agent_id = auth.uid() OR is_admin_or_manager()`. Tablero usa cliente autenticado → agente ve lo suyo, admin/manager todo. Mismo patrón que pipeline. OK.
3. **CAPI (`lib/meta-capi.ts`):** `STAGE_EVENTS` mapea por nombre; `nuevo_sin_contactar` NO está → si el webhook pasa esa etapa NO dispara "Lead". **Fix:** pasar `stage:"lead_captured"` explícito a `fireCapiEvent` (desacoplar del stage interno).
4. **Score en Ava:** `registrar_lead` NO recibe score; persiste warm/cold desde `tipo` (proxy malo). La rúbrica real HOT/WARM-A/WARM-B/COLD vive solo en el prompt. **Fix:** añadir param `score` a la tool + executor + prompt rule 23.
5. **Triggers en deals:**
   - `trg_deal_commission` BEFORE INS/UPD → calculate_commission (OK, deal_value null).
   - `trg_deal_stage` BEFORE UPD OF stage → log_deal_stage_change (inserta deal_stage_history, setea previous_stage/stage_entered_at) — señal de "tocado/calificado".
   - `trg_notify_deal_assigned` AFTER INSERT → inserta `notifications` (campana in-app, NO WhatsApp). El insert de deal en nuevo_sin_contactar notifica al agente in-app. No duplica canal WhatsApp. OK/deseable.
6. **RPC `assign_next_rr_agent`:** SECURITY DEFINER, count-based (contacts 30d) + FOR UPDATE SKIP LOCKED + tiebreak updated_at/position. Service role puede llamarlo.
