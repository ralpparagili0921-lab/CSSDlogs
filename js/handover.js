// ============================================================
// INSTRUMENT HANDOVER — 7th logbook, CSSD staff side. Submission
// (intake) now happens exclusively through the public, no-login
// portal on the login screen (js/handover-submit-portal.js) — that's
// how ER/OPD/OR/Ward staff submit items. CSSD staff, once logged in,
// only ever see the release side here: what's waiting, and marking
// it Released once sterilized and packed. Both submission and
// release are timestamped automatically, at each respective step.
// ============================================================

const HandoverView = {
  async render() {
    const el = document.getElementById('view-handover');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook</div>
          <h1>Instrument/Supplies Handover</h1>
          <div class="desc">Departments submit items through the login-screen portal. Your job here is releasing once sterilized and packed.</div>
        </div>
      </div>

      <div id="ho-wide-dashboard">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">
          <input type="text" id="ho-wide-search" placeholder="Search reference #, department, item..." style="flex:1;min-width:220px;">
          <select id="ho-wide-status-filter">
            <option value="">All statuses</option>
            <option value="Awaiting Intake">Awaiting Intake</option>
            <option value="Intake Discrepancy">Intake Discrepancy</option>
            <option value="Processing">Processing</option>
            <option value="Late">Late</option>
            <option value="Released">Released</option>
            <option value="Pending Balance">Pending Balance</option>
            <option value="Received">Received</option>
          </select>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Ref #</th><th>Department</th><th>Submitted by</th><th>Received</th><th></th><th>Status</th></tr></thead>
          <tbody id="ho-wide-tbody"><tr><td colspan="6" class="empty-state">Loading…</td></tr></tbody>
        </table></div>
        <div id="ho-wide-pagination" style="margin-top:12px;"></div>
      </div>

      <div id="ho-narrow-sections">
      <div class="section-title">Awaiting Intake Verification <span class="count" id="ho-intake-count">—</span> <span class="hint" style="font-weight:400;">confirm what was actually received before processing begins</span></div>
      <div id="ho-intake-list"></div>

      <div class="section-title">Unprocessed Discrepancy <span class="count" id="ho-intake-disc-count">—</span> <span class="hint" style="font-weight:400;">received fewer than the department submitted</span></div>
      <div id="ho-intake-disc-list"></div>

      <div class="section-title">Processing — awaiting release <span class="count" id="ho-open-count">—</span></div>
      <div id="ho-open-list"></div>

      <div class="section-title">Released — awaiting department verification <span class="count" id="ho-released-count">—</span></div>
      <div id="ho-released-list"></div>

      <div class="section-title">Pending Balance <span class="count" id="ho-balance-count">—</span></div>
      <div id="ho-balance-list"></div>

      <div class="section-title">Unresolved Items <span class="count" id="ho-unresolved-count">—</span> <span class="hint" style="font-weight:400;">superuser makes the final call here</span></div>
      <div id="ho-unresolved-list"></div>

      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Late Release <span class="count" id="ho-late-count">—</span> <span class="hint" style="font-weight:400;">turnaround target: 3 days from submission</span></span>
      </div>
      ${SearchBar.render('ho-late-search')}
      <div class="table-wrap"><table>
        <thead><tr><th>Ref #</th><th>Department</th><th>Submitted</th><th>Released</th><th></th><th></th></tr></thead>
        <tbody id="ho-late-tbody"><tr><td colspan="6" class="empty-state">Loading…</td></tr></tbody>
      </table></div>

      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Recent handovers <span class="count" id="ho-count">—</span></span>
        <button class="btn btn-sm" id="ho-view-history">View all history →</button>
      </div>
      ${SearchBar.render('ho-search')}
      <div class="table-wrap"><table>
        <thead><tr><th>Ref #</th><th>Department</th><th>Submitted by</th><th>Status</th><th>Received</th><th></th><th></th></tr></thead>
        <tbody id="ho-tbody"><tr><td colspan="7" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
      </div>
    `;
    document.getElementById('ho-view-history').addEventListener('click', () => App.navigate('handover-history'));
    document.getElementById('ho-wide-search').addEventListener('input', () => this._renderWideDashboard());
    document.getElementById('ho-wide-status-filter').addEventListener('change', () => this._renderWideDashboard());
    this._loadIntake();
    this._loadIntakeDiscrepancies();
    this._loadOpen();
    this._loadReleased();
    this._loadBalance();
    this._loadLate();
    this._loadTable();
    this._loadWideDashboard();
  },

  _renderItemsList(items) {
    if (!items || items.length === 0) return '(no items listed)';
    return items.map(it => `${UI.escapeHtml(it.name)} <span class="hint">× ${it.qty}</span>`).join('<br>');
  },

  _renderHandoverDetails(r) {
    const row = (label, value) => value ? `<div style="margin-bottom:4px;"><span class="hint">${label}:</span> ${value}</div>` : '';
    const items = r.load_contents || [];
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">
        <div>
          <div style="font-weight:700;margin-bottom:6px;">Timeline</div>
          ${row('Submitted', UI.fmtDateTime(r.received_at))}
          ${row('Released', r.released_at ? `${UI.fmtDateTime(r.released_at)} by ${UI.escapeHtml(r.released_by_name)}` : null)}
          ${row('Verified', r.received_verified_at ? `${UI.fmtDateTime(r.received_verified_at)} by ${UI.escapeHtml(r.received_verified_by_name)}` : null)}
        </div>
        <div>
          <div style="font-weight:700;margin-bottom:6px;">Submission</div>
          ${row('Department', UI.escapeHtml(this._deptLabel(r)))}
          ${row('Submitted by', UI.escapeHtml(r.submitted_by_name))}
          ${row('Remarks', UI.escapeHtml(r.remarks))}
        </div>
      </div>
      <div style="font-weight:700;margin-bottom:6px;">Items</div>
      ${items.map(it => `
        <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px dashed var(--line);">
          <strong>${UI.escapeHtml(it.name)}</strong> — submitted ${it.qty}${it.received_qty != null ? `, received ${it.received_qty}` : ''}
          ${it.verify_remarks ? row('Verify remarks', UI.escapeHtml(it.verify_remarks)) : ''}
          ${it.cssd_action ? row('CSSD action', `${it.cssd_action} by ${UI.escapeHtml(it.cssd_action_by)} at ${UI.fmtDateTime(it.cssd_action_at)}${it.cssd_remarks ? ' — ' + UI.escapeHtml(it.cssd_remarks) : ''}`) : ''}
          ${it.final_status ? row('Final', `${it.final_status} by ${UI.escapeHtml(it.final_by)} at ${UI.fmtDateTime(it.final_at)}${it.final_remarks ? ' — ' + UI.escapeHtml(it.final_remarks) : ''}`) : ''}
        </div>
      `).join('') || '(no items listed)'}
    `;
  },

  async _loadBalance() {
    const bWrap = document.getElementById('ho-balance-list');
    const uWrap = document.getElementById('ho-unresolved-list');
    try {
      const rows = await DB.listPendingBalanceAll();
      // Split per-item, not per-handover — one handover can have some
      // items already resolved and others still awaiting review.
      const awaitingReview = [];    // shortfall, no cssd_action yet
      const awaitingDeptReverify = []; // CSSD released the remainder, department hasn't confirmed receipt yet
      const unresolved = [];        // cssd_action === 'unresolved', no final_status yet
      rows.forEach(r => {
        (r.load_contents || []).forEach(it => {
          if ((it.received_qty ?? it.qty) >= it.qty) return; // not actually short
          if (it.final_status) return; // already finalized, done
          if (it.awaiting_reverification) awaitingDeptReverify.push({ handover: r, item: it });
          else if (!it.cssd_action) awaitingReview.push({ handover: r, item: it });
          else if (it.cssd_action === 'unresolved') unresolved.push({ handover: r, item: it });
        });
      });

      document.getElementById('ho-balance-count').textContent = awaitingReview.length + awaitingDeptReverify.length;
      const reviewHtml = awaitingReview.length === 0 ? '' : awaitingReview.map(({ handover, item }) => `
          <div class="card card-pad pending-highlight" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
            <div>
              <strong>${UI.escapeHtml(this._deptLabel(handover))}</strong> · ${UI.escapeHtml(handover.serial_number)}
              <div class="hint" style="margin-top:4px;">${UI.escapeHtml(item.name)} — received ${item.received_qty} of ${item.qty}${item.verify_remarks ? ` · "${UI.escapeHtml(item.verify_remarks)}"` : ''}</div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm btn-primary" data-resolve-item="${handover.id}|${item.id}">Resolve — release remaining balance</button>
              <button class="btn btn-sm" data-unresolve-item="${handover.id}|${item.id}">Unresolved</button>
            </div>
          </div>
        `).join('');
      const reverifyHtml = awaitingDeptReverify.length === 0 ? '' : awaitingDeptReverify.map(({ handover, item }) => `
          <div class="card card-pad" style="margin-bottom:10px;background:rgba(27,110,120,0.06);border-color:rgba(27,110,120,0.3);">
            <strong>${UI.escapeHtml(this._deptLabel(handover))}</strong> · ${UI.escapeHtml(handover.serial_number)}
            <div class="hint" style="margin-top:4px;">${UI.escapeHtml(item.name)} — released remaining ${item.reverify_qty}, waiting on ${UI.escapeHtml(this._deptLabel(handover))} to confirm receipt via their Releasing of Items window.</div>
          </div>
        `).join('');
      bWrap.innerHTML = (reviewHtml + reverifyHtml) || `<div class="card card-pad empty-state" style="padding:14px;">Nothing awaiting review.</div>`;
      bWrap.querySelectorAll('[data-resolve-item]').forEach(btn => btn.addEventListener('click', () => this._resolveItem(...btn.dataset.resolveItem.split('|'), 'resolved')));
      bWrap.querySelectorAll('[data-unresolve-item]').forEach(btn => btn.addEventListener('click', () => this._openUnresolvedModal(...btn.dataset.unresolveItem.split('|'))));

      document.getElementById('ho-unresolved-count').textContent = unresolved.length;
      const isSuperuser = Auth.currentStaff.role === 'superuser';
      uWrap.innerHTML = unresolved.length === 0
        ? `<div class="card card-pad empty-state" style="padding:14px;">No unresolved items.</div>`
        : unresolved.map(({ handover, item }) => `
          <div class="card card-pad" style="margin-bottom:10px;background:rgba(196,67,46,0.06);border-color:rgba(196,67,46,0.3);">
            <strong>${UI.escapeHtml(this._deptLabel(handover))}</strong> · ${UI.escapeHtml(handover.serial_number)}
            <div class="hint" style="margin-top:4px;">${UI.escapeHtml(item.name)} — received ${item.received_qty} of ${item.qty}</div>
            <div class="hint">CSSD remarks: ${UI.escapeHtml(item.cssd_remarks) || '—'} · by ${UI.escapeHtml(item.cssd_action_by)}</div>
            ${isSuperuser ? `
              <div style="display:flex;gap:8px;margin-top:10px;">
                <button class="btn btn-sm btn-primary" data-final="${handover.id}|${item.id}|final_resolved">Final Resolved</button>
                <button class="btn btn-sm" data-final="${handover.id}|${item.id}|final_unresolved">Final Unresolved</button>
              </div>
            ` : `<div class="hint" style="margin-top:6px;">Only a superuser can make this final.</div>`}
          </div>
        `).join('');
      uWrap.querySelectorAll('[data-final]').forEach(btn => {
        const [handoverId, itemId, status] = btn.dataset.final.split('|');
        btn.addEventListener('click', () => this._openFinalModal(handoverId, itemId, status));
      });
    } catch (e) {
      bWrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load.</div>`;
      uWrap.innerHTML = '';
    }
  },

  async _resolveItem(handoverId, itemId, action, remarks) {
    try {
      const rows = await DB.listPendingBalanceAll();
      const handover = rows.find(r => r.id === handoverId);
      if (!handover) return;
      const updatedItems = (handover.load_contents || []).map(it => {
        if (it.id !== itemId) return it;
        const base = { ...it, cssd_action: action, cssd_remarks: remarks || null, cssd_action_at: TrueTime.nowISO(), cssd_action_by: Auth.currentStaff.name };
        // "Resolved" releases the remaining balance for the department to
        // verify again — it doesn't close the item out immediately. Only
        // the department confirming receipt (or a superuser's final call)
        // actually ends it.
        if (action === 'resolved') {
          base.awaiting_reverification = true;
          base.reverify_qty = it.qty - (it.received_qty ?? 0);
        }
        return base;
      });
      const stillOpen = updatedItems.some(it => (it.received_qty ?? it.qty) < it.qty && !it.final_status);
      const result = await DB.updateHandoverItems(handoverId, updatedItems, stillOpen);
      UI.writeResultToast(result, action === 'resolved' ? 'Remaining balance released — awaiting department re-verification' : 'Marked unresolved');
      this._loadBalance();
    } catch (e) { UI.toast('Could not save: ' + e.message, true); }
  },

  _openUnresolvedModal(handoverId, itemId) {
    const modal = UI.showModal(`
      <h3>Mark Unresolved</h3>
      <div class="modal-desc">This needs a reason — it'll wait for a superuser's final decision.</div>
      <div class="field" style="margin:14px 0;"><label>Remarks</label><textarea id="ho-unresolve-remarks" required></textarea></div>
      <div class="modal-actions">
        <button class="btn" id="ho-unresolve-cancel">Cancel</button>
        <button class="btn btn-primary" id="ho-unresolve-submit">Submit</button>
      </div>
    `);
    modal.querySelector('#ho-unresolve-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#ho-unresolve-submit').addEventListener('click', async () => {
      const remarks = document.getElementById('ho-unresolve-remarks').value.trim();
      if (!remarks) { UI.toast('Remarks are required to mark something unresolved', true); return; }
      UI.closeModal();
      await this._resolveItem(handoverId, itemId, 'unresolved', remarks);
    });
  },

  _openFinalModal(handoverId, itemId, status) {
    const label = status === 'final_resolved' ? 'Final Resolved' : 'Final Unresolved';
    const modal = UI.showModal(`
      <h3>${label}</h3>
      <div class="modal-desc">This is the last word on this item — it closes out of Pending Balance either way.</div>
      <div class="field" style="margin:14px 0;"><label>Remarks <span class="hint">optional</span></label><textarea id="ho-final-remarks"></textarea></div>
      <div class="modal-actions">
        <button class="btn" id="ho-final-cancel">Cancel</button>
        <button class="btn btn-primary" id="ho-final-submit">Confirm ${label}</button>
      </div>
    `);
    modal.querySelector('#ho-final-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#ho-final-submit').addEventListener('click', async () => {
      const remarks = document.getElementById('ho-final-remarks').value || null;
      UI.closeModal();
      try {
        const rows = await DB.listPendingBalanceAll();
        const handover = rows.find(r => r.id === handoverId);
        if (!handover) return;
        const updatedItems = (handover.load_contents || []).map(it => it.id === itemId
          ? { ...it, final_status: status, final_remarks: remarks, final_at: TrueTime.nowISO(), final_by: Auth.currentStaff.name }
          : it);
        const stillOpen = updatedItems.some(it => (it.received_qty ?? it.qty) < it.qty && !it.final_status);
        const result = await DB.updateHandoverItems(handoverId, updatedItems, stillOpen);
        UI.writeResultToast(result, `Marked ${label}`);
        this._loadBalance();
      } catch (e) { UI.toast('Could not save: ' + e.message, true); }
    });
  },

  _deptLabel(r) {
    return r.department === 'Other' ? (r.department_other || 'Other') : r.department;
  },

  // A handover is "late" if it's still awaiting release past the 3-day
  // window (Processing), OR it WAS released, but took longer than 3
  // days to get there — both count, since the point is measuring
  // whether CSSD met its own turnaround commitment, not just whether
  // something is currently overdue. received_at is submission despite
  // the column name (see schema comment) — released_at is when CSSD
  // actually marked it Released. Shared with DepartmentPortal.
  isLateRelease(r) {
    if (!r.received_at) return false;
    const deadline = new Date(r.received_at).getTime() + 3 * 86400000;
    if (r.status === 'Processing') return TrueTime.now().getTime() > deadline;
    return !!r.released_at && new Date(r.released_at).getTime() > deadline;
  },

  // A single handover can genuinely carry several independent things
  // at once — still Processing AND late AND has an intake
  // discrepancy, say. Returns every badge that currently applies,
  // each optionally carrying an actionKey the consolidated wide-screen
  // view's Quick Edit panel uses to know which form to show. Shared
  // with DepartmentPortal, whose own action set differs (no intake
  // step, has "Verify Remaining" instead).
  computeStatusBadges(r) {
    const badges = [];
    if (r.status === 'Received') {
      badges.push({ label: 'Received', tone: 'success' });
    } else if (r.status === 'Released') {
      badges.push({ label: 'Released', tone: 'accent' });
      if (r.has_pending_balance) badges.push({ label: 'Pending Balance', tone: 'danger', actionKey: 'balance' });
    } else { // Processing
      if (!r.intake_verified_at) {
        badges.push({ label: 'Awaiting Intake', tone: 'amber', actionKey: 'intake' });
      } else if (r.has_intake_discrepancy && !r.intake_discrepancy_notified_at) {
        badges.push({ label: 'Intake Discrepancy', tone: 'danger', actionKey: 'notify' });
      } else {
        badges.push({ label: 'Processing', tone: 'accent', actionKey: 'release' });
      }
      if (this.isLateRelease(r)) badges.push({ label: 'Late', tone: 'danger' });
    }
    return badges;
  },

  async _loadReleased() {
    const wrap = document.getElementById('ho-released-list');
    try {
      const rows = await DB.listHandovers({ limit: 200 });
      const released = rows.filter(r => r.status === 'Released');
      document.getElementById('ho-released-count').textContent = released.length;
      if (released.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:18px;">Nothing waiting on department verification.</div>`;
        return;
      }
      wrap.innerHTML = released.map(r => `
        <div class="card card-pad" style="margin-bottom:10px;">
          <strong>${UI.escapeHtml(this._deptLabel(r))}</strong>
          <span class="hint" style="margin-left:8px;">released ${UI.fmtDateTime(r.released_at)} by ${UI.escapeHtml(r.released_by_name)}</span>
          ${r.load_contents && r.load_contents.length ? `<div style="margin-top:6px;"><button class="btn btn-sm" data-items-toggle="${r.id}">Items ▸</button><div id="ho-released-items-${r.id}" class="hint" style="display:none;margin-top:6px;">${this._renderItemsList(r.load_contents)}</div></div>` : ''}
          <div class="hint" style="margin-top:6px;color:var(--amber);">Waiting for ${UI.escapeHtml(this._deptLabel(r))} to verify receipt via the Releasing of Items window.</div>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-items-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(`ho-released-items-${btn.dataset.itemsToggle}`);
          const isHidden = target.style.display === 'none';
          target.style.display = isHidden ? 'block' : 'none';
          btn.textContent = isHidden ? 'Items ▾' : 'Items ▸';
        });
      });
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load — offline or unreachable.</div>`;
    }
  },

  // Items CSSD hasn't yet physically confirmed receipt of — the new
  // step that happens before Processing effectively begins. For each,
  // CSSD enters what they actually counted per item (defaulting to
  // the submitted qty) and confirms.
  async _loadIntake() {
    const wrap = document.getElementById('ho-intake-list');
    try {
      const rows = (await DB.listProcessingHandovers()).filter(r => !r.intake_verified_at);
      document.getElementById('ho-intake-count').textContent = rows.length;
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:18px;">Nothing waiting on intake verification.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r => `
        <div class="card card-pad pending-highlight" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;">
            <strong>${UI.escapeHtml(this._deptLabel(r))}</strong>
            <span class="hint">submitted by ${UI.escapeHtml(r.submitted_by_name) || 'unknown'} · ${UI.fmtDateTime(r.received_at)}</span>
          </div>
          <table style="width:100%;margin-top:10px;">
            <thead><tr><th style="text-align:left;">Item</th><th style="text-align:left;">Submitted qty</th><th style="text-align:left;">Actually received</th></tr></thead>
            <tbody>
              ${(r.load_contents || []).map(it => `
                <tr>
                  <td>${UI.escapeHtml(it.name)}</td>
                  <td>${UI.escapeHtml(String(it.qty))}</td>
                  <td><input type="number" min="0" value="${UI.escapeHtml(String(it.qty))}" data-intake-qty="${r.id}:${it.id}" style="width:80px;"></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="field field-full" style="margin-top:8px;"><label>Remarks (optional)</label><textarea data-intake-remarks="${r.id}" rows="2"></textarea></div>
          <div style="margin-top:8px;"><button class="btn btn-sm btn-primary" data-intake-confirm="${r.id}">Confirm Received</button></div>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-intake-confirm]').forEach(btn => btn.addEventListener('click', async () => {
        const handoverId = btn.dataset.intakeConfirm;
        const r = rows.find(x => x.id === handoverId);
        const remarks = document.querySelector(`[data-intake-remarks="${handoverId}"]`).value.trim();
        let hasDiscrepancy = false;
        const items = (r.load_contents || []).map(it => {
          const input = document.querySelector(`[data-intake-qty="${handoverId}:${it.id}"]`);
          const intakeQty = parseInt(input.value, 10);
          if (isNaN(intakeQty) || intakeQty < it.qty) hasDiscrepancy = true;
          return { ...it, intake_qty: isNaN(intakeQty) ? 0 : intakeQty, intake_remarks: remarks || null };
        });
        try {
          const result = await DB.confirmHandoverIntake(handoverId, items, hasDiscrepancy);
          UI.writeResultToast(result, hasDiscrepancy ? 'Confirmed — discrepancy flagged' : 'Confirmed received');
          this._loadIntake();
          this._loadIntakeDiscrepancies();
          this._loadOpen();
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load — offline or unreachable.</div>`;
    }
  },

  // Items where CSSD's own intake count came up short — flagged here
  // separately, distinct from Pending Balance (which is about the
  // DEPARTMENT'S later shortfall after CSSD releases something back).
  // Clicking Notify is itself the acknowledgment step — it moves the
  // item straight into normal Processing, no separate ack needed.
  async _loadIntakeDiscrepancies() {
    const wrap = document.getElementById('ho-intake-disc-list');
    try {
      const rows = (await DB.listProcessingHandovers()).filter(r => r.has_intake_discrepancy && !r.intake_discrepancy_notified_at);
      document.getElementById('ho-intake-disc-count').textContent = rows.length;
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:18px;">No unnotified intake discrepancies.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r => {
        const shortItems = (r.load_contents || []).filter(it => (it.intake_qty || 0) < it.qty);
        return `
        <div class="card card-pad" style="margin-bottom:10px;border-left:3px solid var(--red);">
          <strong>${UI.escapeHtml(this._deptLabel(r))}</strong>
          <span class="hint" style="margin-left:8px;">submitted by ${UI.escapeHtml(r.submitted_by_name) || 'unknown'} · ${UI.fmtDateTime(r.received_at)}</span>
          <ul style="margin:8px 0 0 18px;">
            ${shortItems.map(it => `<li>${UI.escapeHtml(it.name)} — submitted ${it.qty}, received ${it.intake_qty || 0}${it.intake_remarks ? ` — "${UI.escapeHtml(it.intake_remarks)}"` : ''}</li>`).join('')}
          </ul>
          <div style="margin-top:10px;"><button class="btn btn-sm btn-primary" data-intake-notify="${r.id}">Notify Department</button></div>
        </div>
      `;
      }).join('');
      wrap.querySelectorAll('[data-intake-notify]').forEach(btn => btn.addEventListener('click', async () => {
        try {
          const result = await DB.notifyIntakeDiscrepancy(btn.dataset.intakeNotify);
          UI.writeResultToast(result, 'Department notified');
          this._loadIntakeDiscrepancies();
          this._loadOpen();
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load — offline or unreachable.</div>`;
    }
  },

  async _loadOpen() {
    const wrap = document.getElementById('ho-open-list');
    try {
      // Only items that have cleared intake verification, and either
      // had no discrepancy or have already been notified about the one
      // they did have — Notify is itself the acknowledgment that moves
      // something into normal processing.
      const rows = (await DB.listProcessingHandovers()).filter(r => r.intake_verified_at && (!r.has_intake_discrepancy || r.intake_discrepancy_notified_at));
      document.getElementById('ho-open-count').textContent = rows.length;
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:18px;">Nothing waiting on release.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r => `
        <div class="card card-pad pending-highlight" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
          <div>
            <strong>${UI.escapeHtml(this._deptLabel(r))}</strong>
            <span class="hint" style="margin-left:8px;">submitted by ${UI.escapeHtml(r.submitted_by_name) || 'unknown'} · ${UI.fmtDateTime(r.received_at)}</span>
            ${r.load_contents && r.load_contents.length ? `<div style="margin-top:6px;"><button class="btn btn-sm" data-items-toggle="${r.id}">Items ▸</button><div id="ho-open-items-${r.id}" class="hint" style="display:none;margin-top:6px;">${this._renderItemsList(r.load_contents)}</div></div>` : ''}
          </div>
          <button class="btn btn-sm btn-primary" data-release="${r.id}">Mark Released</button>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-items-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(`ho-open-items-${btn.dataset.itemsToggle}`);
          const isHidden = target.style.display === 'none';
          target.style.display = isHidden ? 'block' : 'none';
          btn.textContent = isHidden ? 'Items ▾' : 'Items ▸';
        });
      });
      wrap.querySelectorAll('[data-release]').forEach(b => b.addEventListener('click', async () => {
        try {
          const result = await DB.releaseHandover(b.dataset.release, {
            status: 'Released',
            released_by_id: Auth.currentStaff.id,
            released_by_name: Auth.currentStaff.name,
            released_at: TrueTime.nowISO()
          });
          UI.writeResultToast(result, 'Marked Released');
          this._loadOpen();
          this._loadReleased();
          this._loadTable();
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load — offline or unreachable.</div>`;
    }
  },

  async _loadTable() {
    const tbody = document.getElementById('ho-tbody');
    try {
      const rows = (await DB.listHandovers({ from: UI.daysAgoStr(30), limit: 100 })).filter(r => !this.isLateRelease(r));
      // SearchBar's generic text filter expects plain string fields —
      // give it a flattened summary of item names instead of the
      // structured [{id,name,qty}] array directly (which would just
      // stringify to "[object Object]" and never actually match).
      rows.forEach(r => { r._itemsSearchText = (r.load_contents || []).map(it => it.name).join(' '); });
      this._tableRows = rows;
      SearchBar.wire('ho-search', (criteria) => this._renderTable(SearchBar.filter(rows, criteria, 'received_at', ['submitted_by_name', '_itemsSearchText', 'department', 'department_other'])));
      this._renderTable(rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Couldn't load handovers.</td></tr>`;
    }
  },

  // ---------------- WIDE-SCREEN CONSOLIDATED DASHBOARD (>860px) ----------------
  // _widePage: 'default' (last 3 weeks) | 'expanded' (last 3 months) |
  // an integer >= 2 (each page is its own 3-month window further back).
  async _loadWideDashboard(page = 'default') {
    this._widePage = page;
    const tbody = document.getElementById('ho-wide-tbody');
    const to = UI.todayStr();
    let from;
    if (page === 'default') from = UI.daysAgoStr(21);
    else if (page === 'expanded') from = UI.daysAgoStr(90);
    else from = UI.daysAgoStr(90 * page); // page 2 = 90-180 days ago's window start
    const windowTo = (typeof page === 'number') ? UI.daysAgoStr(90 * (page - 1)) : to;
    try {
      const rows = await DB.listHandovers({ from, to: windowTo, limit: 2000 });
      rows.forEach(r => { r._itemsSearchText = (r.load_contents || []).map(it => it.name).join(' '); });
      this._wideRows = rows;
      this._renderWideDashboard();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Couldn't load: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  },

  _renderWideDashboard() {
    const tbody = document.getElementById('ho-wide-tbody');
    const search = (document.getElementById('ho-wide-search').value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('ho-wide-status-filter').value;
    const rows = this._wideRows.filter(r => {
      const badges = this.computeStatusBadges(r);
      if (statusFilter && !badges.some(b => b.label === statusFilter)) return false;
      if (!search) return true;
      const haystack = `${r.serial_number} ${this._deptLabel(r)} ${r.submitted_by_name || ''} ${r._itemsSearchText}`.toLowerCase();
      return haystack.includes(search);
    });
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No handovers match.</td></tr>`;
    } else {
      tbody.innerHTML = rows.map((r, i) => `
        <tr>
          <td class="mono">${UI.escapeHtml(r.serial_number) || '—'}</td>
          <td>${UI.escapeHtml(this._deptLabel(r))}</td>
          <td>${UI.escapeHtml(r.submitted_by_name) || '—'}</td>
          <td>${UI.fmtDateTime(r.received_at)}</td>
          <td><button class="btn btn-sm" data-wide-print="${r.id}">Print</button></td>
          <td>
            ${this.computeStatusBadges(r).map(b => `<span class="badge ${b.tone === 'danger' ? 'badge-fail' : b.tone === 'success' ? 'badge-pass' : b.tone === 'amber' ? 'badge-worn' : 'badge-neutral'}" style="margin-right:4px;">${UI.escapeHtml(b.label)}</span>`).join('')}
            <button class="btn btn-sm" style="background:none;border:none;color:var(--brand);" data-wide-quickedit="${r.id}">Quick edit ▸</button>
          </td>
        </tr>
        <tr id="ho-wide-qe-${r.id}" style="display:none;"><td colspan="6" style="padding:0;background:var(--surface-sunken);"></td></tr>
      `).join('');
      tbody.querySelectorAll('[data-wide-print]').forEach(btn => btn.addEventListener('click', () => this._printHandover(rows.find(r => r.id === btn.dataset.widePrint))));
      tbody.querySelectorAll('[data-wide-quickedit]').forEach(btn => btn.addEventListener('click', () => this._toggleWideQuickEdit(btn, rows.find(r => r.id === btn.dataset.wideQuickedit))));
    }
    const pWrap = document.getElementById('ho-wide-pagination');
    if (this._widePage === 'default') {
      pWrap.innerHTML = `<button class="btn btn-sm" id="ho-wide-seeall">See all — last 3 months</button>`;
      document.getElementById('ho-wide-seeall').addEventListener('click', () => this._loadWideDashboard('expanded'));
    } else {
      const pageNum = typeof this._widePage === 'number' ? this._widePage : 1;
      pWrap.innerHTML = `
        <button class="btn btn-sm" id="ho-wide-newer">${pageNum <= 1 ? 'Back to last 3 months' : 'Newer 3 months'}</button>
        <button class="btn btn-sm" id="ho-wide-older" style="margin-left:8px;">Older 3 months</button>
      `;
      document.getElementById('ho-wide-newer').addEventListener('click', () => this._loadWideDashboard(pageNum <= 1 ? 'expanded' : pageNum));
      document.getElementById('ho-wide-older').addEventListener('click', () => this._loadWideDashboard(pageNum + 1));
    }
  },

  // Shows whichever action form actually applies to this row's
  // primary open status — reuses the exact same confirm/notify/mark-
  // released logic the narrow-screen sections already use, just
  // rendered inline instead of in their own dedicated card.
  _toggleWideQuickEdit(btn, r) {
    const row = document.getElementById(`ho-wide-qe-${r.id}`);
    const isHidden = row.style.display === 'none';
    row.style.display = isHidden ? 'table-row' : 'none';
    btn.textContent = isHidden ? 'Quick edit ▾' : 'Quick edit ▸';
    if (!isHidden) return;
    const td = row.querySelector('td');
    const badges = this.computeStatusBadges(r);
    const primary = badges.find(b => b.actionKey);
    if (!primary) { td.innerHTML = `<div style="padding:14px 18px;">${this._renderHandoverDetails(r)}</div>`; return; }
    if (primary.actionKey === 'intake') {
      td.innerHTML = `
        <div style="padding:14px 18px;">
          <table style="width:100%;margin-bottom:8px;">
            <thead><tr><th style="text-align:left;">Item</th><th style="text-align:left;">Submitted</th><th style="text-align:left;">Actually received</th></tr></thead>
            <tbody>${(r.load_contents || []).map(it => `<tr><td>${UI.escapeHtml(it.name)}</td><td>${it.qty}</td><td><input type="number" min="0" value="${it.qty}" data-qe-qty="${it.id}" style="width:80px;"></td></tr>`).join('')}</tbody>
          </table>
          <textarea data-qe-remarks placeholder="Remarks (optional)" rows="2" style="width:100%;margin-bottom:8px;"></textarea>
          <button class="btn btn-sm btn-primary" id="qe-confirm-intake">Confirm Received</button>
        </div>`;
      document.getElementById('qe-confirm-intake').addEventListener('click', async () => {
        const remarks = td.querySelector('[data-qe-remarks]').value.trim();
        let hasDiscrepancy = false;
        const items = (r.load_contents || []).map(it => {
          const qty = parseInt(td.querySelector(`[data-qe-qty="${it.id}"]`).value, 10);
          if (isNaN(qty) || qty < it.qty) hasDiscrepancy = true;
          return { ...it, intake_qty: isNaN(qty) ? 0 : qty, intake_remarks: remarks || null };
        });
        try {
          const result = await DB.confirmHandoverIntake(r.id, items, hasDiscrepancy);
          UI.writeResultToast(result, 'Confirmed');
          this._loadWideDashboard(this._widePage);
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      });
    } else if (primary.actionKey === 'notify') {
      const shortItems = (r.load_contents || []).filter(it => (it.intake_qty || 0) < it.qty);
      td.innerHTML = `
        <div style="padding:14px 18px;">
          <ul style="margin:0 0 10px 18px;">${shortItems.map(it => `<li>${UI.escapeHtml(it.name)} — submitted ${it.qty}, received ${it.intake_qty || 0}</li>`).join('')}</ul>
          <button class="btn btn-sm btn-primary" id="qe-notify">Notify Department</button>
        </div>`;
      document.getElementById('qe-notify').addEventListener('click', async () => {
        try {
          const result = await DB.notifyIntakeDiscrepancy(r.id);
          UI.writeResultToast(result, 'Department notified');
          this._loadWideDashboard(this._widePage);
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      });
    } else if (primary.actionKey === 'release') {
      td.innerHTML = `<div style="padding:14px 18px;"><button class="btn btn-sm btn-primary" id="qe-mark-released">Mark Released</button></div>`;
      document.getElementById('qe-mark-released').addEventListener('click', async () => {
        try {
          const result = await DB.releaseHandover(r.id, {
            status: 'Released', released_by_id: Auth.currentStaff.id,
            released_by_name: Auth.currentStaff.name, released_at: TrueTime.nowISO()
          });
          UI.writeResultToast(result, 'Marked Released');
          this._loadWideDashboard(this._widePage);
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      });
    } else if (primary.actionKey === 'balance') {
      td.innerHTML = `<div style="padding:14px 18px;">${this._renderHandoverDetails(r)}</div>`;
    }
  },


  async _loadLate() {
    try {
      // Wide enough net to catch anything genuinely still Processing
      // (could be older than 30 days if it's been stuck a long while),
      // plus anything released within the recent window that took too
      // long to get there.
      const rows = (await DB.listHandovers({ limit: 1000 })).filter(r => this.isLateRelease(r));
      rows.forEach(r => { r._itemsSearchText = (r.load_contents || []).map(it => it.name).join(' '); });
      this._lateRows = rows;
      SearchBar.wire('ho-late-search', (criteria) => this._renderLateTable(SearchBar.filter(rows, criteria, 'received_at', ['_itemsSearchText', 'department', 'department_other'])));
      this._renderLateTable(rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Couldn't load: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  },

  _renderLateTable(rows) {
    const tbody = document.getElementById('ho-late-tbody');
    document.getElementById('ho-late-count').textContent = `${rows.length} shown`;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Nothing past the 3-day turnaround target.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td class="mono">${UI.escapeHtml(r.serial_number) || '—'}</td>
        <td><strong>${UI.escapeHtml(this._deptLabel(r))}</strong></td>
        <td>${UI.fmtDateTime(r.received_at)}</td>
        <td>${r.released_at ? UI.fmtDateTime(r.released_at) : '<span class="badge badge-fail">Still Processing</span>'}</td>
        <td><button class="btn btn-sm" data-late-details-toggle="${r.id}">Details ▸</button></td>
        <td><button class="btn btn-sm" data-late-print="${r.id}">Print</button></td>
      </tr>
      <tr id="ho-late-details-row-${r.id}" style="display:none;"><td colspan="6" style="padding:14px 16px;background:var(--surface-sunken);">${this._renderHandoverDetails(r)}</td></tr>
    `).join('');
    tbody.querySelectorAll('[data-late-details-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const trWrap = document.getElementById(`ho-late-details-row-${btn.dataset.lateDetailsToggle}`);
        const isHidden = trWrap.style.display === 'none';
        trWrap.style.display = isHidden ? 'table-row' : 'none';
        btn.textContent = isHidden ? 'Details ▾' : 'Details ▸';
      });
    });
    tbody.querySelectorAll('[data-late-print]').forEach(btn => {
      btn.addEventListener('click', () => this._printHandover(rows.find(r => r.id === btn.dataset.latePrint)));
    });
  },

  _renderTable(rows, tbodyId = 'ho-tbody', countId = 'ho-count') {
    const tbody = document.getElementById(tbodyId);
    document.getElementById(countId).textContent = `${rows.length} shown`;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No handovers match.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr class="${r.status === 'Processing' ? 'pending-highlight' : ''}">
          <td class="mono">${UI.escapeHtml(r.serial_number) || '—'}</td>
          <td><strong>${UI.escapeHtml(this._deptLabel(r))}</strong></td>
          <td>${UI.escapeHtml(r.submitted_by_name) || '—'}</td>
          <td><span class="badge ${r.status === 'Processing' ? 'badge-open' : r.status === 'Released' ? 'badge-worn' : 'badge-resolved'}">${r.status}</span></td>
          <td>${UI.fmtDateTime(r.received_at)}</td>
          <td><button class="btn btn-sm" data-details-toggle="${r.id}">Details ▸</button></td>
          <td><button class="btn btn-sm" data-print="${r.id}">Print</button></td>
        </tr>
        <tr id="ho-details-row-${r.id}" style="display:none;"><td colspan="7" style="padding:14px 16px;background:var(--surface-sunken);">${this._renderHandoverDetails(r)}</td></tr>
      `).join('');
    tbody.querySelectorAll('[data-details-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const trWrap = document.getElementById(`ho-details-row-${btn.dataset.detailsToggle}`);
        const isHidden = trWrap.style.display === 'none';
        trWrap.style.display = isHidden ? 'table-row' : 'none';
        btn.textContent = isHidden ? 'Details ▾' : 'Details ▸';
      });
    });
    tbody.querySelectorAll('[data-print]').forEach(btn => {
      btn.addEventListener('click', () => this._printHandover(rows.find(r => r.id === btn.dataset.print)));
    });
  },

  _printHandover(r) {
    const rows = [
      ['Department', this._deptLabel(r)], ['Submitted by', r.submitted_by_name], ['Status', r.status],
      ['Submitted', UI.fmtDateTime(r.received_at)],
      ['Released', r.released_at ? `${UI.fmtDateTime(r.released_at)} by ${r.released_by_name || '—'}` : '—'],
      ['Verified', r.received_verified_at ? `${UI.fmtDateTime(r.received_verified_at)} by ${r.received_verified_by_name || '—'}` : '—'],
      ['Remarks', r.remarks]
    ];
    const items = r.load_contents || [];
    const itemRows = items.map(it => {
      let line = `submitted ${it.qty}`;
      if (it.received_qty != null) line += `, received ${it.received_qty}`;
      if (it.verify_remarks) line += ` — verify: ${it.verify_remarks}`;
      if (it.cssd_action) line += ` — CSSD ${it.cssd_action} by ${it.cssd_action_by} at ${UI.fmtDateTime(it.cssd_action_at)}${it.cssd_remarks ? ' (' + it.cssd_remarks + ')' : ''}`;
      if (it.final_status) line += ` — Final: ${it.final_status} by ${it.final_by} at ${UI.fmtDateTime(it.final_at)}${it.final_remarks ? ' (' + it.final_remarks + ')' : ''}`;
      return [it.name, line];
    });
    PrintReport.generate({
      title: 'INSTRUMENT/SUPPLIES HANDOVER REPORT',
      refNumber: r.serial_number,
      sections: [{ heading: 'Handover Details', rows }, { heading: 'Items', rows: itemRows.length ? itemRows : [['Items', '(none listed)']] }]
    });
  }
};

const HandoverHistoryView = {
  async render() {
    const container = document.getElementById('view-handover-history');
    const { tableWrap, setCount } = HistoryView.renderShell({
      container, title: 'Instrument/Supplies Handover — Full History', backView: 'handover',
      onFilterChange: (filters) => this._load(filters, setCount)
    });
    tableWrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ref #</th><th>Department</th><th>Submitted by</th><th>Status</th><th>Received</th><th></th><th></th></tr></thead>
          <tbody id="ho-hist-tbody"><tr><td colspan="7" class="empty-state">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
  },

  async _load(filters, setCount) {
    const tbody = document.getElementById('ho-hist-tbody');
    try {
      const rows = await DB.listHandovers({ from: filters.from, to: filters.to, limit: 1000 });
      const filtered = filters.search ? rows.filter(r => {
        const haystack = [r.serial_number, HandoverView._deptLabel(r), r.submitted_by_name].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(filters.search.toLowerCase());
      }) : rows;
      setCount(filtered.length);
      HandoverView._renderTable.call(HandoverView, filtered, 'ho-hist-tbody', 'hv-count');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Couldn't load history: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  }
};
