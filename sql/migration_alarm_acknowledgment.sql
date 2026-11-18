-- ============================================================
-- Migration: adds alarm_acknowledged_at/by to both
-- sterilization_cycles and sterilizer_qa_tests — captures exactly
-- when someone acknowledged the exposure-complete or
-- incubation-complete alarm popup. Acknowledging silences the
-- repeating sound/popup but deliberately does NOT clear the card's
-- red glow — that only clears once the underlying task is actually
-- completed/stopped/logged, so the alarm can't be "dismissed away"
-- without the real work happening.
-- ============================================================

alter table sterilization_cycles add column if not exists alarm_acknowledged_at timestamptz;
alter table sterilization_cycles add column if not exists alarm_acknowledged_by text;
alter table sterilizer_qa_tests add column if not exists alarm_acknowledged_at timestamptz;
alter table sterilizer_qa_tests add column if not exists alarm_acknowledged_by text;
