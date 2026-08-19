-- ============================================================
-- Third and corrected attempt at the Temp/Humidity AM/PM assignment
-- migration. The v2 attempt had a plain ordering bug: it tried to
-- INSERT rows using the new 'temp-humidity-am'/'temp-humidity-pm'
-- values before the constraint that actually allows those values had
-- been widened yet — so the insert itself failed against the still-
-- narrow, original constraint.
--
-- Correct order: widen the constraint FIRST (so the new values become
-- valid), THEN migrate the existing data into them, THEN remove the
-- now-obsolete old rows.
-- ============================================================

alter table logbook_assignments drop constraint if exists logbook_assignments_logbook_check;
alter table logbook_assignments add constraint logbook_assignments_logbook_check
  check (logbook in ('ro','equipment','cycles','qa','brush','instrument','handover','temp-humidity-am','temp-humidity-pm','housekeeping','temp-humidity'));
-- (temp-humidity is kept in the allowed list for this one script only,
-- just long enough for the migration below to still read the old rows
-- before they're deleted — removed again at the very end.)

insert into logbook_assignments (logbook, staff_id, priority_rank)
  select 'temp-humidity-am', staff_id, priority_rank from logbook_assignments where logbook = 'temp-humidity'
  on conflict (logbook, priority_rank) do update set staff_id = excluded.staff_id;

insert into logbook_assignments (logbook, staff_id, priority_rank)
  select 'temp-humidity-pm', staff_id, priority_rank from logbook_assignments where logbook = 'temp-humidity'
  on conflict (logbook, priority_rank) do update set staff_id = excluded.staff_id;

delete from logbook_assignments where logbook = 'temp-humidity';

-- Now safe to drop 'temp-humidity' from the allowed list for good,
-- since no row uses it anymore.
alter table logbook_assignments drop constraint if exists logbook_assignments_logbook_check;
alter table logbook_assignments add constraint logbook_assignments_logbook_check
  check (logbook in ('ro','equipment','cycles','qa','brush','instrument','handover','temp-humidity-am','temp-humidity-pm','housekeeping'));
