---
plan: B11-P02
phase: B11
subsystem: publicidad / campaigns API
tags: [api, campaigns, crud, zod, auth, rate-limit]
status: complete
completed: 2026-05-07
duration_minutes: 15
tasks_completed: 3
tasks_total: 3
files_created: 3
files_modified: 0
requires: []
provides: [GET /api/campaigns, POST /api/campaigns, PATCH /api/campaigns/[id], DELETE /api/campaigns/[id]]
affects: [app/dashboard/ads]
tech_stack_added: []
tech_stack_patterns: [zod validation, role-based API guards, soft-delete pattern, rate limiting]
key_files_created:
  - app/dashboard/ads/_schemas/campaign.ts
  - app/api/campaigns/route.ts
  - app/api/campaigns/[id]/route.ts
key_decisions:
  - Soft-delete via status="ended" — hard delete not implemented to preserve campaign history
  - Auth lookup via agents.email (matches existing pattern in meta/sync route)
  - PLATFORM_VALUES includes whatsapp + ctwa (plan schema matches actual table values from research)
---

# Phase B11 Plan P02: Campaigns CRUD API Summary

Wired four HTTP verbs for the campaigns resource — GET list, POST create, PATCH partial update, DELETE soft-archive — all auth-guarded to admin/manager roles with Zod validation and rate limiting matching the project's existing API patterns.

## What Was Built

Three files establish the full server-side API layer for campaigns. A shared Zod schema (`campaign.ts`) defines and exports `campaignCreateSchema` and `campaignUpdateSchema` with all 9 editable fields plus platform/status enum constants. Two route files handle the four HTTP verbs: `GET /api/campaigns` returns all campaigns ordered by `start_date` desc; `POST /api/campaigns` validates the body with Zod and inserts; `PATCH /api/campaigns/[id]` accepts a partial body for field-level updates; `DELETE /api/campaigns/[id]` soft-archives by setting `status = "ended"` without destroying the row.

## API Contract

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| GET | /api/campaigns | admin\|manager | — | 200 Campaign[] |
| POST | /api/campaigns | admin\|manager | CampaignCreate | 201 Campaign |
| PATCH | /api/campaigns/[id] | admin\|manager | CampaignUpdate (partial) | 200 Campaign |
| DELETE | /api/campaigns/[id] | admin\|manager | — | 200 {id, status:"ended"} |

All four return 401 for unauthenticated requests and 403 for authenticated non-admin/manager users.

## Schema Fields

`campaignCreateSchema` covers: `name` (required, max 200), `platform` (enum: facebook | instagram | google | tiktok | whatsapp | ctwa | other), `status` (enum: active | paused | ended, default "active"), `start_date` / `end_date` (YYYY-MM-DD regex, nullable), `spend` (number ≥ 0, nullable), `leads_generated` / `clicks` / `impressions` (int ≥ 0, nullable).

## Soft-Delete Approach

DELETE does not remove the row. It sets `status = "ended"` and returns `{id, status}`. This preserves campaign spend/lead history for analytics. Hard delete is not surfaced — campaigns are immutable records once created.

## Key Files

### Created
- `app/dashboard/ads/_schemas/campaign.ts` — Zod schema (campaignCreateSchema, campaignUpdateSchema, type exports, enum constants)
- `app/api/campaigns/route.ts` — GET all campaigns, POST create campaign
- `app/api/campaigns/[id]/route.ts` — PATCH partial update, DELETE soft-archive

## Commits

| Hash | Message |
|------|---------|
| 03eaa2a | feat(B11-P02): add Zod campaign schema |
| 2ae7ecd | feat(B11-P02): add GET + POST /api/campaigns route |
| e14166d | feat(B11-P02): add PATCH + DELETE /api/campaigns/[id] route (soft delete) |

## Deviations from Plan

None — plan executed exactly as written. Used the plan's own schema definition (which includes `whatsapp` and `ctwa` platforms from the research interface, matching actual table values) rather than the abbreviated instruction schema.

## Self-Check: PASSED

- Zod schema created with all 9 fields, platform/status enums, and partial update variant
- GET /api/campaigns returns campaigns array (auth-guarded, rate-limited 30 req/min)
- POST /api/campaigns validates + inserts, returns 201 (rate-limited 10 req/min)
- PATCH /api/campaigns/[id] validates partial body + updates (rate-limited 20 req/min)
- DELETE /api/campaigns/[id] soft-deletes via status="ended" (rate-limited 10 req/min)
- Role check enforced (admin/manager only for all verbs)
- TypeScript compiles cleanly (tsc --noEmit exits 0)
- All three files verified present on disk
