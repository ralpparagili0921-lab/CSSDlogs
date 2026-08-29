-- ============================================================
-- Migration: Cycle Log becomes a phased workflow — Draft (load info
-- committed, cycle number assigned, not yet started) -> In Progress
-- (Start Cycle clicked, time_start set) -> Completed (unchanged).
-- time_start becomes nullable since a Draft cycle doesn't have one
-- yet. Purely additive/widening — no existing data affected.
-- ============================================================

alter table sterilization_cycles alter column time_start drop not null;
alter table sterilization_cycles alter column operator_start drop not null;
alter table sterilization_cycles drop constraint if exists sterilization_cycles_status_check;
alter table sterilization_cycles add constraint sterilization_cycles_status_check
  check (status in ('Draft','In Progress','Completed'));
alter table sterilization_cycles alter column status set default 'Draft';
