-- ============================================================
-- Migration: Temperature & Humidity abnormality reporting — time
-- reported + actions taken, matching the Equipment Downtime pattern.
-- Purely additive.
-- ============================================================

alter table temp_humidity_logs add column if not exists time_reported_abnormality timestamptz;
alter table temp_humidity_logs add column if not exists abnormality_action text[];
alter table temp_humidity_logs add column if not exists abnormality_action_other text;
