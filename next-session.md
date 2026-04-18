# Next Session — Advance Estate CRM v5.0 Audit + Security + Data Scoping

**Date written:** 2026-04-17
**Project:** `C:\Users\ivanp\advance-crm\`
**Live:** https://remax-advance-crm.vercel.app
**Admin:** `ipimentel@remaxadvance.com` / `Rodrigo2016`
**Supabase:** `zlnqsgepzfghlmsfolko` — full access, no confirmation needed
**GitHub:** `https://github.com/iopv86/-remax-advance-crm`

---

## What was done last session (v5.0)

- RBAC + expanded invite form (role/phone/WhatsApp)
- Agent profile: avatar upload (Supabase `avatars` bucket) + social links
- P4: `property-images` bucket + client validation
- P1: Notifications real-time + 6 filter tabs + infinite scroll + sidebar badge
- P2: Conversations right panel — real agent name, deal links, contact profile link
- P3: Reports page — KPI cards, conversion funnel, revenue bar chart, agent table, CSV/PDF export
- Security review added as mandatory step (see memory: `feedback_security_review.md`)

---

## Session Goals (in priority order)

### 1. Full Project Audit
Review every route and feature. For each: ✅ working / ⚠️ broken / 🔒 security issue.

Routes to audit:
- `/login` — auth flow
- `/dashboard` — home page
- `/dashboard/contacts` — contact list + search
- `/dashboard/contacts/[id]` — contact detail
- `/dashboard/pipeline` — kanban board
- `/dashboard/pipeline/[deal_id]` — deal detail
- `/dashboard/properties` — property list
- `/dashboard/tasks` — task list
- `/dashboard/conversations` — 3-panel chat
- `/dashboard/notifications` — notification center
- `/dashboard/reports` — reports (admin only)
- `/dashboard/profile` — agent profile + avatar + social links
- `/dashboard/agents` — KPI agents table
- `/dashboard/ads` — ads page
- `/dashboard/settings` — settings
- `/dashboard/settings/AvaIA` — Ava config

### 2. Security Review (MANDATORY — new policy)
After audit, run `ecc:security-reviewer` on all critical areas:
- All file upload handlers (avatar, property-images)
- All Supabase queries — verify user_id derived server-side, not client-passed
- RLS policies on all buckets + tables
- Auth guards (redirect if !user) on every server page
- Role guards on restricted pages
- Input validation at API boundaries

### 3. Agent Data Scoping
Currently agents see all contacts/deals/tasks (no row-level filtering in UI).
Implement:
- Server-side query filters: `eq("assigned_agent_id", agentId)` for agents; admins see all
- Verify Supabase RLS also enforces this at DB level
- `/dashboard/contacts` — agents see only their contacts
- `/dashboard/pipeline` — agents see only their deals
- `/dashboard/tasks` — agents see only their tasks

### 4. Dashboard Home Redesign
Ivan requested a "complex, informative, beautiful" home dashboard.
Use the `frontend-design` skill + `ecc:gan-planner` to spec it first.

### 5. PropertySheet Image Upload QA
Test the full create/edit property flow with image uploads end-to-end.

---

## Supervisor Agent Pattern (MANDATORY)

Launch with **Agents Orchestrator** as supervisor + parallel specialized team:

```
SUPERVISOR: Agents Orchestrator
  ├── Agent A (ecc:security-reviewer): Full security audit of all routes + uploads + RLS
  ├── Agent B (ecc:e2e-runner / Python Playwright): Visual QA screenshots of every route
  ├── Agent C (ecc:typescript-reviewer): Code quality review of last session's files
  └── Agent D (implementation): Fix any bugs found by A+B+C
```

Supervisor reads audit results from A+B+C, prioritizes fixes, assigns to Agent D.

---

## Key Skills to Use

| Task | Skill/Agent |
|------|-------------|
| Security audit | `ecc:security-reviewer` |
| Visual QA | Python Playwright (`py -3 playwright`) |
| Frontend design | `ecc:frontend-design` or `/frontend-design` skill |
| Planning | `/ecc:plan` |
| Code review | `ecc:typescript-reviewer` |
| DB queries | `mcp__plugin_supabase_supabase__execute_sql` (no confirmation needed) |
| Build errors | `ecc:build-error-resolver` |

---

## Session Start Checklist

```bash
cd /c/Users/ivanp/advance-crm
git status
git log --oneline -5
npm run build  # verify 0 errors
```

Then:
1. Read `memory/project_advance_crm.md` for current state
2. Launch Agents Orchestrator with the team above
3. Start with audit + security in parallel, then fix

---

## Architecture Quick Reference

- **Auth:** Supabase SSR. Server auth via `/api/auth/sign-in`. Never remove this route.
- **Deals schema:** `agent_id` (not `assigned_agent_id`), `deal_value` (not `value`), NO `title` column
- **Deal stages:** `qualified, contacted, showing_scheduled, showing_done, offer_made, negotiation, closed_won, closed_lost`
- **Buckets:** `avatars` (agent photos), `property-images` (property photos)
- **Social icons:** Inline SVG — lucide-react lacks Instagram/Facebook/LinkedIn/TikTok
- **Recharts Tooltip formatter:** `(v) => [Number(v), "label"]` — do NOT type `v: number`
- **Sidebar badge:** live Supabase channel subscription in `components/sidebar.tsx`

---

## Files Modified Last Session

```
app/dashboard/notifications/notifications-client.tsx  — P1 real-time + filters + infinite scroll
app/dashboard/notifications/page.tsx                  — added user_id, limit 30
app/dashboard/conversations/conversations-client.tsx  — P2 right panel fixes
app/dashboard/reports/page.tsx                        — NEW: reports server page
app/dashboard/reports/reports-client.tsx              — NEW: recharts + agent table + CSV
app/dashboard/profile/profile-client.tsx              — avatar upload + social links
app/dashboard/profile/page.tsx                        — social link fields in select
components/sidebar.tsx                                — Notificaciones + Reportes + live badge
components/property-sheet.tsx                         — image validation
components/invite-agent-dialog.tsx                    — role + phone + WhatsApp fields
```

---

## Blocked Items

- **Meta Ads API:** Need Facebook Business Manager → System User → token with `ads_read` + Ad Account ID `act_XXXXXXXXXX`
- **Google Calendar:** Need Google Cloud OAuth credentials
- **Nanobanana logo:** PNG assets in `nanobanana-output/` — integrate when Ivan confirms approved

---

## What Good Looks Like at End of Next Session

- Every route loads and functions correctly (visual proof via Playwright)
- Security review passed with no CRITICAL issues
- Agents only see their own data in contacts/deals/tasks
- Dashboard home is redesigned and beautiful
- All findings documented in wiki log.md
