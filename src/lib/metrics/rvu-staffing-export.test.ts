// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calculateMetricRows } from "./rvu-staffing";
import { buildMetricsPdf, buildMetricsWorkbook, metricExportData } from "./rvu-staffing-export";

const rows = calculateMetricRows([
  { id: "day", shift_date: "2026-10-01", shift_type: "day", rvu_total: 270, rts_on: 9.6, created_at: "2026-10-01", updated_at: "2026-10-01" },
  { id: "night", shift_date: "2026-10-01", shift_type: "night", rvu_total: 135, rts_on: 4.5, created_at: "2026-10-01", updated_at: "2026-10-01" },
  { id: "missing", shift_date: "2026-10-02", shift_type: "day", rvu_total: null, rts_on: 3, created_at: "2026-10-02", updated_at: "2026-10-02" }
]);

describe("RVU report exports", () => {
  it("preserves separate shift coverage and excluded missing RVUs", () => {
    const data = metricExportData(rows, "30");
    expect(data.sorted).toHaveLength(2);
    expect(data.summary.map(item => item.percentageMeetingNeed)).toEqual([100, 0]);
    expect(data.dates).toBe("2026-10-01 to 2026-10-01");
  });
  it("writes a real workbook with numeric detail and matching summaries", async () => {
    const workbook = await buildMetricsWorkbook(rows, "30");
    const buffer = await workbook.xlsx.writeBuffer();
    const { default: ExcelJS } = await import("exceljs");
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(buffer);
    expect(read.worksheets.map(sheet => sheet.name)).toEqual(["Summary", "Shift Detail"]);
    expect(read.getWorksheet("Summary")!.getCell("F7").value).toBe(1);
    expect(read.getWorksheet("Summary")!.getCell("F8").value).toBe(0);
    const detail = read.getWorksheet("Shift Detail")!;
    expect(detail.rowCount).toBe(3);
    expect(detail.getCell("C2").value).toBe(270);
    expect(detail.getCell("D2").value).toBe(10);
    expect(detail.getCell("G2").value).toBe("Met Need");
    expect(detail.getCell("G3").value).toBe("Below Need");
    expect(detail.getCell("A2").value).toBeInstanceOf(Date);
  }, 20000);
  it("handles a missing shift without treating it as zero coverage", async () => {
    const workbook = await buildMetricsWorkbook(rows.slice(0, 1), "30");
    expect(workbook.getWorksheet("Summary")!.getCell("F8").value).toBeNull();
  });
  it("paginates complete PDF detail without dropping rows", async () => {
    const many = Array.from({ length: 100 }, (_, index) => ({ ...rows[index % 2], id: String(index), shift_date: `2026-09-${String(index % 30 + 1).padStart(2, "0")}` }));
    const doc = await buildMetricsPdf(many, "custom");
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    const pdf = doc.output();
    expect(pdf).toContain("WHHS RVU & Staffing Metrics");
    expect(pdf).toContain("Reporting-Window Detail");
    expect(pdf.match(/\(Met Need\)/g)).toHaveLength(50);
    expect(pdf.match(/\(Below Need\)/g)).toHaveLength(50);
  });
});
