---
plan: B11-P04
phase: B11
status: complete
completed: 2026-05-07
tags: [ads, meta, attribution, reach, frequency]
key-files:
  modified:
    - app/dashboard/ads/page.tsx
decisions:
  - Used JavaScript Map aggregation instead of GROUP BY (Supabase JS client limitation)
  - Leads CRM uses var(--teal) accent color when count > 0, shows "—" when 0
  - Grid expanded from 6 to 8 columns: added Reach (90px) and Leads CRM (80px)
---

# Phase B11 Plan P04: Reach, Frequency, and Leads CRM Columns Summary

Added three new columns to the Meta Ads insights table: Alcance/Reach (from `meta_ad_insights.reach`), Frecuencia (impressions÷reach ratio, 2 decimal places), and Leads CRM (server-side attribution count from contacts table).

## What Was Built

- **Attribution query:** Fetches all `contacts.meta_campaign_id` entries (non-null) and aggregates into a `Map<string, number>` server-side. Circumvents Supabase JS GROUP BY limitation by reducing in JavaScript.
- **Reach column:** Renders `meta_ad_insights.reach` with `toLocaleString()`, shows "—" when reach is 0.
- **Frequency column:** Computes `impressions / reach` rounded to 2 decimal places; shows "—" when reach is 0.
- **Leads CRM column:** Looks up `attributionMap.get(campaign_id)`, teal color when > 0, muted "—" when 0.
- **Grid layout:** Header and data row both use `gridTemplateColumns: "1fr 100px 90px 80px 80px 80px 70px 80px"` (8 columns, matching).

## Attribution Query Pattern

```typescript
const { data: attributionRows } = await supabase
  .from("contacts")
  .select("meta_campaign_id")
  .not("meta_campaign_id", "is", null);

const attributionMap = new Map<string, number>();
for (const row of attributionRows ?? []) {
  const cid = row.meta_campaign_id as string;
  if (cid) attributionMap.set(cid, (attributionMap.get(cid) ?? 0) + 1);
}
```

## Frequency Formula

`frequency = impressions / reach` — shows "—" when reach === 0 to avoid division by zero.

## Key Files

### Modified
- `app/dashboard/ads/page.tsx` — added attribution query + `attributionMap`, 3 new table columns, grid expanded to 8 columns

## Commits

- `f8c9ccc` — feat(B11-P04): fetch contact attribution map for Meta Ads table (includes both Task 1 attribution query and Task 2 column changes — single-file atomic edit)

## Deviations from Plan

None. Plan executed exactly as written. Both tasks were applied in a single atomic file edit (same file, sequential changes).

## Self-Check: PASSED

- `contacts.meta_campaign_id` fetched and aggregated into `attributionMap` ✓
- Reach column renders `meta_ad_insights.reach` with toLocaleString, "—" when 0 ✓
- Frequency column computes `impressions / reach` to 2 decimal places, "—" when reach=0 ✓
- Leads CRM column shows contact count with teal accent when > 0, "—" when 0 ✓
- Header and data row grid column counts both 8 — match ✓
- TypeScript compiles with zero errors ✓
- grep "attributionMap" returns 3 lines ✓
- grep "Reach|Freq.|Leads CRM" returns column header line ✓
- grep "meta_campaign_id" returns query lines ✓
