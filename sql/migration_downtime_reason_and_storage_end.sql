-- ============================================================
-- Migration: Equipment Downtime reason field, Cycle Log storage
-- end-time field. Purely additive.
-- ============================================================

alter table equipment_downtime add column if not exists downtime_reason text;
alter table sterilization_cycles add column if not exists storage_end_time timestamptz;
