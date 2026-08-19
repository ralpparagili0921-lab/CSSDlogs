-- ============================================================
-- Corrected migration for the Temp/Humidity AM/PM assignment split.
-- The earlier version of this migration only checked schema.sql's
-- seed data (confirmed none there) but never checked whether real
-- assignment data had since been saved through the app's own Admin
-- UI for the old single 'temp-humidity' key — which is exactly
-- what had happened, causing the constraint to fail against an
-- existing row.
--
-- This version copies any existing 'temp-humidity' assignment into
-- BOTH the new 'temp-humidity-am' and 'temp-humidity-pm' slots first
-- (a reasonable starting point — same person for both, adjust
-- either one afterward in Admin if you want them different), then
-- removes the now-obsolete old rows, THEN widens the constraint —
-- so nothing existing gets silently lost.
-- ============================================================

insert into logbook_assignments (logbook, staff_id, priority_rank)
  select 'temp-humidity-am', staff_id, priority_rank from logbook_assignments where logbook = 'temp-humidity'
  on conflict (logbook, priority_rank) do update set staff_id = excluded.staff_id;

insert into logbook_assignments (logbook, staff_id, priority_rank)
  select 'temp-humidity-pm', staff_id, priority_rank from logbook_assignments where logbook = 'temp-humidity'
  on conflict (logbook, priority_rank) do update set staff_id = excluded.staff_id;

delete from logbook_assignments where logbook = 'temp-humidity';

alter table logbook_assignments drop constraint if exists logbook_assignments_logbook_check;
alter table logbook_assignments add constraint logbook_assignments_logbook_check
  check (logbook in ('ro','equipment','cycles','qa','brush','instrument','handover','temp-humidity-am','temp-humidity-pm','housekeeping'));
