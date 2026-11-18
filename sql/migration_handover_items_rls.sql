-- ============================================================
-- Migration: fixes a genuine oversight — handover_items was created
-- without Row Level Security, unlike every other table in this app
-- (including its own parent, instrument_handovers). This app handles
-- access control at the application layer (the PIN-login system),
-- not via database-level RLS restrictions, so every other table uses
-- RLS enabled + a single permissive "allow all" policy — this brings
-- handover_items in line with that same, established pattern.
-- ============================================================

alter table handover_items enable row level security;
drop policy if exists "allow all - handover_items" on handover_items;
create policy "allow all - handover_items" on handover_items for all using (true) with check (true);
