---
plan: B11-P03
status: complete
completed: 2026-05-07
phase: B11
subsystem: publicidad-module
tags: [ads, campaigns, forms, next-pages]
requires: [B11-P01, B11-P02]
provides: [campaign-create-ui, campaign-edit-ui]
affects: [app/dashboard/ads]
tech-stack:
  added: []
  patterns: [server-component-auth-guard, client-form-with-fetch]
key-files:
  created:
    - app/dashboard/ads/_components/CampaignForm.tsx
    - app/dashboard/ads/campaigns/new/page.tsx
    - app/dashboard/ads/campaigns/[id]/edit/page.tsx
  modified:
    - app/dashboard/ads/page.tsx
decisions:
  - Used separate Next.js pages for create/edit rather than modals — simpler auth guards, no client-side dialog state complexity
  - CampaignForm uses single-prop `campaignId` to toggle between POST and PATCH modes
metrics:
  duration: ~10min
  tasks_completed: 3
  files_changed: 4
---

# Phase B11 Plan 03: Campaign Create/Edit Forms Summary

Campaign create and edit UI built as separate Next.js server-component pages with a shared `CampaignForm` client component. The Campanas tab in the Publicidad page now has a "+ Nueva campana" action button and per-row "Editar" links.

## What Was Built

Three new files implement the campaign management UI: a shared `CampaignForm` client component that handles both POST (create) and PATCH (edit) modes, a `/dashboard/ads/campaigns/new` page, and a `/dashboard/ads/campaigns/[id]/edit` page. Both pages include role guards (admin/manager only). The Campanas tab in `page.tsx` was updated with the create button in the card header and an "Editar" link in each table row.

## New Routes Created

| Route | Purpose |
|-------|---------|
| `/dashboard/ads/campaigns/new` | Create a new campaign |
| `/dashboard/ads/campaigns/[id]/edit` | Edit an existing campaign |

## Component Props Interface

```typescript
interface CampaignFormProps {
  campaignId?: string;          // undefined = create mode, set = edit mode
  defaultValues?: {
    name?: string;
    platform?: string;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
    spend?: number | null;
    leads_generated?: number | null;
    clicks?: number | null;
    impressions?: number | null;
  };
}
```

## Key Files

### Created
- `app/dashboard/ads/_components/CampaignForm.tsx` — shared "use client" form, 9 fields, PLATFORM_VALUES/STATUS_VALUES from schemas, POST/PATCH to /api/campaigns
- `app/dashboard/ads/campaigns/new/page.tsx` — server component, auth + role guard, renders `<CampaignForm />`
- `app/dashboard/ads/campaigns/[id]/edit/page.tsx` — server component, fetches campaign, `notFound()` guard, renders `<CampaignForm campaignId={id} defaultValues={...} />`

### Modified
- `app/dashboard/ads/page.tsx` — added "+ Nueva campana" link in Campanas card header, extended grid to 8 columns, added "Editar" link per campaign row

## Commits

| Hash | Message |
|------|---------|
| `2b2b4b9` | feat(B11-P03): add shared CampaignForm component |
| `2f2682e` | feat(B11-P03): add new and edit campaign pages |
| `9cba04a` | feat(B11-P03): wire create + edit links into Campanas tab |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `app/dashboard/ads/_components/CampaignForm.tsx` exists
- `app/dashboard/ads/campaigns/new/page.tsx` exists
- `app/dashboard/ads/campaigns/[id]/edit/page.tsx` exists
- CampaignForm exports `export function CampaignForm` with `"use client"` directive
- `grep "Nueva campa" page.tsx` returns line 127
- `grep "campaigns/new" page.tsx` returns line 123
- `grep "campaigns.*edit" page.tsx` returns line 178
- `npx tsc --noEmit` passes with zero errors
