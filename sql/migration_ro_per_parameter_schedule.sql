-- ============================================================
-- Migration: RO Water Quality gets a per-parameter schedule instead
-- of one setting for all of RO — matches AAMI ST108 Annex G, where
-- conductivity is daily but pH/hardness/alkalinity are quarterly and
-- HPC/endotoxin are monthly. Fully superuser-editable afterward;
-- nothing about frequency is hardcoded in app logic, this is just the
-- starting seed.
--
-- If you already ran migration_qa_ro_schedule.sql from last session,
-- this drops those now-superseded app_meta columns. If you didn't,
-- the drops are harmless no-ops.
-- ============================================================

alter table app_meta drop column if exists ro_schedule_frequency;
alter table app_meta drop column if exists ro_schedule_day;

alter table ro_parameters add column if not exists schedule_frequency text not null default 'daily' check (schedule_frequency in ('daily','weekly','monthly','quarterly'));
alter table ro_parameters add column if not exists schedule_day text check (schedule_day in ('Monday','Tuesday','Wednesday','Thursday','Friday'));

update ro_parameters set schedule_frequency = 'daily' where name in ('Conductivity', 'TDS');
update ro_parameters set schedule_frequency = 'quarterly' where name in ('pH', 'Hardness', 'Chlorides', 'Silicates');
update ro_parameters set schedule_frequency = 'monthly' where name in ('Bacteria (HPC)', 'Endotoxins');
