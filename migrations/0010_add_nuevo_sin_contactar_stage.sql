-- B14 P01 T01: nueva etapa de deal "nuevo_sin_contactar" antes de lead_captured.
-- IMPORTANTE: ALTER TYPE ADD VALUE debe ir AISLADO (sin DML que use el valor en la misma tx).
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'nuevo_sin_contactar' BEFORE 'lead_captured';
