-- ============================================================
-- Migration: add Bowie-Dick drying time (found missing when
-- reconciling against the real paper/Google Forms). Purely additive.
-- ============================================================

alter table sterilizer_qa_tests add column if not exists bd_drying_time text;
