-- ============================================================
-- Run this ONLY if you already executed the original (v1) schema.sql
-- in Supabase and have NOT entered any real data you need to keep.
-- This drops those tables so you can re-run the new schema.sql cleanly.
--
-- If you DO have real data already logged that you need to preserve,
-- stop here — ask Claude for a proper migration (ALTER TABLE) script
-- instead of running this.
-- ============================================================

drop table if exists ro_water_quality cascade;
drop table if exists ro_parameters cascade;
drop table if exists ro_testers cascade;
drop table if exists autoclave_downtime cascade;
drop table if exists autoclave_machines cascade;
drop table if exists equipment_downtime cascade;
drop table if exists machines cascade;
drop table if exists sterilization_cycles cascade;
drop table if exists sterilizer_qa_tests cascade;
drop table if exists instrument_maintenance cascade;
drop table if exists instrument_handovers cascade;
drop table if exists schedule_exceptions cascade;
drop table if exists pending_exceptions cascade;
drop table if exists brush_logs cascade;
drop table if exists brushes cascade;
drop table if exists ro_thresholds cascade;
drop table if exists logbook_assignments cascade;
drop table if exists app_meta cascade;
drop table if exists staff cascade;

-- Now open sql/schema.sql, copy all of it, and run it in a new query.
