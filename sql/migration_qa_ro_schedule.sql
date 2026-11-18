-- ============================================================
-- Migration: configurable QA per-machine schedule day, and RO
-- frequency/day config. Purely additive. Defaults every existing
-- autoclave/flash sterilizer to Monday as a starting point — adjust
-- per machine in Admin afterward.
-- ============================================================

alter table machines add column if not exists qa_schedule_day text check (qa_schedule_day in ('Monday','Tuesday','Wednesday','Thursday','Friday'));
update machines set qa_schedule_day = 'Monday' where machine_type in ('autoclave','flash_sterilizer') and qa_schedule_day is null;

alter table app_meta add column if not exists ro_schedule_frequency text not null default 'daily' check (ro_schedule_frequency in ('daily','weekly'));
alter table app_meta add column if not exists ro_schedule_day text check (ro_schedule_day in ('Monday','Tuesday','Wednesday','Thursday','Friday'));
