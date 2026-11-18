-- ============================================================
-- Security stage 1, step A: PIN hashing + server-side PIN checks.
-- SAFE AND ADDITIVE: nothing is removed, nothing the app does today stops
-- working. Safe to re-run. Run it in the Supabase SQL Editor.
--
-- What it adds
--   * pin_hash / security answer hashes (bcrypt) next to the existing columns,
--     back-filled from the current PINs and answers, and kept in step by a
--     trigger whenever the old plaintext columns are written.
--   * Functions the app calls instead of comparing PINs in the browser:
--       verify_staff_pin, verify_security_answers, set_pin_with_pin,
--       set_pin_with_answers, admin_reset_pin, create_staff_account
--     After 5 wrong PINs for a person the account locks for 5 minutes.
--
-- What it does NOT do yet: the old plaintext PIN columns are still readable.
-- That is closed by step B (migration_security_1b_lockdown.sql). Do step B
-- only after you have checked login, PIN change and PIN reset still work
-- with this step in place (see the checklist in the delivery notes).
-- ============================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;   -- so crypt() / gen_salt() are found whichever schema pgcrypto lives in

alter table staff add column if not exists pin_hash text;
alter table staff add column if not exists security_answer_1_hash text;
alter table staff add column if not exists security_answer_2_hash text;
alter table staff add column if not exists pin_failed_attempts int not null default 0;
alter table staff add column if not exists pin_locked_until timestamptz;

-- The plaintext PIN column must be allowed to become empty later (step C).
alter table staff alter column pin drop not null;

-- Set to true by step C once the old plaintext PINs/answers have been wiped.
alter table app_meta add column if not exists plaintext_pins_retired boolean not null default false;
create or replace function staff_plaintext_retired() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plaintext_pins_retired from app_meta where id = 1), false);
$$;
revoke all on function staff_plaintext_retired() from public, anon, authenticated;

-- Keep hashes in step whenever the plaintext columns are written (this is what
-- keeps older copies of the app working while the new one rolls out).
create or replace function staff_sync_hashes() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.pin is not null and (tg_op = 'INSERT' or new.pin is distinct from old.pin) then
    new.pin_hash := crypt(new.pin, gen_salt('bf', 8));
  end if;
  if new.security_answer_1 is not null and (tg_op = 'INSERT' or new.security_answer_1 is distinct from old.security_answer_1) then
    new.security_answer_1_hash := crypt(lower(trim(new.security_answer_1)), gen_salt('bf', 8));
  end if;
  if new.security_answer_2 is not null and (tg_op = 'INSERT' or new.security_answer_2 is distinct from old.security_answer_2) then
    new.security_answer_2_hash := crypt(lower(trim(new.security_answer_2)), gen_salt('bf', 8));
  end if;
  if tg_op = 'UPDATE' and new.security_answer_1 is null and old.security_answer_1 is not null and new.security_question_1 is null then
    new.security_answer_1_hash := null;
  end if;
  if tg_op = 'UPDATE' and new.security_answer_2 is null and old.security_answer_2 is not null and new.security_question_2 is null then
    new.security_answer_2_hash := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_staff_sync_hashes on staff;
create trigger trg_staff_sync_hashes before insert or update on staff
  for each row execute function staff_sync_hashes();

-- Back-fill hashes for everyone who already has a PIN / answers.
update staff set pin_hash = crypt(pin, gen_salt('bf', 8)) where pin is not null and pin_hash is null;
update staff set security_answer_1_hash = crypt(lower(trim(security_answer_1)), gen_salt('bf', 8)) where security_answer_1 is not null and security_answer_1_hash is null;
update staff set security_answer_2_hash = crypt(lower(trim(security_answer_2)), gen_salt('bf', 8)) where security_answer_2 is not null and security_answer_2_hash is null;

-- ---------- helpers ----------
-- Records a wrong guess; locks the account for 5 minutes after the 5th in a row.
create or replace function staff_note_failure(p_id uuid) returns void
language sql security definer set search_path = public, extensions as $$
  update staff set
    pin_failed_attempts = case when pin_failed_attempts + 1 >= 5 then 0 else pin_failed_attempts + 1 end,
    pin_locked_until = case when pin_failed_attempts + 1 >= 5 then now() + interval '5 minutes' else pin_locked_until end
  where id = p_id;
$$;
create or replace function staff_note_success(p_id uuid) returns void
language sql security definer set search_path = public, extensions as $$
  update staff set pin_failed_attempts = 0, pin_locked_until = null
  where id = p_id and (pin_failed_attempts <> 0 or pin_locked_until is not null);
$$;
revoke all on function staff_note_failure(uuid), staff_note_success(uuid) from public, anon, authenticated;

-- ---------- verify a PIN ----------   returns 'ok' | 'bad' | 'locked'
create or replace function verify_staff_pin(p_staff_id uuid, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s staff%rowtype;
begin
  select * into s from staff where id = p_staff_id and active;
  if not found then return 'bad'; end if;
  if s.pin_locked_until is not null and s.pin_locked_until > now() then return 'locked'; end if;
  if s.pin_hash is not null and p_pin is not null and s.pin_hash = crypt(p_pin, s.pin_hash) then
    perform staff_note_success(s.id);
    return 'ok';
  end if;
  perform staff_note_failure(s.id);
  return 'bad';
end;
$$;

-- ---------- verify the two recovery answers ----------   'ok' | 'bad' | 'locked'
create or replace function verify_security_answers(p_staff_id uuid, p_a1 text, p_a2 text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s staff%rowtype;
begin
  select * into s from staff where id = p_staff_id and active;
  if not found then return 'bad'; end if;
  if s.pin_locked_until is not null and s.pin_locked_until > now() then return 'locked'; end if;
  if s.security_answer_1_hash is not null and s.security_answer_2_hash is not null
     and s.security_answer_1_hash = crypt(lower(trim(coalesce(p_a1, ''))), s.security_answer_1_hash)
     and s.security_answer_2_hash = crypt(lower(trim(coalesce(p_a2, ''))), s.security_answer_2_hash) then
    perform staff_note_success(s.id);
    return 'ok';
  end if;
  perform staff_note_failure(s.id);
  return 'bad';
end;
$$;

-- Internal: store a new PIN. The plaintext column is only touched while it
-- still holds a value (before step C), so older app copies keep working.
create or replace function staff_store_pin(p_id uuid, p_new_pin text, p_changed boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update staff set
    pin_hash = crypt(p_new_pin, gen_salt('bf', 8)),
    pin = case when staff_plaintext_retired() then null else p_new_pin end,
    pin_changed = p_changed,
    pin_failed_attempts = 0, pin_locked_until = null
  where id = p_id;
end;
$$;
revoke all on function staff_store_pin(uuid, text, boolean) from public, anon, authenticated;

-- ---------- a person changes their own PIN (knows the current one) ----------
create or replace function set_pin_with_pin(p_staff_id uuid, p_current_pin text, p_new_pin text,
    p_q1 text default null, p_a1 text default null, p_q2 text default null, p_a2 text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r text;
begin
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then return 'invalid'; end if;
  r := verify_staff_pin(p_staff_id, p_current_pin);
  if r <> 'ok' then return r; end if;
  perform staff_store_pin(p_staff_id, p_new_pin, true);
  if p_q1 is not null and p_a1 is not null and p_q2 is not null and p_a2 is not null then
    update staff set
      security_question_1 = p_q1, security_question_2 = p_q2,
      security_answer_1_hash = crypt(lower(trim(p_a1)), gen_salt('bf', 8)),
      security_answer_2_hash = crypt(lower(trim(p_a2)), gen_salt('bf', 8)),
      security_answer_1 = case when staff_plaintext_retired() then null else lower(trim(p_a1)) end,
      security_answer_2 = case when staff_plaintext_retired() then null else lower(trim(p_a2)) end
    where id = p_staff_id;
  end if;
  return 'ok';
end;
$$;

-- ---------- forgot PIN: set a new one after answering both questions ----------
create or replace function set_pin_with_answers(p_staff_id uuid, p_a1 text, p_a2 text, p_new_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r text;
begin
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then return 'invalid'; end if;
  r := verify_security_answers(p_staff_id, p_a1, p_a2);
  if r <> 'ok' then return r; end if;
  perform staff_store_pin(p_staff_id, p_new_pin, true);
  return 'ok';
end;
$$;

-- Internal: is this person an active superuser who just proved their PIN?
create or replace function staff_actor_is_superuser(p_actor_id uuid, p_actor_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r text;
begin
  if not exists (select 1 from staff where id = p_actor_id and active and role = 'superuser') then return 'forbidden'; end if;
  r := verify_staff_pin(p_actor_id, p_actor_pin);
  return r;   -- 'ok' | 'bad' | 'locked'
end;
$$;
revoke all on function staff_actor_is_superuser(uuid, text) from public, anon, authenticated;

-- ---------- a superuser resets someone back to the default PIN ----------
create or replace function admin_reset_pin(p_actor_id uuid, p_actor_pin text, p_target_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r text;
begin
  r := staff_actor_is_superuser(p_actor_id, p_actor_pin);
  if r <> 'ok' then return r; end if;
  perform staff_store_pin(p_target_id, '0000', false);
  update staff set
    security_question_1 = null, security_question_2 = null,
    security_answer_1 = null, security_answer_2 = null,
    security_answer_1_hash = null, security_answer_2_hash = null
  where id = p_target_id;
  return 'ok';
end;
$$;

-- ---------- create an account (starts on the default PIN) ----------
-- Department accounts may register themselves; every other role needs a
-- superuser's PIN.
create or replace function create_staff_account(
    p_name text, p_job_title text, p_role text,
    p_shift_start time default null, p_shift_end time default null,
    p_department text default null, p_department_other text default null,
    p_actor_id uuid default null, p_actor_pin text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r text; new_id uuid;
begin
  if p_role is null or p_role not in ('superuser','admin','user','department') then
    return jsonb_build_object('result', 'invalid');
  end if;
  if p_role <> 'department' then
    r := staff_actor_is_superuser(p_actor_id, p_actor_pin);
    if r <> 'ok' then return jsonb_build_object('result', r); end if;
  end if;
  insert into staff (name, job_title, role, shift_start, shift_end, department, department_other, pin, pin_hash, pin_changed, active)
  values (trim(p_name), p_job_title, p_role, p_shift_start, p_shift_end, p_department, p_department_other,
          case when staff_plaintext_retired() then null else '0000' end, crypt('0000', gen_salt('bf', 8)), false, true)
  returning id into new_id;
  return jsonb_build_object('result', 'ok', 'id', new_id);
exception when unique_violation then
  return jsonb_build_object('result', 'name_taken');
end;
$$;

grant execute on function
  verify_staff_pin(uuid, text), verify_security_answers(uuid, text, text),
  set_pin_with_pin(uuid, text, text, text, text, text, text),
  set_pin_with_answers(uuid, text, text, text), admin_reset_pin(uuid, text, uuid),
  create_staff_account(text, text, text, time, time, text, text, uuid, text)
to anon, authenticated;

notify pgrst, 'reload schema';
