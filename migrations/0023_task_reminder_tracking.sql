-- 0023_task_reminder_tracking.sql
-- Notify-once tracking for the daily task-reminder cron (/api/cron/task-reminders).
-- Additive nullable column; null = reminder not yet sent. The cron claims a row by
-- setting reminder_sent_at (guarded on IS NULL) before emailing, so retries/overlap
-- never double-send. No backfill: existing pending tasks become eligible for one
-- reminder on the next due sweep.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
