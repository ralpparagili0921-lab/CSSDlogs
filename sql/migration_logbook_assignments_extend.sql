-- ============================================================
-- Migration: extend logbook_assignments to cover all 9 logbooks —
-- Handover, Temperature & Humidity, and Housekeeping had no way to
-- have a default assignee at all, since the check constraint only
-- listed the original 6. Purely additive.
-- ============================================================

alter table logbook_assignments drop constraint if exists logbook_assignments_logbook_check;
alter table logbook_assignments add constraint logbook_assignments_logbook_check
  check (logbook in ('ro','equipment','cycles','qa','brush','instrument','handover','temp-humidity','housekeeping'));

insert into logbook_assignments (logbook) values ('handover'), ('temp-humidity'), ('housekeeping')
  on conflict do nothing;
