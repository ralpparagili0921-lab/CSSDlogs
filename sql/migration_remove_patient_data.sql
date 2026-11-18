-- ============================================================
-- Migration: removes patient_number and procedure_name from
-- sterilization_cycles entirely — a privacy fix, not a workflow
-- change. Unlike removing the chemical indicator field earlier (where
-- historical data was deliberately preserved), this DROP genuinely
-- deletes any patient numbers or procedure names already recorded
-- from past flash-sterilization cycles. That's the point: this data
-- shouldn't have been stored here, so simply hiding the fields from
-- new entries would leave the actual privacy liability sitting in
-- the database untouched.
--
-- Kept, since none of it is patient-identifying: operating_room,
-- surgeon, received_by, time_delivered_to_sterile_field, flash_reason,
-- usage_disposition, storage_end_time.
-- ============================================================

alter table sterilization_cycles drop column if exists patient_number;
alter table sterilization_cycles drop column if exists procedure_name;
