-- ============================================================
-- Migration: instrument_handovers.load_contents becomes structured
-- JSONB ([{id, name, qty}, ...]) instead of free text — needed so
-- received quantity can be verified per item against what was
-- actually submitted, rather than a text blob nobody can check
-- programmatically. Any existing free-text entries are converted
-- into a single-item array (qty defaulted to 1, since the old format
-- never tracked quantity) so old records don't just disappear.
-- ============================================================

alter table instrument_handovers add column if not exists load_contents_new jsonb;

update instrument_handovers
set load_contents_new = case
  when load_contents is null or load_contents = '' then '[]'::jsonb
  else jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'name', load_contents, 'qty', 1))
end
where load_contents_new is null;

alter table instrument_handovers drop column load_contents;
alter table instrument_handovers rename column load_contents_new to load_contents;
alter table instrument_handovers alter column load_contents set not null;
alter table instrument_handovers alter column load_contents set default '[]';
