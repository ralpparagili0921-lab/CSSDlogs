-- ============================================================
-- Migration: add the Temperature & Humidity Log (8th logbook).
-- Purely additive — two brand new tables, nothing existing touched.
-- ============================================================

create table if not exists temp_humidity_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  temp_min numeric not null default 20,
  temp_max numeric not null default 24,
  humidity_min numeric not null default 20,
  humidity_max numeric not null default 60,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into temp_humidity_locations (name, sort_order) values
  ('Disinfection / Packing / Autoclave Area', 1),
  ('Sterile Instrument / Packs Storage', 2)
on conflict do nothing;

create table if not exists temp_humidity_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references temp_humidity_locations(id),
  location_name text not null,
  log_date date not null default current_date,
  log_time time not null default current_time,
  temperature_c numeric not null,
  humidity_pct numeric not null,
  temp_pass boolean not null,
  humidity_pass boolean not null,
  remarks text,
  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_temp_humidity_date on temp_humidity_logs (log_date);

alter table temp_humidity_locations enable row level security;
alter table temp_humidity_logs enable row level security;
create policy "allow all - temp_humidity_locations" on temp_humidity_locations for all using (true) with check (true);
create policy "allow all - temp_humidity_logs" on temp_humidity_logs for all using (true) with check (true);
