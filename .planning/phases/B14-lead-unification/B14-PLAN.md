# B14 — Plan de Ejecución

Build order del Architect. Cada plan termina con verificación. Commits atómicos por plan.

---

## P01 — DB Migraciones (CRM Supabase, bloqueante)

**Archivos:** `migrations/0010_*.sql`, `0011_*.sql`, `0012_*.sql`

- T01. `0010_add_nuevo_sin_contactar_stage.sql` (AISLADO, sin DML):
  `ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'nuevo_sin_contactar' BEFORE 'lead_captured';`
- T02. `0011_deal_visibility_indexes.sql` (tx normal): índices
  - `idx_deals_stage_entered ON deals(stage, stage_entered_at) WHERE stage='nuevo_sin_contactar'`
  - `idx_deals_agent_stage ON deals(agent_id, stage)`
  - `idx_activities_contact_created ON activities(contact_id, created_at)`
- T03. `0012_views_exclude_new_stage.sql`: `CREATE OR REPLACE VIEW` de:
  - `pipeline_summary` → añadir `AND stage <> 'nuevo_sin_contactar'`
  - `agent_monthly_kpis` → en CTEs `active_pipeline` y `stalled`, añadir `AND stage <> 'nuevo_sin_contactar'`
  - `agent_historical_kpis` → en CTE `created_by_month`, añadir `WHERE ... AND stage <> 'nuevo_sin_contactar'`
- T04. Aplicar vía Supabase MCP `apply_migration` (cada una por separado; 0010 primero y solo).

**Verify P01:** enum contiene `nuevo_sin_contactar` (primero); las 3 vistas excluyen la etapa (`SELECT` de prueba con un deal dummy en esa etapa → no aparece en `agent_monthly_kpis.deals_active`). Rollback plan: vistas son CREATE OR REPLACE reversibles; enum value no se borra (no necesario).

---

## P02 — CRM Webhook refactor

**Archivo:** `app/api/meta/lead-webhook/route.ts`

- T05. Eliminar `roundRobinAgent()` (JS count-based). Nueva `assignRrAgent(db)`: `db.rpc("assign_next_rr_agent")` → uuid|null; luego `select id,phone,full_name from agents where id=eq`.
- T06. Añadir `isValidPhone(phone)` (port de `_is_valid_phone`: UUID_RE, E164_RE, rechaza espacios/`[`). Aplicar tras parseField: si phone inválido → `phone=null`.
- T07. Fix `agent_id` NOT NULL: branch contacto existente trae `id, agent_id`. Si tiene agent_id → deal con ese. Si no → `assignRrAgent`, patch contacto (`agent_id`, `assigned_at=now()`), deal con ese. Nunca `agent_id:null`.
- T08. Idempotencia deal: antes de insert, `select id from deals where contact_id=X and stage in (nuevo_sin_contactar, lead_captured) limit 1` → si existe, skip.
- T09. Ambos inserts de deal usan `stage:"nuevo_sin_contactar"`.
- T10. CAPI: `fireCapiEvent({ stage:"lead_captured", ... })` explícito (NO nuevo_sin_contactar).
- T11. Conservar dedup phone→meta_lead_id, manejo 23505, notifyAgent, notifyLead.

**Verify P02:** `npx tsc --noEmit` limpio. Lectura: ningún path inserta deal con agent_id null. Gate sigue activo (META_LEAD_WEBHOOK_ENABLED).

---

## P03 — CRM Frontend: registrar etapa

**Archivos:** `lib/types.ts`, `pipeline/pipeline-client.tsx`, `pipeline/[deal_id]/deal-detail-client.tsx`

- T12. `lib/types.ts`: añadir `"nuevo_sin_contactar"` a `DealStage`; `STAGE_LABELS` ("Nuevo sin contactar"); export `NON_COUNTABLE_STAGES = ["nuevo_sin_contactar"]`; export `PIPELINE_STAGE_ORDER` (empieza con la etapa nueva).
- T13. `pipeline-client.tsx`: importar `PIPELINE_STAGE_ORDER`; añadir a `STAGE_SHORT` ("NUEVO") y `STAGE_DOT` (gris `#94a3b8`). Permite drag a `lead_captured`.
- T14. `deal-detail-client.tsx`: añadir a `ALL_STAGES` + `STAGE_COLORS`.

**Verify P03:** `tsc` limpio. Kanban renderiza la columna primero.

---

## P04 — CRM Reportes/KPI: excluir etapa

**Archivos:** `dashboard/reports/page.tsx`, `dashboard/page.tsx`, `dashboard/agents/[agent_id]/page.tsx`

- T15. `reports/page.tsx`: query deals `.neq("stage","nuevo_sin_contactar")`.
- T16. `dashboard/page.tsx`: active deals/pipelineValue → excluir nuevo_sin_contactar además de closed_*. Stage breakdown: dejar STAGE_ORDER sin la etapa (ya la excluye) + comentario.
- T17. `agents/[agent_id]/page.tsx`: si lee deals directos, `.neq`; si usa vista, cubierto por P01.

**Verify P04:** `tsc` limpio. Dashboard active deals no cuenta deals en nuevo_sin_contactar (probar con deal dummy).

---

## P05 — CRM Tablero "Leads Entrantes"

**Archivos:** `dashboard/leads-entrantes/page.tsx` (server) + `leads-entrantes-client.tsx` + `dashboard/layout.tsx` (nav)

- T18. `page.tsx`: patrón de `pipeline/page.tsx` (sesión + isPrivileged). Query: deals `stage='nuevo_sin_contactar'` join contacts (nombre, phone, source, lead_classification) join agents; activities por contacto para first-touch.
- T19. `leads-entrantes-client.tsx`: métricas por agente (asignados/sin tocar/tocados), tabla ordenada por aging desc, badge color (24h ámbar/72h rojo), link a contacto + botón WhatsApp. "Sin tocar" = sin activity posterior a assigned_at.
- T20. `layout.tsx`: entrada nav "Leads Entrantes".

**Verify P05:** `tsc` limpio. Tablero carga; agente ve lo suyo, admin todo.

---

## P06 — Ava: score + deal para HOT/WARM

**Archivos:** `whatsapp-agentkit/agent/tools.py`, `agent/brain.py`

- T21. `brain.py` AVA_TOOLS `registrar_lead`: añadir param `score` enum [HOT, WARM-A, WARM-B, COLD]; actualizar description. Rule 23 del prompt: pasar score real.
- T22. `tools.py` `registrar_lead(telefono, nombre, tipo, interes, score)`: mapear score→lead_classification (HOT→hot, WARM-A/WARM-B→warm, COLD→cold). Reemplaza el derivado por `tipo`.
- T23. `tools.py` nueva `_create_deal_for_contact(contact_id, agent_id)`: POST `/rest/v1/deals` `{contact_id, agent_id, stage:"nuevo_sin_contactar", currency:"USD"}`; idempotencia (GET deals stage in nuevo/lead_captured); no-fatal.
- T24. `sync_contact_to_crm`: ya asigna agente para hot. Ampliar a `lead_classification in ("hot","warm")` para asignar + capturar el agent_id final + llamar `_create_deal_for_contact`. COLD: solo contacto (sin cambio).
- T25. `brain.py` executor: pasar `score` desde tool_input.

**Verify P06:** import sanity (`python -c "import agent.tools, agent.brain"`). Lógica: COLD no crea deal; HOT/WARM sí, con agent_id no-null.

---

## Orden y dependencias
P01 (DB) → P02, P03 (paralelos) → P04, P05 (dependen de P03 types) ; P06 (Ava) depende de P01. Deploy: CRM (Vercel) + Ava (Railway).

## Riesgos activos
agent_id NOT NULL (3 paths), enum ADD VALUE aislado, doble-deal idempotencia, vistas KPI fuera de repo, CAPI desacople.
