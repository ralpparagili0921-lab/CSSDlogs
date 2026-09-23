-- ============================================================
-- Migration: final piece of the app-wide Identity Confirm rollout —
-- the old Handover batch-level system's remaining recording points
-- (intake confirm, Notify Department, Mark Released) plus the
-- newly-per-item system's own "Mark Ready for Release" button, all
-- of which were still using Auth.currentStaff directly. Only one
-- genuinely new column needed — the other actions already had proper
-- id/name columns (released_by_id/name, ready_for_release_by_id/name)
-- and only needed the JS-level swap, not a schema change.
--
-- Verify Remaining (department portal) also got a real fix — it had
-- NO identity capture or even PIN confirmation at all before this,
-- unlike Verify Received which already re-validates the department
-- session's own PIN. Its identity is recorded per-item inside the
-- existing load_contents JSONB (remaining_verified_by_id/name), so
-- no schema change was needed for that one either.
-- ============================================================

alter table instrument_handovers add column if not exists intake_discrepancy_notified_by_id uuid references staff(id);
