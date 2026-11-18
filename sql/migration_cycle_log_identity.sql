-- ============================================================
-- Migration: Cycle Log's Identity Confirm rollout. sterilization_cycles
-- already has several free-text "who did this" fields (operator_start,
-- stopped_by, operator_end, alarm_acknowledged_by) with no matching id
-- column — these add the id companions so each can actually be tied
-- back to a real staff record, not just a name string. operator_end
-- existed in the schema already but was never actually written to by
-- any code — now wired up as part of this rollout.
-- timeline_confirmed_by is new: the 4 guided-timeline steps (Flush,
-- Drying, Open Hatch, Cool Down) share one function and had no
-- identity field at all — one JSONB column rather than 8 separate
-- id/name columns, keyed by step name.
-- BI's result-save step also gets its own read_by pair, distinct from
-- the existing staff_id/staff_name (which the Initiate step already
-- uses) — different moment, often a different person, given
-- incubation takes hours.
-- ============================================================

alter table sterilization_cycles add column if not exists operator_start_id uuid references staff(id);
alter table sterilization_cycles add column if not exists stopped_by_id uuid references staff(id);
alter table sterilization_cycles add column if not exists operator_end_id uuid references staff(id);
alter table sterilization_cycles add column if not exists timeline_confirmed_by jsonb;

alter table sterilizer_qa_tests add column if not exists bi_read_by_id uuid references staff(id);
alter table sterilizer_qa_tests add column if not exists bi_read_by_name text;
