-- ============================================================
-- Migration: adds identity-capture columns for Equipment Downtime's
-- two recording points that currently have none at all — the
-- existing staff_id/staff_name pair only ever captures whoever
-- logged the ORIGINAL incident, not who confirmed biomed's response
-- or who actually resolved it. Part of the app-wide Identity Confirm
-- rollout — see js/identity-confirm.js.
-- ============================================================

alter table equipment_downtime add column if not exists biomed_response_confirmed_by_id uuid references staff(id);
alter table equipment_downtime add column if not exists biomed_response_confirmed_by_name text;
alter table equipment_downtime add column if not exists resolved_by_id uuid references staff(id);
alter table equipment_downtime add column if not exists resolved_by_name text;
