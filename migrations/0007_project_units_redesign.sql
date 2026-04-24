-- Migration: 0007_project_units_redesign
-- Drops the old property_units table (English columns, wrong name) and recreates
-- project_units with Spanish column names matching the ProjectUnit type,
-- property-units-tab.tsx, property-form.tsx, and project-units-csv.ts.
--
-- Changes:
--   • Drops property_units (old English schema, likely empty)
--   • Creates project_units with full Spanish column set
--   • Unique index on (property_id, nombre_unidad) for upsert support
--   • RLS: reads are public; writes allowed to property owner + privileged users
--
-- Run in: Supabase SQL Editor (project zlnqsgepzfghlmsfolko)

-- ── Cleanup ────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS property_units CASCADE;
DROP TABLE IF EXISTS project_units  CASCADE;

-- ── New table ──────────────────────────────────────────────────────────────────
CREATE TABLE project_units (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           uuid          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  nombre_unidad         text          NOT NULL,
  seccion               text,
  nivel                 smallint,
  habitaciones          smallint,
  banos                 smallint,
  medios_banos          smallint,
  estacionamientos      smallint,
  m2_construido         numeric(10,2),
  m2_extra              numeric(10,2),
  m2_terreno            numeric(10,2),
  m2_parqueo            numeric(10,2),
  precio_venta          numeric(14,2),
  moneda_venta          text          NOT NULL DEFAULT 'USD',
  precio_mantenimiento  numeric(10,2),
  moneda_mantenimiento  text,
  precio_separacion     numeric(10,2),
  moneda_separacion     text,
  precio_amueblado      numeric(14,2),
  estado                text          NOT NULL DEFAULT 'disponible',
  etapa                 text,
  notas                 text,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- Required for upsert(onConflict: "property_id,nombre_unidad")
CREATE UNIQUE INDEX project_units_property_nombre_uidx
  ON project_units (property_id, nombre_unidad);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE project_units ENABLE ROW LEVEL SECURITY;

-- Public read (same as properties)
CREATE POLICY "project_units_select"
  ON project_units FOR SELECT USING (true);

-- Write: property owner OR privileged user (admin/broker)
CREATE POLICY "project_units_write"
  ON project_units FOR ALL
  USING (
    is_privileged_user()
    OR EXISTS (
      SELECT 1
      FROM properties p
      JOIN agents a ON a.id = p.agent_id
      WHERE p.id = project_units.property_id
        AND a.email = auth.jwt() ->> 'email'
    )
  )
  WITH CHECK (
    is_privileged_user()
    OR EXISTS (
      SELECT 1
      FROM properties p
      JOIN agents a ON a.id = p.agent_id
      WHERE p.id = project_units.property_id
        AND a.email = auth.jwt() ->> 'email'
    )
  );
