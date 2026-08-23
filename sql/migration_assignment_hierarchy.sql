-- ============================================================
-- Migration: logbook_assignments becomes a ranked hierarchy (Primary/
-- Secondary/Tertiary) instead of one assignee per logbook. Drops and
-- rebuilds with the explicit hierarchy given by the user — any
-- assignment set previously through the old single-assignee Admin UI
-- is superseded by this explicit list.
-- ============================================================

drop table if exists logbook_assignments cascade;

create table if not exists logbook_assignments (
  id uuid primary key default gen_random_uuid(),
  logbook text not null check (logbook in ('ro','equipment','cycles','qa','brush','instrument','handover','temp-humidity','housekeeping')),
  staff_id uuid references staff(id),
  priority_rank int not null default 1,
  unique (logbook, priority_rank)
);

insert into logbook_assignments (logbook, staff_id, priority_rank)
  select 'ro', id, 1 from staff where name = 'Joshua Mabilang'
  union all select 'ro', id, 2 from staff where name = 'Anthony Canales'
  union all select 'ro', id, 3 from staff where name = 'John Guiapar'
  union all select 'equipment', id, 1 from staff where name = 'Anthony Canales'
  union all select 'equipment', id, 2 from staff where name = 'John Guiapar'
  union all select 'equipment', id, 3 from staff where name = 'Joshua Mabilang'
  union all select 'cycles', id, 1 from staff where name = 'Anthony Canales'
  union all select 'cycles', id, 2 from staff where name = 'Joshua Mabilang'
  union all select 'cycles', id, 3 from staff where name = 'John Guiapar'
  union all select 'qa', id, 1 from staff where name = 'Anthony Canales'
  union all select 'qa', id, 2 from staff where name = 'John Guiapar'
  union all select 'qa', id, 3 from staff where name = 'Joshua Mabilang'
  union all select 'brush', id, 1 from staff where name = 'John Guiapar'
  union all select 'brush', id, 2 from staff where name = 'Joshua Mabilang'
  union all select 'brush', id, 3 from staff where name = 'Anthony Canales'
on conflict do nothing;

alter table logbook_assignments enable row level security;
drop policy if exists "allow all - logbook_assignments" on logbook_assignments;
create policy "allow all - logbook_assignments" on logbook_assignments for all using (true) with check (true);
