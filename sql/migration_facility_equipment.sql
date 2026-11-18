-- ============================================================
-- Migration: widen machine_type to include facility equipment, and
-- add the new equipment to track under Equipment Downtime — Aircon
-- units, Ultrasonic machine, BI Incubator, Sealer Pouch machines
-- (Manual + Conveyor), Water Pump, Water Tank. These are separate
-- from RO-01 (the RO system itself), not sub-components of it.
-- Purely additive — no existing rows touched.
-- ============================================================

alter table machines drop constraint if exists machines_machine_type_check;
alter table machines add constraint machines_machine_type_check
  check (machine_type in ('autoclave','ro','flash_sterilizer','facility_equipment'));

insert into machines (machine_id, label, machine_type, scheduled_hours_per_day, applicable_tests, qa_schedule_day) values
  ('AIRCON-01', 'Aircon Unit #1 (Autoclave Area)', 'facility_equipment', 24, '{}', null),
  ('AIRCON-02', 'Aircon Unit #2 (Sterile Instrument/Packs Storage)', 'facility_equipment', 24, '{}', null),
  ('US-01', 'Ultrasonic Machine', 'facility_equipment', 24, '{}', null),
  ('BI-INC-01', 'BI Incubator', 'facility_equipment', 24, '{}', null),
  ('SEALER-M-01', 'Sealer Pouch Machine (Manual)', 'facility_equipment', 24, '{}', null),
  ('SEALER-C-01', 'Sealer Pouch Machine (Conveyor)', 'facility_equipment', 24, '{}', null),
  ('PUMP-01', 'Water Pump', 'facility_equipment', 24, '{}', null),
  ('TANK-01', 'Water Tank', 'facility_equipment', 24, '{}', null)
on conflict do nothing;
