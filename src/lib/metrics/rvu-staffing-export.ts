import { formatOneDecimal, metricDateRanges, summarizeMetricRows, type CalculatedRvuStaffingRow, type MetricDateRange } from "./rvu-staffing";

const summaryHeaders = ["Shift", "Reported Shifts", "Average RVUs", "Average RTs Needed", "Average RTs On Shift", "Coverage Rate"];
const detailHeaders = ["Reporting Date", "Shift", "RVUs", "RTs Needed", "RTs On Shift", "Variance", "Status"];
const shiftName = (shift: string) => shift === "day" ? "Day" : "Night";

export function metricExportData(rows: CalculatedRvuStaffingRow[], range: MetricDateRange, now = new Date(), appliedRangeLabel?: string) {
  const sorted = [...rows].sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.shift_type.localeCompare(b.shift_type));
  const dates = sorted.length ? `${sorted[0].shift_date} to ${sorted[sorted.length - 1].shift_date}` : "No reported shifts";
  const rangeLabel = appliedRangeLabel ?? metricDateRanges.find(option => option.value === range)!.label;
  const generated = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(now) + " PT";
  const summary = (["day", "night"] as const).map(shift => ({ name: shiftName(shift), ...summarizeMetricRows(sorted.filter(row => row.shift_type === shift)) }));
  return { sorted, dates, rangeLabel, generated, summary, filename: `WHHS-RVU-Staffing-${appliedRangeLabel?.startsWith("Monthly:") ? "monthly" : range}-${sorted[0]?.shift_date ?? "empty"}-to-${sorted[sorted.length - 1]?.shift_date ?? "empty"}` };
}

export async function buildMetricsWorkbook(rows: CalculatedRvuStaffingRow[], range: MetricDateRange, now = new Date(), appliedRangeLabel?: string) {
  const { default: ExcelJS } = await import("exceljs");
  const data = metricExportData(rows, range, now, appliedRangeLabel);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WHHS";
  workbook.created = now;
  const summary = workbook.addWorksheet("Summary");
  summary.addRow(["WHHS RVU & Staffing Metrics"]);
  summary.addRow([`Applied range: ${data.rangeLabel}`]);
  summary.addRow([`Reported dates: ${data.dates}`]);
  summary.addRow([`Generated: ${data.generated}`]);
  summary.addRow([]);
  summary.addRow(summaryHeaders);
  data.summary.forEach(item => summary.addRow([item.name, item.shiftCount, item.averageRvus, item.averageRtsNeeded, item.averageRtsOn, item.percentageMeetingNeed === null ? null : item.percentageMeetingNeed / 100]));
  summary.columns.forEach((col, index) => { col.width = index === 0 ? 19 : 23; });
  [7, 8].forEach(row => { [3, 4, 5].forEach(col => { summary.getCell(row, col).numFmt = "0.0"; }); summary.getCell(row, 6).numFmt = "0.0%"; });
  for (let row = 1; row <= 4; row++) summary.mergeCells(row, 1, row, 6);
  summary.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF155E75" } };
  summary.getRow(1).height = 30;

  const detail = workbook.addWorksheet("Shift Detail");
  detail.addRow(detailHeaders);
  data.sorted.forEach(item => {
    const row = detail.addRow([new Date(`${item.shift_date}T00:00:00Z`), shiftName(item.shift_type), item.rvuTotal, item.exactRtsNeeded, item.rts_on, item.staffingVariance, item.metNeed ? "Met Need" : "Below Need"]);
    row.getCell(1).numFmt = "mmm d, yyyy";
    row.getCell(3).numFmt = "0.00";
    [4, 5, 6].forEach(col => { row.getCell(col).numFmt = "0.0"; });
    [6, 7].forEach(col => { row.getCell(col).font = { bold: true, color: { argb: item.metNeed ? "FF047857" : "FFBE123C" } }; });
  });
  detail.columns.forEach(col => { col.width = 20; });
  detail.autoFilter = { from: "A1", to: `G${detail.rowCount}` };
  for (const [sheet, header] of [[summary, 6], [detail, 1]] as const) {
    sheet.views = [{ state: "frozen", ySplit: header }];
    sheet.getRow(header).height = 32;
    sheet.getRow(header).eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155E75" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { wrapText: true, vertical: "middle" };
    });
    sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    sheet.eachRow((row, number) => { if (number > header && (sheet === detail || number <= 8)) { row.height = 24; row.eachCell(cell => { cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } }; }); } });
  }
  detail.pageSetup.printTitlesRow = "1:1";
  return workbook;
}

export async function buildMetricsPdf(rows: CalculatedRvuStaffingRow[], range: MetricDateRange, now = new Date(), appliedRangeLabel?: string, summaryOnly = false, reportHeading = "WHHS RVU & Staffing Metrics") {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const data = metricExportData(rows, range, now, appliedRangeLabel);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const title = (label: string, y: number) => { doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(21, 94, 117); doc.text(label, 36, y); };
  title(reportHeading, 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(51, 65, 85);
  doc.text([`Applied range: ${data.rangeLabel} | Both shifts`, `Reported dates: ${data.dates}`, `Generated: ${data.generated}`], 36, 58);
  if (summaryOnly) {
    data.summary.forEach((item, index) => {
      const x = 36 + index * 276;
      doc.setDrawColor(180, 200, 210); doc.roundedRect(x, 104, 264, 105, 6, 6);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(21, 94, 117); doc.text(`${item.name} Shift`, x + 10, 120);
      const values = [["Average Staff On Shift", formatOneDecimal(item.averageRtsOn)], ["Average Staff Needed", formatOneDecimal(item.averageRtsNeeded)], ["Average Shift RVU", formatOneDecimal(item.averageRvus)], ["Coverage Rate", item.percentageMeetingNeed === null ? "N/A" : `${formatOneDecimal(item.percentageMeetingNeed)}%`]];
      values.forEach(([label, value], cell) => { const xx = x + 10 + (cell % 2) * 130, yy = 136 + Math.floor(cell / 2) * 36; doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(70); doc.text(label, xx, yy); doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(20, 34, 56); doc.text(value, xx, yy + 15); });
    });
  } else {
  title("Day vs Night Comparison", 110);
  autoTable(doc, { startY: 120, margin: 36, head: [summaryHeaders], body: data.summary.map(item => [item.name, item.shiftCount, formatOneDecimal(item.averageRvus), formatOneDecimal(item.averageRtsNeeded), formatOneDecimal(item.averageRtsOn), item.percentageMeetingNeed === null ? "N/A" : `${formatOneDecimal(item.percentageMeetingNeed)}%`]), styles: { fontSize: 9, cellPadding: 7 }, headStyles: { fillColor: [21, 94, 117] } });
  }
  // Vector charts stay sharp in a printed or forwarded PDF. Missing shifts are gaps, never zeroes.
  const dates = Array.from(new Set(data.sorted.map(row => row.shift_date)));
  const chart = (heading: string, y: number, series: { label: string; color: [number, number, number]; values: (number | null)[] }[]) => {
    title(heading, y);
    const x = 65, top = y + 27, width = 490, height = 74;
    const max = Math.max(1, ...series.flatMap(line => line.values.filter((v): v is number => v !== null))) * 1.1;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    [0, .5, 1].forEach(fraction => { const yy = top + height * (1 - fraction); doc.setDrawColor(210, 218, 225); doc.setLineWidth(.5); doc.line(x, yy, x + width, yy); doc.setTextColor(70); doc.text((max * fraction).toFixed(1), x - 7, yy + 3, { align: "right" }); });
    series.forEach((line, index) => {
      doc.setTextColor(...line.color); doc.text(line.label, x + index * 190, y + 15);
      doc.setDrawColor(...line.color); doc.setFillColor(...line.color); doc.setLineWidth(1.3);
      let previous: [number, number] | null = null;
      line.values.forEach((value, index) => { if (value === null) { previous = null; return; } const point: [number, number] = [x + (dates.length === 1 ? width / 2 : index * width / Math.max(1, dates.length - 1)), top + height * (1 - value / max)]; if (previous) doc.line(...previous, ...point); if (dates.length < 45) doc.circle(...point, 1.7, "F"); previous = point; });
    });
    doc.setTextColor(70); if (dates.length) { doc.text(dates[0], x, top + height + 13); doc.text(dates[dates.length - 1], x + width, top + height + 13, { align: "right" }); }
  };
  const values = (shift: "day" | "night", field: "rvuTotal" | "exactRtsNeeded" | "rts_on") => { const map = new Map(data.sorted.filter(row => row.shift_type === shift).map(row => [row.shift_date, row[field]])); return dates.map(date => map.get(date) ?? null); };
  chart("RVU Trend", 228, [{ label: "Day", color: [3, 105, 161], values: values("day", "rvuTotal") }, { label: "Night", color: [109, 40, 217], values: values("night", "rvuTotal") }]);
  (["day", "night"] as const).forEach((shift, index) => chart(`Staffing Trend - ${shiftName(shift)} Shift`, 370 + index * 142, [{ label: "RTs Needed", color: [3, 105, 161], values: values(shift, "exactRtsNeeded") }, { label: "RTs On Shift", color: [4, 120, 87], values: values(shift, "rts_on") }]));
  if (summaryOnly) return doc;
  doc.addPage(); title("Reporting-Window Detail", 40);
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(70); doc.text(`${data.dates} | ${rows.length} reported shifts | Both shifts`, 36, 57);
  autoTable(doc, { startY: 70, margin: { top: 36, bottom: 40, left: 36, right: 36 }, head: [detailHeaders], body: data.sorted.map(row => [row.shift_date, shiftName(row.shift_type), row.rvuTotal, formatOneDecimal(row.exactRtsNeeded), formatOneDecimal(row.rts_on), formatOneDecimal(row.staffingVariance), row.metNeed ? "Met Need" : "Below Need"]), styles: { fontSize: 9, cellPadding: 6 }, headStyles: { fillColor: [21, 94, 117] }, didParseCell: cell => { if (cell.section === "body" && cell.column.index >= 5) cell.cell.styles.textColor = data.sorted[cell.row.index].metNeed ? [4, 120, 87] : [190, 18, 60]; } });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFontSize(8); doc.setTextColor(90); doc.text(`WHHS | RVU & Staffing Metrics | Page ${page} of ${pages}`, 36, 773); }
  return doc;
}

export async function downloadMetrics(rows: CalculatedRvuStaffingRow[], range: MetricDateRange, format: "pdf" | "xlsx", appliedRangeLabel?: string) {
  const data = metricExportData(rows, range, new Date(), appliedRangeLabel);
  if (format === "pdf") { const doc = await buildMetricsPdf(rows, range, new Date(), appliedRangeLabel); doc.save(`${data.filename}.pdf`); return; }
  const workbook = await buildMetricsWorkbook(rows, range, new Date(), appliedRangeLabel);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = `${data.filename}.xlsx`; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
