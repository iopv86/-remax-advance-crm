-- Migration: 0003_contact_budget_fields
-- Description: Add budget and property type fields to contacts table
-- Used by: Ava (WhatsApp agent) to match properties by budget
-- Run in: Supabase SQL Editor

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS budget_min       numeric,
  ADD COLUMN IF NOT EXISTS budget_max       numeric,
  ADD COLUMN IF NOT EXISTS budget_currency  text    DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS property_type_interest text;

-- Index for efficient budget range queries
CREATE INDEX IF NOT EXISTS idx_contacts_budget
  ON contacts (budget_min, budget_max)
  WHERE budget_min IS NOT NULL;

COMMENT ON COLUMN contacts.budget_min IS 'Minimum budget for property search (in budget_currency)';
COMMENT ON COLUMN contacts.budget_max IS 'Maximum budget for property search (in budget_currency)';
COMMENT ON COLUMN contacts.budget_currency IS 'Currency for budget fields (default USD)';
COMMENT ON COLUMN contacts.property_type_interest IS 'Property type the contact is interested in (apartment, house, penthouse, villa, land, commercial, apart_hotel, farm)';
