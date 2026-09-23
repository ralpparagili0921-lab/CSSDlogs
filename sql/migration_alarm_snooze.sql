-- ============================================================
-- Migration: adds alarm_snooze_minutes to app_meta — how long
-- acknowledging an alarm silences it before it resumes, if the
-- underlying task is still unresolved. Superuser-adjustable in
-- Admin, default 5 minutes.
-- ============================================================

alter table app_meta add column if not exists alarm_snooze_minutes integer not null default 5;
