-- ============================================================
-- Migration: add whole-set/tray entry mode to Instrument Maintenance
-- (backlog item #5). Purely additive — safe to run even with real
-- data already logged; every existing row is treated as 'individual'
-- mode (the only mode that existed before) and keeps working as-is.
-- ============================================================

alter table instrument_maintenance
  add column if not exists entry_mode text not null default 'individual' check (entry_mode in ('individual','set'));
alter table instrument_maintenance
  add column if not exists set_tray_name text;
alter table instrument_maintenance
  add column if not exists item_count integer;

-- instrument_name was required before; 'set' mode entries won't have one.
alter table instrument_maintenance
  alter column instrument_name drop not null;

-- Enforce the right fields per mode from here on (existing rows are all
-- 'individual' with instrument_name already set, so this passes cleanly).
alter table instrument_maintenance
  add constraint instrument_maintenance_mode_fields check (
    (entry_mode = 'individual' and instrument_name is not null) or
    (entry_mode = 'set' and set_tray_name is not null and item_count is not null)
  );
