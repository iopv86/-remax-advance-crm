-- Migration: 0004_agency_config_and_media_fields
-- Description:
--   1. Tabla agency_config — configuración por tenant (branding, Ava instructions)
--   2. Campos media en messages — soporte multimedia WhatsApp
-- Run in: Supabase SQL Editor

-- ─── 1. agency_config ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agency_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             text UNIQUE NOT NULL,
  value           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agency_config_updated_at
  BEFORE UPDATE ON agency_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Datos iniciales — Advance Estate (ajustar según tenant)
INSERT INTO agency_config (key, value) VALUES
  ('agency_name',        'Advance Estate'),
  ('agency_tagline',     'República Dominicana'),
  ('agency_logo_url',    ''),
  ('agency_primary_color', '#e11d48'),
  ('ava_name',           'Ava'),
  ('ava_markets',        'Santo Domingo: Piantini, Naco, Evaristo Morales, La Esperilla, Bella Vista, Los Prados, Mirador Norte\nSantiago: Jardines Metropolitanos, Los Jardines, Arroyo Hondo\nPunta Cana: Cap Cana, Bávaro, Los Corales, Cocotal\nCosta Norte: Las Terrenas, Samaná, Cabarete, Sosúa'),
  ('ava_custom_instructions', '')
ON CONFLICT (key) DO NOTHING;

-- ─── 2. messages — campos multimedia ─────────────────────────────────────────

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_url   text,
  ADD COLUMN IF NOT EXISTS media_type  text;
  -- media_type values: 'audio', 'image', 'video', 'document', 'link'

COMMENT ON COLUMN messages.media_url  IS 'URL del archivo multimedia (Supabase Storage o URL externa)';
COMMENT ON COLUMN messages.media_type IS 'Tipo de media: audio, image, video, document, link';
