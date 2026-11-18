-- ============================================================
-- Security stage 1, step C: wipe the old plaintext PINs and answers.
-- IRREVERSIBLE. Run only after step B has been live and trouble-free for a
-- few days, and every device has loaded the new app version.
-- After this, the only copies of PINs are the bcrypt hashes, so nobody (not
-- even a database export) can read a PIN back. A forgotten PIN is fixed by a
-- superuser reset, as before.
-- ============================================================
update app_meta set plaintext_pins_retired = true where id = 1;
update staff set pin = null, security_answer_1 = null, security_answer_2 = null
  where pin is not null or security_answer_1 is not null or security_answer_2 is not null;
notify pgrst, 'reload schema';
