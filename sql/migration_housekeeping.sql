-- ============================================================
-- Migration: add the CSSD Housekeeping Log (9th logbook). Purely
-- additive — a brand new table, nothing existing touched.
-- ============================================================

create table if not exists housekeeping_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  cleaning_type text not null check (cleaning_type in (
    'Daily/Routine Cleaning','Terminal Cleaning','Between Cases',
    'Floor Scrubbing only','Floor Scrubbing with Routine Cleaning','Floor Scrubbing with Terminal Cleaning',
    'After Maintenance Repairs','After Major Repairs','Other'
  )),
  cleaning_type_other text,
  tasks jsonb not null default '[]',
  sterilization_equipment jsonb not null default '[]',
  post_cleaning_tasks jsonb not null default '[]',
  has_terminal_cleaning boolean not null default false,
  terminal_cleaning_tasks jsonb,
  terminal_cleaning_completed_by text,
  inspected_by text,
  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_housekeeping_date on housekeeping_logs (log_date);

alter table housekeeping_logs enable row level security;
create policy "allow all - housekeeping_logs" on housekeeping_logs for all using (true) with check (true);
