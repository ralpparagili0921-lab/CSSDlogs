-- ============================================================
-- Corrected migration for class1_tape_changed. The original
-- migration assumed this column was still a boolean and tried to
-- convert it with IS TRUE/IS FALSE — but it turns out the column is
-- already text (confirmed by the exact error that came back: "IS
-- TRUE must be type boolean, not type text"), just still holding the
-- literal leftover strings 'true'/'false' from an earlier, incomplete
-- conversion rather than the proper 'Yes'/'No' values the app now
-- expects.
--
-- This is a plain data UPDATE instead of a type conversion — safe to
-- run more than once, since it only touches rows that still hold an
-- old-style value, and leaves anything already correct untouched.
-- ============================================================

update sterilization_cycles
set class1_tape_changed = case
  when class1_tape_changed = 'true' then 'Yes'
  when class1_tape_changed = 'false' then 'No'
  else class1_tape_changed  -- already 'Yes' / 'No' / 'Cannot Be Determined' / null — leave as-is
end
where class1_tape_changed in ('true', 'false');

alter table sterilization_cycles
  add column if not exists class1_tape_failed_packs text;

-- Verification — run this after the above to confirm: you should see
-- only Yes / No / Cannot Be Determined / null in the results, no
-- lowercase 'true' or 'false' remaining.
select class1_tape_changed, count(*) from sterilization_cycles group by class1_tape_changed;
