-- ============================================================
-- Migration: splits Temperature & Humidity's logbook_assignments key
-- into 'temp-humidity-am' and 'temp-humidity-pm' — this logbook now
-- has two separate scheduled readings per day (AM ~7-8am, PM ~2-4pm),
-- each needing its own primary-assigned staff member, rather than one
-- shared assignment for the whole logbook.
--
-- No existing assignment data to migrate — this logbook never had any
-- seeded/saved assignments to begin with, confirmed directly against
-- the schema before writing this. Just widens which values the
-- 'logbook' column accepts.
-- ============================================================

alter table logbook_assignments drop constraint if exists logbook_assignments_logbook_check;
alter table logbook_assignments add constraint logbook_assignments_logbook_check
  check (logbook in ('ro','equipment','cycles','qa','brush','instrument','handover','temp-humidity-am','temp-humidity-pm','housekeeping'));
