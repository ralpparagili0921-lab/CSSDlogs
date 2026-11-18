-- ============================================================
-- Migration: department accounts (external ER/OPD/OR/Ward staff who
-- submit items and verify their own release), and a real third stage
-- for Instrument/Supplies Handover — Processing -> Released ->
-- Received (verified by the submitting department with their own PIN).
-- Purely additive.
-- ============================================================

alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('superuser','admin','user','department'));
alter table staff add column if not exists department text check (department in ('ER','OPD','OR','WARD 2nd Floor','WARD 3rd Floor','Other'));
alter table staff add column if not exists department_other text;

alter table instrument_handovers add column if not exists submitted_by_id uuid references staff(id);
alter table instrument_handovers drop constraint if exists instrument_handovers_status_check;
alter table instrument_handovers add constraint instrument_handovers_status_check check (status in ('Processing','Released','Received'));
alter table instrument_handovers add column if not exists received_verified_by_id uuid references staff(id);
alter table instrument_handovers add column if not exists received_verified_by_name text;
alter table instrument_handovers add column if not exists received_verified_at timestamptz;
alter table instrument_handovers add column if not exists receipt_remarks text;
