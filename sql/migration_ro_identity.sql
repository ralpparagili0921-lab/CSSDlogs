-- ============================================================
-- Migration: adds identity-capture columns for RO Water Quality's
-- two recording points that had none — activating monitoring (a
-- singleton app_meta row) and adding a tester. Save entry already had
-- staff_id/staff_name and needed no schema change. Part of the
-- app-wide Identity Confirm rollout — see js/identity-confirm.js.
-- ============================================================

alter table app_meta add column if not exists ro_monitoring_activated_by_id uuid references staff(id);
alter table app_meta add column if not exists ro_monitoring_activated_by_name text;
alter table ro_testers add column if not exists added_by_id uuid references staff(id);
alter table ro_testers add column if not exists added_by_name text;
