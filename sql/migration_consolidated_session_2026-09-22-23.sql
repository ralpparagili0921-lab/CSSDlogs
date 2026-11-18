-- ============================================================
-- CONSOLIDATED MIGRATION — everything from this session's work,
-- combined into one file for convenience. Safe to run even if some
-- of it was already applied — every statement uses IF NOT EXISTS,
-- so anything already present is silently skipped, not re-applied
-- or duplicated.
--
-- Covers, in order:
--   1. Handover per-item tracking (handover_items table + Submission
--      pathway columns)
--   2. Handover per-item Release pathway columns
--   3. Equipment Downtime — Identity Confirm rollout
--   4. Cycle Log — Identity Confirm rollout (+ QA Testing's shared
--      BI-result columns, since Cycle Log's BI flow uses the same
--      sterilizer_qa_tests table)
--   5. QA Testing — Identity Confirm rollout (BI preliminary read)
--   6. RO Water Quality — Identity Confirm rollout
--   7. Handover (old batch-level system) — Identity Confirm rollout,
--      final piece
-- ============================================================


-- ---------- 1. Handover per-item tracking (Submission pathway) ----------
-- handover_items — per-item-line tracking for Instrument/Supplies
-- Handover, replacing batch-only granularity for new submissions
-- going forward. instrument_handovers stays the "batch" record
-- (reference number, department, shared context); each distinct item
-- line submitted against that reference gets its own row here,
-- independently traceable.
--
-- Nothing here is ever inserted until BOTH the department staffer's
-- and a CSSD staffer's PIN confirmations are met for that specific
-- item — by design, there is no "pending" or half-confirmed row.
-- Both confirmation columns reference `staff` because department
-- accounts and CSSD staff are the same table (distinguished by
-- staff.role), not two separate tables.
create table if not exists handover_items (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references instrument_handovers(id),
  item_name text not null,
  qty integer not null check (qty > 0),
  dept_submit_confirmed_by_id uuid references staff(id),
  dept_submit_confirmed_by_name text,
  dept_submit_confirmed_at timestamptz,
  cssd_submit_confirmed_by_id uuid references staff(id),
  cssd_submit_confirmed_by_name text,
  cssd_submit_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_handover_items_handover on handover_items (handover_id);


-- ---------- 2. Handover per-item Release pathway ----------
-- CSSD marks each item ready once sterilization is actually done;
-- only then do the two Release PIN buttons appear on the department
-- portal. Department confirms first (recording any discrepancy
-- live), then CSSD's own PIN step — shown the discrepancy, if any —
-- is their affirmation of it.
alter table handover_items add column if not exists ready_for_release_by_id uuid references staff(id);
alter table handover_items add column if not exists ready_for_release_by_name text;
alter table handover_items add column if not exists ready_for_release_at timestamptz;
alter table handover_items add column if not exists dept_release_confirmed_by_id uuid references staff(id);
alter table handover_items add column if not exists dept_release_confirmed_by_name text;
alter table handover_items add column if not exists dept_release_confirmed_at timestamptz;
alter table handover_items add column if not exists cssd_release_confirmed_by_id uuid references staff(id);
alter table handover_items add column if not exists cssd_release_confirmed_by_name text;
alter table handover_items add column if not exists cssd_release_confirmed_at timestamptz;
alter table handover_items add column if not exists has_discrepancy boolean not null default false;
alter table handover_items add column if not exists received_qty integer;


-- ---------- 3. Equipment Downtime — Identity Confirm ----------
-- The existing staff_id/staff_name pair only ever captures whoever
-- logged the ORIGINAL incident, not who confirmed biomed's response
-- or who actually resolved it.
alter table equipment_downtime add column if not exists biomed_response_confirmed_by_id uuid references staff(id);
alter table equipment_downtime add column if not exists biomed_response_confirmed_by_name text;
alter table equipment_downtime add column if not exists resolved_by_id uuid references staff(id);
alter table equipment_downtime add column if not exists resolved_by_name text;


-- ---------- 4. Cycle Log — Identity Confirm ----------
-- sterilization_cycles already has several free-text "who did this"
-- fields (operator_start, stopped_by, operator_end,
-- alarm_acknowledged_by) with no matching id column — these add the
-- id companions. operator_end existed in the schema already but was
-- never actually written to by any code — now wired up.
-- timeline_confirmed_by is new: the 4 guided-timeline steps (Flush,
-- Drying, Open Hatch, Cool Down) share one function and had no
-- identity field at all — one JSONB column rather than 8 separate
-- id/name columns, keyed by step name.
-- BI's result-save step (shared with QA Testing's own BI flow, since
-- both use sterilizer_qa_tests) also gets its own read_by pair,
-- distinct from staff_id/staff_name (which Initiate already uses).
alter table sterilization_cycles add column if not exists operator_start_id uuid references staff(id);
alter table sterilization_cycles add column if not exists stopped_by_id uuid references staff(id);
alter table sterilization_cycles add column if not exists operator_end_id uuid references staff(id);
alter table sterilization_cycles add column if not exists timeline_confirmed_by jsonb;

alter table sterilizer_qa_tests add column if not exists bi_read_by_id uuid references staff(id);
alter table sterilizer_qa_tests add column if not exists bi_read_by_name text;


-- ---------- 5. QA Testing — Identity Confirm (BI preliminary read) ----------
-- The only remaining recording point on sterilizer_qa_tests without
-- an identity column (bi_read_by_id/name for the FULL result was
-- already added above, since Cycle Log's BI flow shares this table).
alter table sterilizer_qa_tests add column if not exists bi_prelim_read_by_id uuid references staff(id);
alter table sterilizer_qa_tests add column if not exists bi_prelim_read_by_name text;


-- ---------- 6. RO Water Quality — Identity Confirm ----------
-- Activating monitoring (a singleton app_meta row) and adding a
-- tester had no identity capture at all. Save entry already had
-- staff_id/staff_name and needed no schema change.
alter table app_meta add column if not exists ro_monitoring_activated_by_id uuid references staff(id);
alter table app_meta add column if not exists ro_monitoring_activated_by_name text;
alter table ro_testers add column if not exists added_by_id uuid references staff(id);
alter table ro_testers add column if not exists added_by_name text;


-- ---------- 7. Handover (old batch-level system) — Identity Confirm, final piece ----------
-- The old Handover batch-level system's remaining recording points
-- (intake confirm, Notify Department, Mark Released) plus the
-- per-item system's own "Mark Ready for Release" button were still
-- using Auth.currentStaff directly. Only one genuinely new column
-- needed — everything else already had proper id/name columns and
-- only needed a JS-level swap, not a schema change.
-- Verify Remaining (department portal) also got a real fix — its
-- identity is recorded per-item inside the existing load_contents
-- JSONB (remaining_verified_by_id/name), so no schema change was
-- needed for that one either.
alter table instrument_handovers add column if not exists intake_discrepancy_notified_by_id uuid references staff(id);
