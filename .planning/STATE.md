# Project State: Advance Estate CRM

**Last Updated:** 2026-06-24
**Current Version:** Roadmap Intereses+Campañas S2 (CRM `97e9f65` prod `8jx3feny6`) — atribución Meta al entrar el lead

## Active Phases

**Roadmap Intereses + Campañas (6 sesiones)** — `.planning/INTERESES-CAMPANAS-ROADMAP.md`. Replica el flujo AlterEstate al entrar un lead (INTERESES que el agente califica + CAMPAÑAS atribución Meta).
- **1A HECHA** (migración 0015 en prod). **1B HECHA+DESPLEGADA+QA** (CRM `f40756e`). **2 HECHA+DESPLEGADA+QA** (CRM `97e9f65` prod `8jx3feny6`).
- **3 PRÓXIMA**: Propietarios (con teléfono) en propiedades. Prompt listo en `memory/next-session-prompt.md`.
- Restantes: 4 Co-comprador/Referidor · 5 Planes de Pago · 6 Tasas Bancarias USD/DOP.

## Completed Phases

| Phase | Status | Version | Deployed |
|-------|--------|---------|---------|
| 2: Campañas — atribución Meta al entrar el lead. Migración 0016 (+6 cols meta_campaign_name/adset_id/adset_name/ad_name/form_name/platform; `meta_ad_id` ya existía → conflación era código). `fetchCampaignAttribution` enriquece `/{ad_id}` (token ads_read, header auth, AbortController 4s, degrada a null); de-conflate+backfill first-touch poller+webhook; read block "Campañas" contacto+deal | ✓ Complete + QA | CRM `97e9f65` | 2026-06-24 |
| 1B: Intereses visibilidad+edición (read block contacto+deal, MultiSelect, quick-edit badge) + fix Ava timeline (2 bugs) | ✓ Complete + QA | CRM `f40756e` + Ava `2527277` | 2026-06-24 |
| 1A: Intereses data model — migración 0015 (`property_types` multi, `operation_type`/`condition`/`desired_amenities`, `bedrooms`; gate array-aware + trigger mirror bidireccional; A-prime solo-DB) | ✓ Complete (schema) | — (sin deploy Vercel) | 2026-06-24 |
| B-17: Auto-calificacion badge UNQUALIFIED — trigger DB `apply_auto_qualification` (gate presupuesto+(tipo\|zona)+timeline≠exploring → cold+qualified), `qualification_source` freeze manual/ava, DROP `trg_contact_score`, fix enum-values editor (timeline/payment/purpose), migracion 0014 | ✓ Complete | v11.3 (`70d55ad`) | 2026-06-24 |
| B-16: Editores full-page (contacto/deal, create+edit) + captura field_data Meta (jsonb) + fix legibilidad + clasificacion en create | ✓ Complete | v11.2 (`80041d5`→`e784ecc`) | 2026-06-23 |
| B-14 + Lead Poll: Lead Forms via polling (cron 1 min, saltea push; token Meta long-lived) | ✓ Complete | v11.1 (`f82c616`) | 2026-06-23 |
| B-14: Lead Unification + Leads Entrantes | ✓ Complete | v11.0 (`38d5dee`) | 2026-06-22 |
| B-13: Round Robin & Lead Assignment Fix | ✓ Complete | v10.23 | 2026-05-22 |
| B-11: Publicidad Module | ✓ Complete | v10.15 | 2026-05-07 |

## Recent Fixes (v10.21–v10.23)

| Version | Fix | Commit |
|---------|-----|--------|
| v10.23+ | CTWA lead notifications: Ava `_notify_agent_new_lead()` wired → agent gets WhatsApp on new lead | Ava `c199497` |
| v10.23 | Pipeline card buttons (Ver/Editar/Borrar) — `position:relative + zIndex:2` sobre drag handle | `248b5ba` |
| v10.23 | Round Robin incluye rol `admin` — Ivan puede recibir leads | `248b5ba` |
| v10.22 | Pipeline filter: deals heredan agent_id del contacto; 15 deals backfilled | `6464e02` |
| v10.21 | E2E verificado: WhatsApp→Ava→CRM contacts+round-robin+mensajes | `3010f58` |
| v10.21 | 4 bugs CRM: 404, trash icon admin-only, form sync, agent UUID→name | `df5dfbf` |

## Architecture Decisions (Non-Reversible)

- **Stack:** Next.js 14 App Router, TypeScript, Supabase, Tailwind v4, Vercel
- **Theme:** Obsidian Edge (dark), brand gold #C9963A
- **Two-DB:** AMH Supabase (uohpxempgjayjlcamsuk) y CRM Supabase (zlnqsgepzfghlmsfolko) son proyectos separados
- **Auth:** Supabase Auth + @supabase/ssr (PKCE flow for invites)
- **Meta sync:** `CRON_SECRET` ya existe como env var en Vercel y en Supabase Edge Function secrets
- **Server Components first:** mutations via Server Actions o API routes; UI components son RSC por defecto
- **Lead webhook gate:** META_LEAD_WEBHOOK_ENABLED controla si los leads Meta Form entran al CRM
- **Round Robin:** `round_robin_config` tabla es source of truth; roles elegibles: agent + manager + admin
- **Editores = páginas full (B-16):** editar/crear contacto y deal son rutas propias (`/contacts/[id]/edit`, `/contacts/new`, `/pipeline/[deal_id]/edit`, `/pipeline/new`). NO drawers. Kit legible compartido en `components/form/{fields,form-shell}.tsx` (labels `--secondary-foreground`, NUNCA `text-slate-*`/`bg-white`). Mutación via browser supabase client (RLS user JWT).
- **Migración 0013:** `contacts` tiene `decision_maker text`, `linked_property_id uuid FK`, `lead_form_answers jsonb` (captura lossless del field_data Meta).
- **Trigger `trg_contact_score` (GOTCHA):** BEFORE INSERT recalcula `lead_classification` desde columnas `score_*` (vacías en create manual → 'unqualified'), sobreescribiendo el valor del payload en el INSERT. En UPDATE solo dispara si cambian `score_*`. Por eso el create del editor hace un UPDATE follow-up de `lead_classification` para respetar la elección del agente.

## Key Files

- `app/dashboard/pipeline/pipeline-client.tsx` — Kanban board con dnd-kit; DealCard con drag handle + action buttons
- `app/dashboard/agents/page.tsx` — Agents KPI + Round Robin query (roles: agent, manager, admin)
- `app/dashboard/ads/page.tsx` — módulo Publicidad completo
- `app/api/meta/sync/route.ts` — Meta Ads sync (POST, auth: admin session o CRON_SECRET Bearer)
- `app/api/meta/lead-webhook/route.ts` — Meta Lead Forms webhook (HMAC + gate)
- `lib/supabase/server.ts` — createClient para Server Components
- `lib/supabase/admin.ts` — adminClient para webhooks
- `lib/rate-limit.ts` — in-memory rate limiter

## Tables (Supabase CRM)

- `campaigns` — campañas manuales (platform, status, spend, leads_generated, clicks, impressions, start_date, end_date)
- `meta_ad_insights` — Meta Ads data (campaign_id, campaign_name, date, impressions, clicks, spend, reach, leads, cpl)
- `contacts.meta_campaign_id` — FK string que linkea leads a campañas Meta
- `contacts.agent_id` — FK a agents; asignado por round-robin al primer contacto
- `deals.agent_id` — heredado del contacto al crear el deal
- `agents` — role: admin | manager | agent; solo admin/manager ven /dashboard/ads
- `round_robin_config` — posición + is_active por agente; elegibles: agent + manager + admin
