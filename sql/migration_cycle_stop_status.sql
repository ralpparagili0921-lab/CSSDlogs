-- ============================================================
-- Migration: Cycle Log gains a 'Stopped' status (Phase 3 abort, with
-- remarks — a real audited event since the cycle already truly
-- started, unlike a Draft-stage abort which deletes the row entirely
-- to free its cycle number for reuse), plus parameters_saved_at to
-- complete the full action-by-action timestamp trail.
-- ============================================================

alter table sterilization_cycles alter column machine_id drop not null;
alter table sterilization_cycles drop constraint if exists sterilization_cycles_status_check;
alter table sterilization_cycles add constraint sterilization_cycles_status_check
  check (status in ('Draft','In Progress','Completed','Stopped'));
alter table sterilization_cycles add column if not exists parameters_saved_at timestamptz;
alter table sterilization_cycles add column if not exists stopped_at timestamptz;
alter table sterilization_cycles add column if not exists stopped_by text;
alter table sterilization_cycles add column if not exists stop_remarks text;
