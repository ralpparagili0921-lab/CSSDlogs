-- ============================================================
-- Migration: Instrument Handover becomes a public submission portal
-- (no PIN) for other departments, with CSSD staff only handling
-- release. Adds OR to the department list, adds submitted_by_name
-- (the external department staff's typed name), and relaxes
-- received_by_name to nullable since intake no longer requires a
-- CSSD account.
-- ============================================================

alter table instrument_handovers drop constraint if exists instrument_handovers_department_check;
alter table instrument_handovers add constraint instrument_handovers_department_check
  check (department in ('ER','OPD','OR','WARD 2nd Floor','WARD 3rd Floor','Other'));

alter table instrument_handovers add column if not exists submitted_by_name text;
alter table instrument_handovers alter column received_by_name drop not null;
