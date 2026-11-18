-- ============================================================
-- Migration: redesigns class1_tape_changed from a plain boolean into
-- a 3-state field ('Yes' / 'No' / 'Cannot Be Determined'), and adds
-- class1_tape_failed_packs for listing which specific packs didn't
-- color change when the answer is No or Cannot Be Determined.
--
-- Existing true/false data is preserved and converted in place
-- (true -> 'Yes', false -> 'No', null stays null) — nothing is lost.
-- ============================================================

alter table sterilization_cycles
  alter column class1_tape_changed type text
  using (case
    when class1_tape_changed is true then 'Yes'
    when class1_tape_changed is false then 'No'
    else null
  end);

alter table sterilization_cycles
  add column if not exists class1_tape_failed_packs text;
