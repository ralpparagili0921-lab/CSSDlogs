-- ============================================================
-- Security stage 1, step B: close the credential leak.
-- Run ONLY after step A is in place AND the new app files are deployed AND
-- you have checked login / PIN change / PIN reset work (see delivery notes).
-- Reversible: rollback_security_1b.sql puts everything back.
--
-- What it does
--   Takes away the public (anon) key's right to READ the PIN, the PIN hash, the
--   security answers and the lockout counters on the staff table, and to WRITE
--   them. After this, someone who opens the login page can still see names and
--   roles, but can no longer download anyone's PIN or recovery answers. PINs are
--   only checked and changed through the functions from step A.
--
-- What it does not do: other tables are still open to the public key (that is
-- the next stage: real sign-in and per-table rules). Role and active status of
-- a staff row can still be edited through the public key.
-- ============================================================

revoke select on staff from anon;
revoke insert on staff from anon;
revoke update on staff from anon;

-- What the app is still allowed to read about staff.
grant select (id, name, job_title, role, active, department, department_other,
              shift_start, shift_end, pin_changed, security_question_1, security_question_2, created_at)
  on staff to anon;

-- What it may still change directly (never credentials).
grant update (name, job_title, role, active, department, department_other, shift_start, shift_end)
  on staff to anon;

notify pgrst, 'reload schema';
