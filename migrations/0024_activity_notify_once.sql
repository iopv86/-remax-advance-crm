-- 0024_activity_notify_once.sql
-- Per-row notify-once for the immediate confirmation email (/api/notify/activity).
-- Without this, an authenticated caller could re-POST the same row id to spam the
-- assigned agent and burn Resend quota. The route claims notified_at (guarded on
-- IS NULL) before sending, so repeat calls are no-ops. Additive nullable columns;
-- null = confirmation not yet sent.
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS notified_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS notified_at timestamptz;
