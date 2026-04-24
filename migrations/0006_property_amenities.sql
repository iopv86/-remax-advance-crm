-- Migration: 0006_property_amenities
-- Description: Adds boolean amenity columns and rent-specific field to properties.
--   Replaces the unstructured amenities text[] with typed, filterable columns.
-- Run in: Supabase SQL Editor (project zlnqsgepzfghlmsfolko)

ALTER TABLE properties
  -- Piscina / pool
  ADD COLUMN IF NOT EXISTS has_pool            boolean NOT NULL DEFAULT false,
  -- Gimnasio
  ADD COLUMN IF NOT EXISTS has_gym             boolean NOT NULL DEFAULT false,
  -- Terraza
  ADD COLUMN IF NOT EXISTS has_terrace         boolean NOT NULL DEFAULT false,
  -- Seguridad 24h / caseta
  ADD COLUMN IF NOT EXISTS has_security        boolean NOT NULL DEFAULT false,
  -- Ascensor / elevator
  ADD COLUMN IF NOT EXISTS has_elevator        boolean NOT NULL DEFAULT false,
  -- Estacionamiento cubierto
  ADD COLUMN IF NOT EXISTS has_covered_parking boolean NOT NULL DEFAULT false,
  -- Planta eléctrica / generator
  ADD COLUMN IF NOT EXISTS has_generator       boolean NOT NULL DEFAULT false,
  -- Storage / cuarto de almacenamiento
  ADD COLUMN IF NOT EXISTS has_storage         boolean NOT NULL DEFAULT false,
  -- Lavandería
  ADD COLUMN IF NOT EXISTS has_laundry         boolean NOT NULL DEFAULT false,
  -- Amueblado
  ADD COLUMN IF NOT EXISTS has_furnished       boolean NOT NULL DEFAULT false,
  -- Balcón
  ADD COLUMN IF NOT EXISTS has_balcony         boolean NOT NULL DEFAULT false,
  -- Cuarto de servicio / staff quarters
  ADD COLUMN IF NOT EXISTS has_staff_quarters  boolean NOT NULL DEFAULT false,
  -- Paneles solares
  ADD COLUMN IF NOT EXISTS has_solar_panels    boolean NOT NULL DEFAULT false,
  -- Jacuzzi
  ADD COLUMN IF NOT EXISTS has_jacuzzi         boolean NOT NULL DEFAULT false,
  -- Vista al mar
  ADD COLUMN IF NOT EXISTS has_ocean_view      boolean NOT NULL DEFAULT false,
  -- Vista a la ciudad
  ADD COLUMN IF NOT EXISTS has_city_view       boolean NOT NULL DEFAULT false,
  -- Club house / amenidades de condominio
  ADD COLUMN IF NOT EXISTS has_club_house      boolean NOT NULL DEFAULT false,
  -- Área de niños / parque infantil
  ADD COLUMN IF NOT EXISTS has_kids_area       boolean NOT NULL DEFAULT false,
  -- Meses de garantía (alquileres) — default 2
  ADD COLUMN IF NOT EXISTS guarantee_months    smallint NOT NULL DEFAULT 2;

COMMENT ON COLUMN properties.guarantee_months IS 'Meses de garantía requeridos para alquiler. Default 2.';
