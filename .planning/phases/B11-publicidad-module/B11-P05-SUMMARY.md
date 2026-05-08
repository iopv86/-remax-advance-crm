---
plan: B11-P05
status: complete
completed: 2026-05-07T00:00:00Z
---

## What Was Built

Created GET /api/cron/meta-sync route secured by CRON_SECRET Bearer auth (timing-safe comparison). On success, upserts meta_ad_insights rows using the same Meta Graph API pagination logic as the existing POST /api/meta/sync, then writes a meta_last_synced ISO timestamp to the agency_config key/value table. Registered in vercel.json to run daily at 06:00 UTC (02:00 Santo Domingo time, before business hours). Meta Ads tab header now shows "Ultima sync: hace Xh" using date-fns formatDistanceToNow with Spanish locale when meta_last_synced is present in agency_config; conditionally hidden when absent.

## Key Files

### Created
- app/api/cron/meta-sync/route.ts — GET cron handler, CRON_SECRET Bearer auth, Meta API sync, agency_config timestamp upsert

### Modified
- vercel.json — added crons array with /api/cron/meta-sync at schedule "0 6 * * *"
- app/dashboard/ads/page.tsx — added date-fns imports, lastSyncedAt query from agency_config, conditional "Ultima sync: hace Xh" label in Meta Ads table header

## Notes

- CRON_SECRET env var reused from existing POST /api/meta/sync — no new secrets required
- Cron schedule "0 6 * * *" = daily 06:00 UTC = 02:00 Santo Domingo (America/Santo_Domingo, UTC-4)
- agency_config key used: "meta_last_synced" (value = ISO 8601 string)
- Upsert uses onConflict: "key" to update the single config row on subsequent syncs
- When meta_last_synced is null or missing from agency_config, the timestamp label is absent from the UI (conditional render, no error state)

## Commits

- 1aa6528: feat(B11-P05): add GET /api/cron/meta-sync route with agency_config timestamp
- d0ef845: feat(B11-P05): register cron in vercel.json and add last-sync timestamp to Meta Ads UI

## Self-Check: PASSED

- GET /api/cron/meta-sync returns 401 without valid CRON_SECRET Bearer token (safeCompare fails on missing/wrong token) ✓
- Successful sync writes meta_last_synced to agency_config with onConflict: "key" ✓
- vercel.json crons array present with path "/api/cron/meta-sync" and schedule "0 6 * * *" ✓
- vercel.json is valid JSON (node -e require validated OK) ✓
- Meta Ads header shows relative timestamp when lastSyncedAt is truthy ✓
- Timestamp absent from UI when lastSyncedAt is null (conditional render) ✓
- TypeScript compiles with no errors (npx tsc --noEmit returned clean) ✓
