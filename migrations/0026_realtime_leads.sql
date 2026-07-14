-- 0026_realtime_leads
-- Habilita Supabase Realtime para la vista "Leads Entrantes" (dentro de Publicidad).
-- La publication supabase_realtime existe pero no tenía tablas públicas
-- (la subscripción de notifications en el sidebar era un no-op silencioso).
-- Añade deals y activities para que un INSERT/UPDATE dispare router.refresh()
-- en el tab de Leads Entrantes. Idempotente y aditivo; no toca Finance ni Ava.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
  END IF;
END $$;
