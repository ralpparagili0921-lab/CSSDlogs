-- ============================================================
-- Migration: adds late_reason to the 5 time-bounded logbooks that
-- need a required, minimum-15-word explanation whenever an entry is
-- logged after that day's deadline. Nullable — only ever populated
-- when the entry was actually late; on-time entries leave it null.
-- ============================================================

alter table sterilizer_qa_tests add column if not exists late_reason text;
alter table ro_water_quality add column if not exists late_reason text;
alter table brush_logs add column if not exists late_reason text;
alter table temp_humidity_logs add column if not exists late_reason text;
alter table housekeeping_logs add column if not exists late_reason text;
