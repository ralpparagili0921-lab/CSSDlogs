-- Belt-and-suspenders fix for the recurring "alarm_acknowledged_at
-- column not found" error. Covers both possible causes at once:
--
-- 1. If the column was somehow never actually added (a prior
--    migration silently failing, or being run against the wrong
--    place) — ADD COLUMN IF NOT EXISTS genuinely creates it now,
--    safe to run whether or not it already exists.
-- 2. If the column DOES already exist and this is really a
--    PostgREST cache issue reverting on its own — the explicit
--    reload below forces it fresh regardless of the column change
--    above having anything to actually do.

alter table sterilization_cycles add column if not exists alarm_acknowledged_at timestamptz;
alter table sterilization_cycles add column if not exists alarm_acknowledged_by text;
alter table sterilizer_qa_tests add column if not exists alarm_acknowledged_at timestamptz;
alter table sterilizer_qa_tests add column if not exists alarm_acknowledged_by text;

NOTIFY pgrst, 'reload schema';
