-- Migration: 0009_contacts_dedup_and_phone_constraint
-- Description: Clean up duplicate contacts caused by UUID/placeholder phone values,
--   then replace the full unique constraint on phone with a partial one that
--   excludes UUID-pattern and placeholder values. Also adds a unique partial
--   index on whatsapp_number.
--
-- Root cause fixed:
--   contacts_phone_key was UNIQUE(phone) with no WHERE clause, so rows with
--   UUID-pattern phones (when contact_id was accidentally passed as phone) or
--   placeholder strings bypassed deduplication — they were unique strings and
--   PostgreSQL happily inserted them as new rows.
--
-- Run in: Supabase SQL Editor (project zlnqsgepzfghlmsfolko)
-- Safe to run multiple times (all ops are idempotent).

BEGIN;

-- ── Step 1: Reassign messages from UUID-phone contacts to their real counterpart ─

-- Rosvalsan: real record = 1a02e2de (phone=17189249880), uuid-phone = 6647023d
UPDATE messages
SET contact_id = '1a02e2de-99ec-42ce-9795-848a1d4badba'
WHERE contact_id = '6647023d-bdd3-42e3-b774-d1a49d0e6134';

-- Juancarlos: real record = 5cfb7718 (phone=18094625525), uuid-phone = cb4e1b1d, placeholder = d46bbc6c
UPDATE messages
SET contact_id = '5cfb7718-e9b3-42d8-b09e-d14c2237af61'
WHERE contact_id IN (
  'cb4e1b1d-cf4f-47eb-806b-c418e53a4c70',
  'd46bbc6c-b967-40e1-921e-7fe8ad175d6c'
);

-- ── Step 2: Delete the garbage duplicate records ──────────────────────────────

DELETE FROM contacts
WHERE id IN (
  '6647023d-bdd3-42e3-b774-d1a49d0e6134',  -- Rosvalsan, phone=UUID
  'cb4e1b1d-cf4f-47eb-806b-c418e53a4c70',  -- Juancarlos, phone=UUID
  'd46bbc6c-b967-40e1-921e-7fe8ad175d6c'   -- Juancarlos, phone=[placeholder]
);

-- ── Step 3: Drop the full unique constraint on phone ─────────────────────────
-- It has no WHERE clause so it allows UUID-strings and placeholders to bypass
-- deduplication while still blocking real phone numbers from upserting correctly
-- under race conditions.

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_key;

-- Also drop the now-redundant plain btree index (contacts_phone_key was both
-- the constraint and the index). The idx_contacts_phone partial index stays.
DROP INDEX IF EXISTS contacts_phone_key;

-- ── Step 4: Partial unique index on phone — real E.164 numbers only ───────────
-- Excludes:
--   - UUID-pattern values  (8-4-4-4-12 hex, case-insensitive)
--   - Values containing spaces or brackets (placeholders like "[número del cliente]")
--   - NULL (partial index ignores NULLs by definition)
--
-- This is the canonical deduplication key for Ava (WhatsApp phone numbers).

CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_real_uidx
  ON contacts (phone)
  WHERE
    phone IS NOT NULL
    AND phone !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND phone NOT LIKE '%[%'
    AND phone NOT LIKE '% %';

-- ── Step 5: Partial unique index on whatsapp_number ──────────────────────────
-- Same exclusion pattern. Ava always writes both phone and whatsapp_number with
-- the same value, so this gives a second deduplication path.

DROP INDEX IF EXISTS idx_contacts_whatsapp;  -- was a plain (non-unique) btree

CREATE UNIQUE INDEX IF NOT EXISTS contacts_whatsapp_real_uidx
  ON contacts (whatsapp_number)
  WHERE
    whatsapp_number IS NOT NULL
    AND whatsapp_number !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND whatsapp_number NOT LIKE '%[%'
    AND whatsapp_number NOT LIKE '% %';

COMMIT;
