-- ============================================================
-- Migration: app-generated serial numbers for every logbook that
-- didn't already have a natural one — Equipment Downtime (EQ-),
-- QA Testing (QA-), Instrument Maintenance (IM-), RO Water Quality
-- (RO-), Instrument/Supplies Handover (HO-), Temperature & Humidity
-- (TH-). Purely additive; existing rows are left with a null serial
-- (only new entries going forward get one).
-- ============================================================

alter table equipment_downtime add column if not exists serial_number text unique;
alter table sterilizer_qa_tests add column if not exists serial_number text unique;
alter table instrument_maintenance add column if not exists serial_number text unique;
alter table ro_water_quality add column if not exists serial_number text unique;
alter table instrument_handovers add column if not exists serial_number text unique;
alter table temp_humidity_logs add column if not exists serial_number text unique;
