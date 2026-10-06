import { buildMetricsPdf, metricExportData } from "./rvu-staffing-export";
import { formatOneDecimal, type CalculatedRvuStaffingRow } from "./rvu-staffing";
import { PROCEDURE_TYPES, monthLabel, type ProcedureMetricsReport } from "./procedures";

export type OperationalReport = {
  rows: CalculatedRvuStaffingRow[]; procedures: ProcedureMetricsReport;
  view: "both" | "rvu" | "procedures"; start: string; end: string; custom: boolean;
};
const reportTitle = (view: OperationalReport["view"]) => view === "both" ? "RVU & Procedure Metrics" : view === "rvu" ? "RVU & Staffing Metrics" : "Procedure Metrics";
export const operationalFilename = (data: OperationalReport) => `WHHS-${data.view === "both" ? "Operational-Metrics" : data.view === "rvu" ? "RVU-Metrics" : "Procedure-Metrics"}-${data.start}-to-${data.end}`;
function dailyRows(data: OperationalReport) {
  const dates = Array.from(new Set([...(data.view === "procedures" ? [] : data.rows.map(row => row.shift_date)), ...(data.view === "rvu" ? [] : data.procedures.selected.days.map(day => day.date))])).sort();
  const staffing = new Map(data.rows.map(row => [`${row.shift_date}:${row.shift_type}`, row]));
  const procedures = new Map(data.procedures.selected.days.map(day => [day.date, day]));
  return dates.map(date => ({ date, shifts: (["day", "night"] as const).map(shift => ({ shift, staffing: staffing.get(`${date}:${shift}`), procedures: procedures.get(date)?.[shift] ?? null })) }));
}

export async function buildOperationalPdf(data: OperationalReport, now = new Date()) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const label = `${data.custom ? "Custom" : "Monthly"}: ${data.start} to ${data.end}`;
  const generated = metricExportData([], "custom", now).generated;
  const doc = data.view !== "procedures" ? await buildMetricsPdf(data.rows, "custom", now, label, true, `WHHS ${reportTitle(data.view)}`) : new jsPDF({ unit: "pt", format: "letter" });
  const title = (text: string, y = 40) => { doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(21, 94, 117); doc.text(text, 36, y); };
  const caption = (text: string, y: number) => { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(60); doc.text(text, 36, y); };
  if (data.view !== "rvu") {
    if (data.view === "both") doc.addPage();
    const report = data.procedures;
    title("Procedure Metrics"); caption(label, 57); caption(`Generated: ${generated}`, 71);
    autoTable(doc, { startY: 88, margin: 36, head: [["Total Procedures", "Day Shift", "Night Shift", data.custom ? "Change vs Previous Period" : "Change vs Previous Month", "Average per Day"]], body: [[report.selected.total, report.selected.dayTotal, report.selected.nightTotal, `${report.comparison.difference > 0 ? "+" : ""}${report.comparison.difference}`, report.selected.dailyAverage.toFixed(1)]], styles: { fontSize: 10, cellPadding: 7 }, headStyles: { fillColor: [21, 94, 117] }, didParseCell: cell => { if (cell.section === "body" && cell.column.index === 3) cell.cell.styles.textColor = report.comparison.difference > 0 ? [4, 120, 87] : report.comparison.difference < 0 ? [190, 18, 60] : [60, 60, 60]; } });
    title("Procedures by Type", 191); caption(`${report.selectedPeriodLabel} compared with ${report.comparisonPeriodLabel}`, 208);
    autoTable(doc, { startY: 218, margin: 36, head: [["Procedure", "Selected", "Previous", "Change", "Share"]], body: report.typeComparisons.map(item => [item.label, item.selectedTotal, item.previousTotal, `${item.difference > 0 ? "+" : ""}${item.difference}${item.percentage === null ? "" : ` (${item.percentage.toFixed(1)}%)`}`, `${item.share.toFixed(1)}%`]), styles: { fontSize: 10, cellPadding: 7 }, headStyles: { fillColor: [21, 94, 117] }, didParseCell: cell => { if (cell.section === "body" && cell.column.index === 3) { const difference = report.typeComparisons[cell.row.index].difference; cell.cell.styles.textColor = difference > 0 ? [4, 120, 87] : difference < 0 ? [190, 18, 60] : [60, 60, 60]; } } });
    title("Monthly Trend", 465);
    const trend = report.trend, max = Math.max(1, ...trend.map(item => item.total));
    doc.setDrawColor(200); doc.setLineWidth(.5); doc.line(50, 610, 565, 610);
    trend.forEach((item, index) => { const slot = 515 / trend.length, x = 50 + slot * index + slot / 2, height = item.total / max * 105, width = Math.min(42, slot * .6); doc.setFillColor(...(item.month === report.selected.month ? [14, 116, 144] : [103, 232, 249]) as [number, number, number]); if (height) doc.roundedRect(x - width / 2, 610 - height, width, height, 2, 2, "F"); doc.setFontSize(8); doc.setTextColor(45); doc.text(String(item.total), x, 603 - height, { align: "center" }); doc.text(monthLabel(item.month, "short"), x, 625, { align: "center", angle: trend.length > 6 ? 35 : 0 }); });
  }
  doc.addPage(); title("Daily Operational Detail"); caption(`${data.start} to ${data.end}`, 57);
  let y = 76;
  const dates = dailyRows(data);
  if (!dates.length) caption("No daily details for this date range.", y);
  for (const day of dates) {
    const head = ["Shift", ...(data.view !== "procedures" ? ["RVUs", "RTs Needed", "RTs On", "Variance", "Status"] : []), ...(data.view !== "rvu" ? ["Procedures", "Procedure Breakdown"] : [])];
    const body = day.shifts.map(item => { const row = item.staffing, procedure = item.procedures; return [item.shift === "day" ? "Day" : "Night", ...(data.view !== "procedures" ? [row ? String(row.rvuTotal) : "Not reported", row ? formatOneDecimal(row.exactRtsNeeded) : "-", row ? formatOneDecimal(row.rts_on) : "-", row ? formatOneDecimal(row.staffingVariance) : "-", row ? row.metNeed ? "Met Need" : "Below Need" : "Not reported"] : []), ...(data.view !== "rvu" ? [procedure ? String(procedure.total) : "Not reported", procedure ? PROCEDURE_TYPES.filter(type => procedure.counts[type.id] > 0).map(type => `${type.label}: ${procedure.counts[type.id]}`).join("; ") || "None" : "Not reported"] : [])]; });
    const hasProcedures = day.shifts.some(item => item.procedures);
    const total = day.shifts.reduce((sum, item) => sum + (item.procedures?.total ?? 0), 0);
    if (y > 580) { doc.addPage(); title("Daily Operational Detail (continued)"); y = 66; }
    autoTable(doc, { startY: y, margin: { top: 36, bottom: 42, left: 36, right: 36 }, head: [[{ content: `${day.date}${data.view !== "rvu" ? hasProcedures ? ` | ${total} Procedures` : " | No procedure updates" : ""}`, colSpan: head.length }], head], body, theme: "grid", styles: { fontSize: 8, cellPadding: 5, lineColor: [210, 220, 225] }, headStyles: { fillColor: [235, 244, 247], textColor: [21, 60, 75] }, columnStyles: data.view === "both" ? { 0: { cellWidth: 35 }, 1: { cellWidth: 44 }, 2: { cellWidth: 51 }, 3: { cellWidth: 42 }, 4: { cellWidth: 44 }, 5: { cellWidth: 64 }, 6: { cellWidth: 55 }, 7: { cellWidth: 205 } } : {}, rowPageBreak: "avoid", pageBreak: "avoid", didParseCell: cell => { if (cell.section === "body" && data.view !== "procedures" && [4, 5].includes(cell.column.index)) { const row = day.shifts[cell.row.index]?.staffing; if (row) cell.cell.styles.textColor = row.metNeed ? [4, 120, 87] : [190, 18, 60]; } }, didDrawPage: hook => { y = (hook.cursor?.y ?? y) + 12; } });
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFontSize(8); doc.setTextColor(90); doc.text(`WHHS | ${reportTitle(data.view)} | Page ${page} of ${pages}`, 36, 773); }
  return doc;
}

export async function buildOperationalWorkbook(data: OperationalReport, now = new Date()) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook(); book.creator = "WHHS"; book.created = now;
  const sheet = (name: string, headers: string[]) => { const result = book.addWorksheet(name); result.addRow(headers); result.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; result.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155E75" } }; result.views = [{ state: "frozen", ySplit: 1 }]; return result; };
  const summary = sheet("Summary", ["Metric", "Value", "Shift"]);
  summary.addRow([reportTitle(data.view)]); summary.addRow(["Start Date", data.start]); summary.addRow(["End Date", data.end]); summary.addRow(["Generated", metricExportData([], "custom", now).generated]);
  if (data.view !== "procedures") metricExportData(data.rows, "custom", now).summary.forEach(item => { [["Average Staff On Shift", item.averageRtsOn], ["Average Staff Needed", item.averageRtsNeeded], ["Average RVUs", item.averageRvus], ["Coverage Rate", item.percentageMeetingNeed === null ? null : item.percentageMeetingNeed / 100]].forEach(([metric, value]) => { const row = summary.addRow([metric, value, item.name]); row.getCell(2).numFmt = metric === "Coverage Rate" ? "0.0%" : "0.0"; }); });
  if (data.view !== "rvu") {
    const report = data.procedures;
    [["Total Procedures", report.selected.total], ["Day Shift Procedures", report.selected.dayTotal], ["Night Shift Procedures", report.selected.nightTotal], [data.custom ? "Change vs Previous Period" : "Change vs Previous Month", report.comparison.difference], ["Average per Day", report.selected.dailyAverage]].forEach(row => { const added = summary.addRow(row); if (row[0] === "Average per Day") added.getCell(2).numFmt = "0.0"; });
    const types = sheet("Procedures by Type", ["Procedure", "Selected", "Previous", "Change", "Change %", "Share"]);
    types.addRow(["Selected period", report.selectedPeriodLabel]); types.addRow(["Previous period", report.comparisonPeriodLabel]);
    report.typeComparisons.forEach(item => { const row = types.addRow([item.label, item.selectedTotal, item.previousTotal, item.difference, item.percentage === null ? null : item.percentage / 100, item.share / 100]); row.getCell(5).numFmt = "0.0%"; row.getCell(6).numFmt = "0.0%"; row.getCell(4).font = { color: { argb: item.difference > 0 ? "FF047857" : item.difference < 0 ? "FFBE123C" : "FF475569" } }; });
    const trend = sheet("Monthly Trend", ["Month", "Procedures", "Average per Day", "Status"]);
    report.trend.forEach(item => { const row = trend.addRow([item.month, item.total, item.dailyAverage, item.status]); row.getCell(3).numFmt = "0.0"; });
  }
  const detail = sheet("Daily Operational Detail", ["Date", "Shift", ...(data.view !== "procedures" ? ["RVUs", "RTs Needed", "RTs On Shift", "Variance", "Staffing Status"] : []), ...(data.view !== "rvu" ? ["Procedures", "Procedure Update", ...PROCEDURE_TYPES.map(type => type.label)] : [])]);
  dailyRows(data).forEach(day => day.shifts.forEach(item => { const staffing = item.staffing, procedures = item.procedures; const row = detail.addRow([new Date(`${day.date}T00:00:00Z`), item.shift === "day" ? "Day" : "Night", ...(data.view !== "procedures" ? [staffing?.rvuTotal ?? null, staffing?.exactRtsNeeded ?? null, staffing?.rts_on ?? null, staffing?.staffingVariance ?? null, staffing ? staffing.metNeed ? "Met Need" : "Below Need" : "Not reported"] : []), ...(data.view !== "rvu" ? [procedures?.total ?? null, procedures ? "Reported" : "Not reported", ...PROCEDURE_TYPES.map(type => procedures?.counts[type.id] ?? null)] : [])]); row.getCell(1).numFmt = "mmm d, yyyy"; if (data.view !== "procedures") { row.getCell(3).numFmt = "0.00"; [4, 5, 6].forEach(col => { row.getCell(col).numFmt = "0.0"; }); if (staffing) [6, 7].forEach(col => { row.getCell(col).font = { color: { argb: staffing.metNeed ? "FF047857" : "FFBE123C" } }; }); } }));
  detail.autoFilter = { from: "A1", to: { row: detail.rowCount, column: detail.columnCount } };
  book.worksheets.forEach(worksheet => { worksheet.columns.forEach(column => { column.width = 22; }); worksheet.getColumn(1).width = 30; worksheet.eachRow(row => { row.height = 30; row.alignment = { vertical: "middle", wrapText: true }; }); worksheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }; worksheet.pageSetup.printTitlesRow = "1:1"; });
  return book;
}

export async function downloadOperationalReport(data: OperationalReport, format: "pdf" | "xlsx") {
  if (format === "pdf") { const doc = await buildOperationalPdf(data); doc.save(`${operationalFilename(data)}.pdf`); return; }
  const book = await buildOperationalWorkbook(data);
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = `${operationalFilename(data)}.xlsx`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
