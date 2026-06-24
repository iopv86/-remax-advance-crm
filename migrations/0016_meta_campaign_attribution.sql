-- 0016_meta_campaign_attribution.sql
-- Session 2: full Meta campaign attribution at lead intake.
--
-- contacts already has meta_lead_id, meta_campaign_id, meta_ad_id (text).
-- meta_ad_id was NEVER written and meta_campaign_id was conflated with ad_id
-- (`campaign_id ?? ad_id`). This migration adds the missing name/dimension
-- columns. The conflation FIX is app-side (the two intake write paths), not DDL.
-- NO backfill: 0/150 contacts have campaign data today -> forward-only.
--
-- NONE of these are qualification gate inputs -> no trigger / gate changes
-- (contact_qualification_gate + trg_auto_qualification untouched).
--
-- Ground truth (verified vs prod zlnqsgepzfghlmsfolko):
--   contacts.meta_campaign_id text, contacts.meta_ad_id text already exist.

alter table contacts
  add column if not exists meta_campaign_name text,
  add column if not exists meta_adset_id      text,
  add column if not exists meta_adset_name    text,
  add column if not exists meta_ad_name       text,
  add column if not exists meta_form_name     text,
  add column if not exists meta_platform      text;

comment on column contacts.meta_campaign_id   is 'Meta campaign id (canonical). FIXED in S2: no longer conflated with ad_id. Attribution aggregation key.';
comment on column contacts.meta_campaign_name is 'Meta campaign display name. Best-effort (null when token lacks ads_read).';
comment on column contacts.meta_adset_id      is 'Meta ad set id. Best-effort via /{ad_id} enrichment.';
comment on column contacts.meta_adset_name    is 'Meta ad set display name. Best-effort.';
comment on column contacts.meta_ad_id         is 'Meta ad id. FIXED in S2: now written (was always null).';
comment on column contacts.meta_ad_name       is 'Meta ad display name. Best-effort.';
comment on column contacts.meta_form_name     is 'Meta lead form name. From poller form listing; best-effort on webhook.';
comment on column contacts.meta_platform      is 'Lead source platform: facebook | instagram (raw fb/ig normalized at render).';
