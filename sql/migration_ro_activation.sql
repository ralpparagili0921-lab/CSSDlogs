-- ============================================================
-- Migration: adds ro_monitoring_activated to app_meta — the RO
-- monitoring kit hasn't been purchased/received yet, so the scheduled
-- RO alarm should stay off until a superuser explicitly activates it
-- once the kit arrives. Default false. Doesn't affect the ability to
-- log RO entries manually, only the scheduled alarm.
-- ============================================================

alter table app_meta add column if not exists ro_monitoring_activated boolean not null default false;
