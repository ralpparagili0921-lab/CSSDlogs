-- ============================================================
-- Migration: adds identity-capture columns for BI's preliminary
-- (1-hour early checkpoint) read — the only remaining recording
-- point on sterilizer_qa_tests without one. Part of the app-wide
-- Identity Confirm rollout — see js/identity-confirm.js.
-- (bi_read_by_id/name for the FULL BI result were already added in
-- migration_cycle_log_identity.sql, since Cycle Log's BI flow shares
-- this same table.)
-- ============================================================

alter table sterilizer_qa_tests add column if not exists bi_prelim_read_by_id uuid references staff(id);
alter table sterilizer_qa_tests add column if not exists bi_prelim_read_by_name text;
