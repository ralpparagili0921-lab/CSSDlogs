-- ============================================================
-- Migration: adds error_reports for the new error-monitoring engine —
-- captures both truly-uncaught JS errors and explicit user reports
-- from the "Report to Superuser" popup. Purely additive.
-- ============================================================

create table if not exists error_reports (
  id uuid primary key default gen_random_uuid(),
  error_message text not null,
  error_stack text,
  view_context text,
  staff_id uuid references staff(id),
  staff_name text,
  user_agent text,
  status text not null default 'New' check (status in ('New', 'Reviewed', 'Resolved')),
  admin_notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_error_reports_status on error_reports (status);

alter table error_reports enable row level security;
drop policy if exists "allow all - error_reports" on error_reports;
create policy "allow all - error_reports" on error_reports for all using (true) with check (true);
