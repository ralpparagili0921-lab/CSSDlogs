-- ============================================================
-- Migration: adds intake-verification fields to instrument_handovers.
-- Before this, CSSD's "Processing" state and "actually physically
-- confirmed receipt" were the same moment — this splits them apart.
-- Per-item intake_qty/intake_remarks live inside the existing
-- load_contents JSONB (no schema change needed for those, same
-- pattern as the later received_qty/verify_remarks fields already
-- documented in that column's own comment).
-- ============================================================

alter table instrument_handovers add column if not exists intake_verified_at timestamptz;
alter table instrument_handovers add column if not exists intake_verified_by_id uuid references staff(id);
alter table instrument_handovers add column if not exists intake_verified_by_name text;
alter table instrument_handovers add column if not exists has_intake_discrepancy boolean not null default false;
alter table instrument_handovers add column if not exists intake_discrepancy_notified_at timestamptz;
alter table instrument_handovers add column if not exists intake_discrepancy_notified_by_name text;

create index if not exists idx_handovers_intake_verified on instrument_handovers (intake_verified_at);
