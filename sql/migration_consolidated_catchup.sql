-- ============================================================
-- Consolidated catch-up script. Every statement here is safe to run
-- regardless of what's already been applied to your database — each
-- one uses IF EXISTS / IF NOT EXISTS, so this can't break anything
-- whether it's your first time running it or your third.
--
-- Covers everything whose live-database status couldn't be confirmed
-- directly (only schema.sql's *intended* definition could be checked,
-- not your actual live Supabase state). Two migrations from earlier
-- ARE already confirmed applied and are NOT repeated here:
--   - the tape indicator fix (you saw the "5 NULL, 4 Yes" result)
--   - the Temp/Humidity AM/PM assignment split (v3, confirmed working)
-- ============================================================

-- Remove patient number/procedure — privacy fix, genuinely deletes
-- any values already stored, not just hides the fields.
alter table sterilization_cycles drop column if exists patient_number;
alter table sterilization_cycles drop column if exists procedure_name;

-- Alarm snooze duration setting (Admin -> Alarm Snooze Duration).
alter table app_meta add column if not exists alarm_snooze_minutes integer not null default 5;

-- RO monitoring "not yet activated" gate (yellow Activate button on
-- the RO page).
alter table app_meta add column if not exists ro_monitoring_activated boolean not null default false;

-- Alarm acknowledgment columns + a forced schema-cache reload, for
-- the recurring "alarm_acknowledged_at column not found" error.
alter table sterilization_cycles add column if not exists alarm_acknowledged_at timestamptz;
alter table sterilization_cycles add column if not exists alarm_acknowledged_by text;
alter table sterilizer_qa_tests add column if not exists alarm_acknowledged_at timestamptz;
alter table sterilizer_qa_tests add column if not exists alarm_acknowledged_by text;
NOTIFY pgrst, 'reload schema';

-- Verification — run this after the above. You should see NO row
-- with 'true'/'false' in the class1_tape_changed column (confirming
-- that earlier fix held), and no patient_number/procedure_name
-- columns at all in the results below.
select column_name from information_schema.columns
where table_name = 'sterilization_cycles' and column_name in ('patient_number', 'procedure_name');
-- ^ an EMPTY result here is correct (means the columns are gone)
