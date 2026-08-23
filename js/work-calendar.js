// ============================================================
// WORK CALENDAR — CSSD doesn't operate weekends, and the superuser
// can mark additional exception ranges (holidays, December break,
// maintenance, quarantine closures). Every missed-log check and KPI
// denominator should route through here so weekends/exceptions are
// consistently excluded everywhere.
// ============================================================

const WorkCalendar = {
  _exceptions: null,
  _exceptionsLoadedAt: 0,
  _launchDate: undefined,
  _launchDateLoadedAt: 0,

  async _loadExceptions() {
    // Cache for 60s within a session — exceptions don't change often
    // and this avoids refetching on every calculation.
    const now = Date.now();
    if (this._exceptions && now - this._exceptionsLoadedAt < 60000) return this._exceptions;
    try {
      this._exceptions = await DB.listExceptions();
    } catch (e) {
      this._exceptions = [];
    }
    this._exceptionsLoadedAt = now;
    return this._exceptions;
  },

  // The pre-launch gate's launch_date (backlog item #12) — null until a
  // superuser has actually activated the app. Cached the same way as
  // exceptions above.
  async launchDate() {
    const now = Date.now();
    if (this._launchDate !== undefined && now - this._launchDateLoadedAt < 60000) return this._launchDate;
    try {
      const meta = await DB.getAppMeta();
      this._launchDate = (meta && meta.launched && meta.launch_date) ? meta.launch_date : null;
    } catch (e) {
      this._launchDate = null;
    }
    this._launchDateLoadedAt = now;
    return this._launchDate;
  },

  isWeekend(dateStr) {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    return day === 0 || day === 6;
  },

  async isException(dateStr) {
    const exceptions = await this._loadExceptions();
    return exceptions.some(ex => dateStr >= ex.date_from && dateStr <= ex.date_to);
  },
  exceptionFor(dateStr, exceptions) {
    return (exceptions || []).find(ex => dateStr >= ex.date_from && dateStr <= ex.date_to) || null;
  },

  async isWorkingDay(dateStr) {
    const launchDate = await this.launchDate();
    if (launchDate && dateStr < launchDate) return false;
    if (this.isWeekend(dateStr)) return false;
    if (await this.isException(dateStr)) return false;
    return true;
  },

  // Returns array of 'YYYY-MM-DD' working days (Mon-Fri, minus exceptions,
  // and never before launch_date) in [from, to] inclusive. Every missed-log
  // check and KPI denominator routes through this or workingDayCount below,
  // so clamping here is the single point that makes backlog item #12's
  // "nothing before launch counts" rule apply everywhere automatically.
  async workingDaysBetween(from, to) {
    const launchDate = await this.launchDate();
    const effectiveFrom = (launchDate && launchDate > from) ? launchDate : from;
    const exceptions = await this._loadExceptions();
    const days = [];
    let d = new Date(effectiveFrom + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    while (d <= end) {
      const key = d.toISOString().slice(0, 10);
      if (!this.isWeekend(key) && !this.exceptionFor(key, exceptions)) days.push(key);
      d.setDate(d.getDate() + 1);
    }
    return days;
  },

  async workingDayCount(from, to) {
    return (await this.workingDaysBetween(from, to)).length;
  }
};
