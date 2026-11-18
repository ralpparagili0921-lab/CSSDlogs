-- Puts the staff table back the way it was before migration_security_1b_lockdown.sql.
-- Use this if login or PIN changes misbehave after step B and you need the app working again right now.
grant select, insert, update on staff to anon;
notify pgrst, 'reload schema';
