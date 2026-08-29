// ============================================================
// TRUE TIME — an internet-synced clock, independent of whatever the
// device's own clock/timezone happens to be set to. A device's local
// clock can drift or simply be wrong, which is a real risk for a
// compliance-critical sterilization/QA log where every timestamp
// matters. This syncs against the Supabase server's own clock (via
// get_server_time()) and applies the measured offset to every
// timestamp the app captures from then on.
//
// Falls back to the device's own clock if a sync fails (e.g. genuinely
// offline) — some correction is better than none, but no correction
// shouldn't block the app from working at all, matching its existing
// offline-first design.
// ============================================================

const TrueTime = {
  _offsetMs: 0,
  _synced: false,

  async sync() {
    try {
      const requestStart = Date.now();
      const { data, error } = await supabaseClient.rpc('get_server_time');
      const requestEnd = Date.now();
      if (error) throw error;
      // Assume the server captured its timestamp at roughly the
      // midpoint of the round trip — a reasonable approximation that
      // cancels out most of the network-latency error.
      const assumedCaptureAt = (requestStart + requestEnd) / 2;
      const serverNow = new Date(data).getTime();
      this._offsetMs = serverNow - assumedCaptureAt;
      this._synced = true;
    } catch (e) {
      // Offline, or the function isn't deployed yet — fall back to the
      // device's own clock (offset 0) rather than breaking anything.
      this._synced = false;
    }
  },

  // The corrected current moment — use this anywhere a timestamp is
  // actually being captured/saved, not just for UI-only date math
  // (like "what's today's date for a query range") where a few
  // seconds/minutes of device drift genuinely doesn't matter.
  now() {
    return new Date(Date.now() + this._offsetMs);
  },

  nowISO() {
    return this.now().toISOString();
  }
};
