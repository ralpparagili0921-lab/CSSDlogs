-- ============================================================
-- Migration: dtr_records table for the GreatDay monthly attendance
-- import — stores parsed Day Type/Status/Others Status per staff per
-- date, feeding the DTR reconciliation report. Purely additive.
-- ============================================================

create table if not exists dtr_records (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  employee_name_raw text not null,
  log_date date not null,
  day_type text,
  status text,
  others_status text,
  is_holiday boolean not null default false,
  is_present boolean not null default false,
  remark text,
  uploaded_by_id uuid references staff(id),
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_dtr_date on dtr_records (log_date);
create index if not exists idx_dtr_staff_date on dtr_records (staff_id, log_date);

alter table dtr_records enable row level security;
drop policy if exists "allow all - dtr_records" on dtr_records;
create policy "allow all - dtr_records" on dtr_records for all using (true) with check (true);
