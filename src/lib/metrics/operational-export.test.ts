// @vitest-environment node
import { expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { calculateMetricRows } from "./rvu-staffing";
import { buildProcedureMetricsReport, type ProcedureMetricRow } from "./procedures";
import { buildOperationalPdf, buildOperationalWorkbook, type OperationalReport } from "./operational-export";
const now = new Date("2026-10-06T20:00:00Z");
const procedures: ProcedureMetricRow[] = Array.from({ length: 30 }, (_, index) => ({ id: String(index), shift_date: `2026-09-${String(index + 1).padStart(2, "0")}`, shift_type: "day", is_canonical: true, c_section_count: index % 2, vaginal_delivery_count: 1, cabg_count: 1, bronch_count: 1, sputum_induction_count: 1, other_procedure_count: 1 }));
const rows = calculateMetricRows(procedures.flatMap((row, index) => (["day", "night"] as const).map(shift => ({ id: `${index}-${shift}`, shift_date: row.shift_date, shift_type: shift, rvu_total: shift === "day" ? 270 : 135, rts_on: shift === "day" ? 9.6 : 4.5, created_at: row.shift_date, updated_at: row.shift_date }))));
const data: OperationalReport = { rows, procedures: buildProcedureMetricsReport(procedures, "2026-09", now), start: "2026-09-01", end: "2026-09-30", custom: false, view: "both" };
it("exports both metrics and every date without old detail sections", async () => {
  const pdf = await buildOperationalPdf(data, now);
  const text = pdf.output();
  expect(text).toContain("Procedure Metrics");
  expect(text).toContain("Daily Operational Detail");
  expect(text).not.toContain("Reporting-Window Detail");
  expect(text).not.toContain("Day vs Night Comparison");
  expect(text).not.toContain("Shifts without saved RVUs");
  expect(text.match(/\(Met Need\)/g)).toHaveLength(30);
  expect(text.match(/\(Below Need\)/g)).toHaveLength(30);
  const workbook = await buildOperationalWorkbook(data, now);
  const bytes = await workbook.xlsx.writeBuffer();
  const { default: ExcelJS } = await import("exceljs");
  const read = new ExcelJS.Workbook(); await read.xlsx.load(bytes);
  const details = read.getWorksheet("Daily Operational Detail")!;
  expect(details.rowCount).toBe(61);
  expect(details.getCell("C2").value).toBe(270);
  expect(details.getCell("H2").value).toBe(5);
  expect(details.getCell("H3").value).toBeNull();
  expect(details.getCell("I3").value).toBe("Not reported");
  expect(details.getCell("G3").value).toBe("Below Need");
  if (process.env.WHHS_EXPORT_CHECK_DIR) { writeFileSync(`${process.env.WHHS_EXPORT_CHECK_DIR}/operational-export-check.pdf`, Buffer.from(pdf.output("arraybuffer"))); writeFileSync(`${process.env.WHHS_EXPORT_CHECK_DIR}/operational-export-check.xlsx`, Buffer.from(bytes)); }
}, 20000);
it.each(["rvu", "procedures"] as const)("respects the %s view", async view => {
  const selected = { ...data, view };
  const pdf = (await buildOperationalPdf(selected, now)).output();
  const book = await buildOperationalWorkbook(selected, now);
  if (view === "rvu") { expect(pdf).not.toContain("Procedures by Type"); expect(book.getWorksheet("Procedures by Type")).toBeUndefined(); }
  else { expect(pdf).not.toContain("RTs Needed"); expect(book.getWorksheet("Daily Operational Detail")!.getRow(1).values).not.toContain("RVUs"); }
});
