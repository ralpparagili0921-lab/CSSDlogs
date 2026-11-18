-- ============================================================
-- Migration: adds has_pending_balance for the new discrepancy-
-- resolution workflow. The per-item lifecycle fields (received_qty,
-- verify_remarks, cssd_action, final_status, etc.) live inside the
-- existing load_contents JSONB and need no schema change — they're
-- simply absent on older rows until that item goes through
-- verification.
-- ============================================================

alter table instrument_handovers add column if not exists has_pending_balance boolean not null default false;
