-- Migration: 0005_property_units
-- Description: Adds property_units table for proyecto (development) feature.
--   Each property can have many units (apartments, villas, etc.).
--   Agents upload units via CSV import on the property detail page.
-- Run in: Supabase SQL Editor (project zlnqsgepzfghlmsfolko)

CREATE TABLE property_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_number text NOT NULL,         -- e.g. "101", "Penthouse A"
  unit_type text,                    -- apartment, penthouse, villa, etc.
  area_m2 numeric(10,2),
  bedrooms smallint,
  bathrooms smallint,
  price numeric(14,2),
  currency text DEFAULT 'USD',
  status text DEFAULT 'available',   -- available, reserved, sold
  floor_plan_url text,               -- optional image
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint enables upsert by (property_id, unit_number)
CREATE UNIQUE INDEX property_units_property_unit_uidx
  ON property_units (property_id, unit_number);

-- RLS
ALTER TABLE property_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_units_select"
  ON property_units FOR SELECT USING (true);

CREATE POLICY "property_units_write"
  ON property_units FOR ALL
  USING (is_privileged_user())
  WITH CHECK (is_privileged_user());
