-- ============================================================
-- Migration: adds get_server_time() — an authoritative, internet-
-- synced clock source independent of any client device's own clock,
-- which can drift or be misconfigured. The client calls this once on
-- load (and periodically) to compute an offset correction, applied
-- to every timestamp the app captures from then on.
-- ============================================================

create or replace function get_server_time()
returns timestamptz
language sql
stable
as $$ select now(); $$;
