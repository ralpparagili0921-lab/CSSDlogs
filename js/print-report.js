// ============================================================
// PRINT REPORT — shared template for printing a single logbook
// entry, matching the exact visual language of the existing KPI
// Report PDF (same header, same signature block, same footer) so
// every printed document in the app looks consistent, whether it's
// a KPI summary or one specific entry.
//
// Every logbook supplies the same simple shape: a title, a reference
// number, and a list of sections, each with label/value rows —
// deliberately generic so one shared layout function handles all 9
// logbooks instead of a bespoke PDF template per logbook.
// ============================================================

const PrintReport = {
  // opts: { title, refNumber, sections: [{ heading, rows: [[label, value], ...] }] }
  generate(opts) {
    const cfg = window.APP_CONFIG;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = 40;

    // Header — identical structure to the KPI Report PDF
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(47, 107, 79);
    doc.text(cfg.HOSPITAL_NAME, margin, y);
    doc.setFontSize(9); doc.setTextColor(90, 90, 90); doc.setFont('helvetica', 'normal');
    doc.text(cfg.DEPARTMENT, margin, y + 14);
    doc.setTextColor(0, 0, 0); doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text(opts.title, pageW / 2, y + 40, { align: 'center' });
    if (opts.refNumber) {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 90, 90);
      doc.text(`Reference: ${opts.refNumber}`, pageW / 2, y + 56, { align: 'center' });
    }
    y += 72;
    doc.setDrawColor(180, 180, 180); doc.line(margin, y, pageW - margin, y); y += 20;

    // Body — each section as a bold heading followed by label/value rows.
    // A fresh page starts automatically if a section would run off the
    // bottom, same safety margin the KPI report already uses.
    doc.setTextColor(0, 0, 0);
    opts.sections.forEach(section => {
      if (y > pageH - 120) { doc.addPage(); y = 50; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text(section.heading, margin, y); y += 16;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      (section.rows || []).forEach(([label, value]) => {
        if (y > pageH - 100) { doc.addPage(); y = 50; }
        const text = `${label}: ${value == null || value === '' ? '—' : value}`;
        const lines = doc.splitTextToSize(text, pageW - margin * 2);
        doc.text(lines, margin, y);
        y += 14 * lines.length;
      });
      y += 12;
    });

    // Signature block — identical structure to the KPI Report PDF
    if (y > pageH - 100) { doc.addPage(); y = 60; }
    y += 10;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Responsible Person/Department:', margin, y);
    doc.text('Name: _______________________', margin, y + 18);
    doc.text('Sign: _______________________', margin, y + 36);
    doc.text('Received by Quality & Patient Safety Office:', pageW / 2 + 10, y);
    doc.text('Name: _______________________', pageW / 2 + 10, y + 18);
    doc.text('Sign: _______________________', pageW / 2 + 10, y + 36);

    // Footer — identical structure to the KPI Report PDF
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(140, 140, 140);
      doc.text(`${cfg.FORM_CODE}  ·  ${cfg.FORM_VERSION}  ·  Generated ${UI.fmtDate(UI.todayStr())}`, margin, pageH - 20);
    }

    const safeName = (opts.refNumber || opts.title).replace(/[^\w-]+/g, '_');
    doc.save(`${safeName}.pdf`);
  }
};
