-- ============================================================
-- Migration: adds the Release pathway to handover_items (the
-- Submission pathway's columns already exist from
-- migration_handover_items.sql). CSSD marks each item ready once
-- sterilization is actually done; only then do the two Release PIN
-- buttons appear on the department portal. Department confirms first
-- (recording any discrepancy live), then CSSD's own PIN step — shown
-- the discrepancy, if any — is their affirmation of it.
-- ============================================================

alter table handover_items add column if not exists ready_for_release_by_id uuid references staff(id);
alter table handover_items add column if not exists ready_for_release_by_name text;
alter table handover_items add column if not exists ready_for_release_at timestamptz;
alter table handover_items add column if not exists dept_release_confirmed_by_id uuid references staff(id);
alter table handover_items add column if not exists dept_release_confirmed_by_name text;
alter table handover_items add column if not exists dept_release_confirmed_at timestamptz;
alter table handover_items add column if not exists cssd_release_confirmed_by_id uuid references staff(id);
alter table handover_items add column if not exists cssd_release_confirmed_by_name text;
alter table handover_items add column if not exists cssd_release_confirmed_at timestamptz;
alter table handover_items add column if not exists has_discrepancy boolean not null default false;
alter table handover_items add column if not exists received_qty integer;
