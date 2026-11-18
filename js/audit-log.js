// ============================================================
// AUDIT LOG — append-only record of who did each sensitive ADMIN
// action (staff/PIN/role changes, data wipes and purges, schedule
// exceptions, DTR imports). Logbook entries keep their own per-record
// "who" columns; this covers the actions that have no record of their
// own to hang a name on.
//
// Pairs with IdentityConfirm: every gated action asks a superuser to
// pick their name and enter their own PIN, then records that confirmed
// person here — NOT whoever happens to be logged in on the shared
// device. The row is written BEFORE the action runs, so if the audit
// table is unreachable the action is simply not performed (fail
// closed). If the action itself then fails, a second "<action>.failed"
// row is added so the trail never claims something happened that
// didn't. Never put PINs or security answers in `details`.
// ============================================================

const AuditLog = {
  // who = {id, name} from IdentityConfirm. info = {action, targetType,
  // targetId, targetLabel, reason, details}.
  async record(who, info) {
    await DB.addAuditLog({
      actor_id: who.id,
      actor_name: who.name,
      action: info.action,
      target_type: info.targetType || null,
      target_id: info.targetId != null ? String(info.targetId) : null,
      target_label: info.targetLabel || null,
      reason: info.reason || null,
      details: info.details || null
    });
  },

  // Record intent, run fn(), and add a ".failed" row if fn() throws.
  async run(who, info, fn) {
    try {
      await this.record(who, info);
    } catch (e) {
      throw new Error('Could not write the audit entry, so nothing was changed (' + e.message + ')');
    }
    try {
      return await fn();
    } catch (e) {
      try {
        await this.record(who, { ...info, action: info.action + '.failed', details: { ...(info.details || {}), error: e.message } });
      } catch (_) { /* best-effort — the original error is what matters */ }
      throw e;
    }
  },

  // The one-call wrapper admin code uses:
  //   const r = await AuditLog.superuserAction('Reset PIN', {action:'staff.reset_pin', ...}, () => DB.resetStaffPin(id));
  //   if (!r) return;           // cancelled at the PIN prompt
  //   if (!r.ok) return;        // failure toast already shown
  // IMPORTANT: close any open modal BEFORE calling this (bug pattern #17 —
  // one modal at a time), and read every form value you need first.
  async superuserAction(label, info, fn) {
    const who = await IdentityConfirm.confirm(label, { requireRole: 'superuser' });
    if (!who) return null;
    try {
      const result = await this.run(who, info, () => fn(who));
      return { ok: true, result, who };
    } catch (e) {
      UI.toast('Failed: ' + e.message, true);
      return { ok: false, error: e, who };
    }
  }
};
