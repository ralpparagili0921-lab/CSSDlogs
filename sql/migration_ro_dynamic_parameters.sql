-- ============================================================
-- Migration: RO Water Quality becomes a dynamic, admin-configurable
-- parameter system (ro_parameters catalog, need-to-basis activation)
-- plus a ro_testers device catalog. Replaces the old fixed-column
-- ro_water_quality/ro_thresholds design.
--
-- Per the app's pre-launch status confirmed earlier in this build,
-- this drops and recreates ro_water_quality and ro_thresholds rather
-- than attempting an in-place conversion of old fixed-column readings
-- into the new JSONB shape. If you've since started logging real RO
-- data, stop and ask for a data-preserving version instead.
-- ============================================================

drop table if exists ro_water_quality cascade;
drop table if exists ro_thresholds cascade;

create table if not exists ro_parameters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text,
  limit_min numeric,
  limit_max numeric,
  reference_note text,
  standard_reference text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into ro_parameters (name, unit, limit_min, limit_max, reference_note, standard_reference, active, sort_order) values
  ('Conductivity', 'µS/cm', null, 5, '< 5 µS/cm (Steam / High Purity), < 30 µS/cm (Washer Rinse) — using the stricter Steam/High Purity limit', 'ANSI/AAMI ST108 / ISO 15883', true, 1),
  ('TDS', 'ppm', null, 10, null, null, true, 2),
  ('pH', null, 5.0, 7.5, null, 'ANSI/AAMI ST108 / ISO 15883', true, 3),
  ('Hardness', 'mg/L', null, 2, null, 'ANSI/AAMI ST108 / ISO 15883', false, 4),
  ('Chlorides', 'mg/L', null, 0.5, null, 'ANSI/AAMI ST108 / ISO 15883', false, 5),
  ('Silicates', 'mg/L', null, 1.0, null, 'ANSI/AAMI ST108 / ISO 15883', false, 6),
  ('Bacteria (HPC)', 'CFU/mL', null, 10, null, 'ANSI/AAMI ST108 / ISO 15883', false, 7),
  ('Endotoxins', 'EU/mL', null, 0.25, null, 'ANSI/AAMI ST108 / ISO 15883', false, 8)
on conflict do nothing;

create table if not exists ro_testers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model text,
  make text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists ro_water_quality (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  log_time time not null default current_time,
  tester_id uuid references ro_testers(id),
  tester_name text,
  readings jsonb not null default '[]',
  remarks text,
  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ro_date on ro_water_quality (log_date);

alter table ro_parameters enable row level security;
alter table ro_testers enable row level security;
alter table ro_water_quality enable row level security;
create policy "allow all - ro_parameters" on ro_parameters for all using (true) with check (true);
create policy "allow all - ro_testers" on ro_testers for all using (true) with check (true);
create policy "allow all - ro_water_quality" on ro_water_quality for all using (true) with check (true);
