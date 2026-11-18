-- ============================================================
-- Migration: handover_items — per-item-line tracking for
-- Instrument/Supplies Handover, replacing batch-only granularity for
-- new submissions going forward. instrument_handovers stays the
-- "batch" record (reference number, department, shared context);
-- each distinct item line submitted against that reference now gets
-- its own row here, independently traceable.
--
-- Nothing here is ever inserted until BOTH the department staffer's
-- and a CSSD staffer's PIN confirmations are met for that specific
-- item — by design, there is no "pending" or half-confirmed row.
-- Both confirmation columns reference `staff` because department
-- accounts and CSSD staff are the same table (distinguished by
-- staff.role), not two separate tables.
-- ============================================================

create table if not exists handover_items (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references instrument_handovers(id),
  item_name text not null,
  qty integer not null check (qty > 0),

  -- Submission dual-PIN confirmation — both required before this row
  -- can exist at all.
  dept_submit_confirmed_by_id uuid references staff(id),
  dept_submit_confirmed_by_name text,
  dept_submit_confirmed_at timestamptz,
  cssd_submit_confirmed_by_id uuid references staff(id),
  cssd_submit_confirmed_by_name text,
  cssd_submit_confirmed_at timestamptz,

  created_at timestamptz not null default now()
);
create index if not exists idx_handover_items_handover on handover_items (handover_id);
