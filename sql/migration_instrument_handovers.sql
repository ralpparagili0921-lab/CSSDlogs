-- ============================================================
-- Migration: add the Instrument Handover logbook (7th logbook,
-- merges the old separate Releasing/Receiving Google Forms).
-- Purely additive — a brand new table, nothing existing touched.
-- ============================================================

create table if not exists instrument_handovers (
  id uuid primary key default gen_random_uuid(),
  department text not null check (department in ('ER','OPD','WARD 2nd Floor','WARD 3rd Floor','Other')),
  department_other text,
  load_contents text,
  status text not null default 'Processing' check (status in ('Processing','Released')),
  received_by_id uuid references staff(id),
  received_by_name text not null,
  received_at timestamptz not null default now(),
  released_by_id uuid references staff(id),
  released_by_name text,
  released_at timestamptz,
  remarks text,
  created_at timestamptz not null default now()
);
create index if not exists idx_handovers_status on instrument_handovers (status);

alter table instrument_handovers enable row level security;
create policy "allow all - instrument_handovers" on instrument_handovers for all using (true) with check (true);
