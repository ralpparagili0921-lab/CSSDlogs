-- ============================================================
-- Migration: RO Conductivity and TDS changed from daily to weekly
-- (Monday), per updated department practice. Purely a data update,
-- no structural change.
-- ============================================================

update ro_parameters set schedule_frequency = 'weekly', schedule_day = 'Monday' where name in ('Conductivity', 'TDS');
