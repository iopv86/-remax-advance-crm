-- B14 P01 T02: índices de apoyo al tablero "Leads Entrantes" y a la exclusión por etapa.
BEGIN;

-- Tablero: filtrar deals en holding stage + ordenar por antigüedad
CREATE INDEX IF NOT EXISTS idx_deals_stage_entered
  ON deals (stage, stage_entered_at)
  WHERE stage = 'nuevo_sin_contactar';

-- Scoping por agente + etapa (reportes y tablero)
CREATE INDEX IF NOT EXISTS idx_deals_agent_stage
  ON deals (agent_id, stage);

-- time-to-first-touch: primera activity por contacto
CREATE INDEX IF NOT EXISTS idx_activities_contact_created
  ON activities (contact_id, created_at);

COMMIT;
