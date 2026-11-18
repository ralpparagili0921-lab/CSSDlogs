-- Read-only. Safe to run any time in the Supabase SQL Editor.
-- Counts the OLD-style handovers (the whole batch handled as one record, with no
-- per-item rows) that are still open. The old screens in the app can only be
-- removed once these are all finished, so this tells you whether that is safe.

-- 1. Old-style handovers by status.
select h.status, count(*) as batches
from instrument_handovers h
where not exists (select 1 from handover_items i where i.handover_id = h.id)
group by h.status
order by h.status;

-- 2. Old-style handovers that still need someone to act (not yet fully received,
--    or with a pending balance).
select h.serial_number, h.department, h.status, h.has_pending_balance, h.received_at
from instrument_handovers h
where not exists (select 1 from handover_items i where i.handover_id = h.id)
  and (h.status <> 'Received' or h.has_pending_balance)
order by h.received_at;
