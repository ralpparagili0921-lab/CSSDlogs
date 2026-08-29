-- ============================================================
-- Migration: link BI tests to the specific cycle they verify —
-- lets a completed cycle track "BI verification pending" against
-- the exact test, not just any BI test for that machine. Purely
-- additive.
-- ============================================================

alter table sterilizer_qa_tests add column if not exists cycle_id uuid references sterilization_cycles(id);
