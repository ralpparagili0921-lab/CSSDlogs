-- ============================================================
-- Migration: Instrument Maintenance becomes a proper Out/Returned
-- lifecycle (one row per trip), matching Equipment Downtime/Cycle
-- Log/Handover — instead of "action" mixing sending-out and
-- returning options as separate, unlinked rows. This also unlocks
-- real turnaround-time tracking (start/finish were previously
-- unlinked entries, impossible to compute a duration from).
--
-- Per the app's pre-launch status, this drops and recreates the
-- action column's constraint (can't be done purely additively since
-- the allowed values are narrowing) rather than attempting to infer
-- which old "Finished X" rows pair with which "For X" rows. If
-- you've since started logging real Instrument Maintenance data,
-- stop and ask for a data-preserving version instead.
-- ============================================================

alter table instrument_maintenance rename column action to action_out;
alter table instrument_maintenance drop constraint if exists instrument_maintenance_action_check;
delete from instrument_maintenance where action_out like 'Finished%';  -- these become 'Returned' status on the trip they belong to, not their own rows — can't be reliably paired after the fact, so cleared rather than left orphaned (pre-launch, safe)
alter table instrument_maintenance add constraint instrument_maintenance_action_out_check
  check (action_out in ('For Physical / Functional Repair','For Rust Removal Soaking','For Ultrasonic Cleaning','For Lubrication','Other'));

alter table instrument_maintenance add column if not exists status text not null default 'Out' check (status in ('Out','Returned'));
alter table instrument_maintenance add column if not exists returned_at timestamptz;
alter table instrument_maintenance add column if not exists returned_by_id uuid references staff(id);
alter table instrument_maintenance add column if not exists returned_by_name text;
alter table instrument_maintenance add column if not exists return_notes text;
