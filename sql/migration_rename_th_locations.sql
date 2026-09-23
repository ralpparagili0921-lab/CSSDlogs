-- ============================================================
-- Migration: rename the two Temp/Humidity locations to their
-- correct short names. Updates existing rows in place (preserves
-- their id, so any readings already logged against them stay
-- correctly linked) rather than delete+reinsert.
-- ============================================================

update temp_humidity_locations set name = 'Autoclave Area' where name = 'Disinfection / Packing / Autoclave Area';
update temp_humidity_locations set name = 'Sterile Storage Area' where name = 'Sterile Instrument / Packs Storage';
