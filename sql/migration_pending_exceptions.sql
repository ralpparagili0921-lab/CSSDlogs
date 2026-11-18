-- ============================================================
-- Migration: add the pending_exceptions approval queue
-- (backlog item #6's approval workflow). Purely additive — a brand
-- new table, nothing existing is touched. Safe to run regardless of
-- launch status.
-- ============================================================

create table if not exists pending_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_type text not null check (exception_type in ('Holiday','December Break','Maintenance','Quarantine Closure','Other')),
  date_from date not null,
  date_to date not null,
  reason text,
  requested_by text not null,
  requested_by_id uuid references staff(id),
  created_at timestamptz not null default now(),
  constraint pending_valid_range check (date_to >= date_from)
);

alter table pending_exceptions enable row level security;
create policy "allow all - pending_exceptions" on pending_exceptions for all using (true) with check (true);
