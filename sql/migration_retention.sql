-- ============================================================
-- Migration: add configurable data retention (backlog item #9).
-- Purely additive — one new column with a default, nothing existing
-- is touched. Safe to run regardless of launch status.
-- ============================================================

alter table app_meta
  add column if not exists retention_years integer not null default 3;
