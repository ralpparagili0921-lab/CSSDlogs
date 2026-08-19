-- ============================================================
-- Migration: add the pre-launch gate (backlog item #12). Purely
-- additive — two new columns with defaults, nothing existing is
-- touched. Safe to run regardless of current status.
--
-- IMPORTANT: after running this, the app will show the launch gate
-- to everyone until a superuser confirms with their PIN — including
-- if you're already using the app day-to-day. If you're already live
-- and don't want the gate blocking staff, either run the UPDATE
-- below to mark it already-launched (backdated to whenever you
-- actually went live), or just have a superuser tap through the
-- gate once after deploying — either way works.
-- ============================================================

alter table app_meta add column if not exists launched boolean not null default false;
alter table app_meta add column if not exists launch_date date;

-- OPTIONAL — uncomment and set the real date if you're already live
-- and want to skip seeing the gate:
-- update app_meta set launched = true, launch_date = '2026-08-06' where id = 1;
