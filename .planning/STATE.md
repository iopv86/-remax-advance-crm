# Project State: Advance Estate CRM

**Last Updated:** 2026-06-22
**Current Version:** v11.0 (B-14)

## Active Phases

_Ninguna fase activa actualmente._

## Completed Phases

| Phase | Status | Version | Deployed |
|-------|--------|---------|---------|
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
