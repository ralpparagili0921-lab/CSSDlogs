-- ============================================================
-- Migration: adds ro_monitoring_activated_at to app_meta — records
-- exactly when RO monitoring was activated (not just whether), so
-- the new Missed Entries feature can correctly start tracking from
-- that date instead of flagging pre-activation days as missed.
-- ============================================================

alter table app_meta add column if not exists ro_monitoring_activated_at timestamptz;
