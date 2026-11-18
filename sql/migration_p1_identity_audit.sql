-- ============================================================
-- Migration: P1 identity + audit module (safe to re-run).
--
-- 1. audit_log — append-only record of who did each sensitive
--    ADMIN action (staff/PIN/role changes, data wipes and purges,
--    schedule exceptions, DTR imports). A trigger blocks UPDATE and
--    DELETE on it, so entries cannot be quietly edited or removed
--    through the app or the API. (Dropping the trigger from the SQL
--    Editor is the deliberate, visible way to clear test rows.)
--
-- 2. sterilization_cycles — adds the 'Aborted' status plus
--    aborted_at / aborted_by / aborted_by_id / abort_reason. An
--    aborted cycle is now KEPT as a record (with who and why) instead
--    of being deleted. Its cycle number is not reused.
--
-- 3. sterilization_cycles — records who COMMITTED the load details
--    (committed_at / committed_by / committed_by_id) and keeps a
--    load_edit_history of any later back-edits (what it said before,
--    who changed it, when).
--
-- Run this in the Supabase SQL Editor AFTER uploading the new app
-- code. Everything uses IF NOT EXISTS / DROP IF EXISTS, so running
-- it twice does no harm. Do NOT re-run schema.sql instead.
-- ============================================================

-- ---------- 1. audit_log ----------
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references staff(id),
  actor_name text not null,
  action text not null,          -- e.g. 'staff.reset_pin', 'data.reset_all', 'staff.reset_pin.failed'
  target_type text,              -- e.g. 'staff', 'exception', 'dtr_import', 'data'
  target_id text,
  target_label text,             -- human-readable, e.g. the staff member's name
  reason text,                   -- required for destructive actions
  details jsonb                  -- anything else worth keeping; never PINs or security answers
);
create index if not exists idx_audit_log_created on audit_log (created_at desc);
create index if not exists idx_audit_log_action on audit_log (action);

alter table audit_log enable row level security;
drop policy if exists "allow all - audit_log" on audit_log;
create policy "allow all - audit_log" on audit_log for all using (true) with check (true);

create or replace function audit_log_block_changes() returns trigger as $$
begin
  raise exception 'audit_log is append-only: % is not allowed', tg_op;
end;
$$ language plpgsql;

drop trigger if exists trg_audit_log_no_update on audit_log;
create trigger trg_audit_log_no_update before update on audit_log
  for each row execute function audit_log_block_changes();

drop trigger if exists trg_audit_log_no_delete on audit_log;
create trigger trg_audit_log_no_delete before delete on audit_log
  for each row execute function audit_log_block_changes();

-- ---------- 2 + 3. sterilization_cycles ----------
alter table sterilization_cycles drop constraint if exists sterilization_cycles_status_check;
alter table sterilization_cycles add constraint sterilization_cycles_status_check
  check (status in ('Draft','In Progress','Completed','Stopped','Aborted'));

alter table sterilization_cycles add column if not exists aborted_at timestamptz;
alter table sterilization_cycles add column if not exists aborted_by text;
alter table sterilization_cycles add column if not exists aborted_by_id uuid references staff(id);
alter table sterilization_cycles add column if not exists abort_reason text;

alter table sterilization_cycles add column if not exists committed_at timestamptz;
alter table sterilization_cycles add column if not exists committed_by text;
alter table sterilization_cycles add column if not exists committed_by_id uuid references staff(id);
alter table sterilization_cycles add column if not exists load_edit_history jsonb;

create index if not exists idx_cycles_aborted_at on sterilization_cycles (aborted_at);

-- Ask PostgREST to pick up the new columns right away.
notify pgrst, 'reload schema';
