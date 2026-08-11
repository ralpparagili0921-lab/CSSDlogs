-- ============================================================
-- Migration: BI early-read flag (24-hour safeguard) and Cycle Log
-- orthopedic-implant flag (ties to the mandatory-BI policy). Purely
-- additive.
-- ============================================================

alter table sterilizer_qa_tests add column if not exists bi_early_read boolean not null default false;
alter table sterilization_cycles add column if not exists includes_implants boolean not null default false;
