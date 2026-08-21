-- ============================================================
-- Migration: fix duplicate staff records + add the missing unique
-- constraint that should have prevented them.
--
-- Root cause: staff's only unique constraint was on `id` (always a
-- fresh random UUID), so the seed data's "on conflict do nothing"
-- had nothing to actually catch — running schema.sql more than once
-- without a reset in between silently created duplicate rows with
-- the same name but different IDs. This is why staff names were
-- showing doubled on the login screen.
--
-- Cleanup strategy: for each name with duplicates, keep whichever
-- row has pin_changed = true (an already-personalized account) so
-- nobody's real PIN gets discarded; if none are personalized (or
-- more than one is, which shouldn't normally happen), keep the
-- oldest one. Everything else with that name is deleted.
-- ============================================================

delete from staff a
using staff b
where a.name = b.name
  and a.id <> b.id
  and (
    -- b wins if b is personalized and a isn't
    (b.pin_changed = true and a.pin_changed = false)
    -- otherwise the older row wins (b is older than a)
    or (a.pin_changed = b.pin_changed and b.created_at < a.created_at)
  );

alter table staff add constraint staff_name_unique unique (name);
