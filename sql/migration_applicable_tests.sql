-- ============================================================
-- Migration: add machine-level QA test configuration
-- Safe to run on an already-deployed database with real data —
-- this only adds a column, it doesn't touch any existing rows.
-- Run once in Supabase SQL Editor, then re-upload the app files.
-- ============================================================

alter table machines
  add column if not exists applicable_tests text[] not null default '{Bowie-Dick,BI,Dummy}';

-- RO-01 isn't a sterilizer, so it gets no applicable tests.
-- Autoclaves/flash sterilizer keep the safe default above — go into
-- Admin → Machines afterward and confirm/adjust per real machine
-- (e.g. if AC-03 or FS-01 isn't a pre-vacuum cycle, uncheck Bowie-Dick
-- for it there).
update machines set applicable_tests = '{}' where machine_type = 'ro';
