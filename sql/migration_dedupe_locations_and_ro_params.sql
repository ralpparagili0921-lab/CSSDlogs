-- ============================================================
-- Migration: same missing-unique-constraint bug that caused
-- duplicate staff also affected temp_humidity_locations (the actual
-- cause of "repeated areas" in the Trend chart dropdown) and
-- ro_parameters. Fixes both, the same way as staff.
--
-- temp_humidity_locations needs extra care: temp_humidity_logs has a
-- REAL foreign key to it (location_id), so duplicates can't just be
-- deleted — any existing readings logged against a "loser" duplicate
-- are re-pointed to the surviving row first, so no history is lost
-- and the foreign key never breaks.
-- ============================================================

-- ---------- temp_humidity_locations ----------
with ranked as (
  select id, name,
    row_number() over (
      partition by name
      order by (select count(*) from temp_humidity_logs l where l.location_id = temp_humidity_locations.id) desc, created_at asc
    ) as rn
  from temp_humidity_locations
),
winners as (select name, id as winner_id from ranked where rn = 1),
losers as (select r.id as loser_id, w.winner_id from ranked r join winners w using (name) where r.rn > 1)
update temp_humidity_logs
set location_id = losers.winner_id
from losers
where temp_humidity_logs.location_id = losers.loser_id;

delete from temp_humidity_locations a
using temp_humidity_locations b
where a.name = b.name
  and a.id <> b.id
  and not exists (select 1 from temp_humidity_logs l where l.location_id = a.id)
  and (
    exists (select 1 from temp_humidity_logs l where l.location_id = b.id)
    or b.created_at < a.created_at
  );

alter table temp_humidity_locations add constraint temp_humidity_locations_name_unique unique (name);

-- ---------- ro_parameters ----------
-- No real foreign key here (RO readings store parameter_id inside a
-- JSONB array, not a DB-enforced reference) — simpler cleanup is safe.
-- If this app already has real RO history logged against a duplicate
-- that gets removed here, those specific historical readings may no
-- longer match an active parameter row. Given the app's still
-- pre-launch, this is expected to be a non-issue in practice.
delete from ro_parameters a
using ro_parameters b
where a.name = b.name
  and a.id <> b.id
  and b.created_at < a.created_at;

alter table ro_parameters add constraint ro_parameters_name_unique unique (name);
