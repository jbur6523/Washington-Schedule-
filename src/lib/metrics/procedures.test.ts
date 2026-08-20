// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildProcedureMetricsReport,
  monthForInstant,
  parseProcedureMonth,
  previousMonth,
  procedureMonthQueryRange,
  summarizeProcedureMonth,
  type ProcedureMetricRow
} from "@/lib/metrics/procedures";

function procedureRow(overrides: Partial<ProcedureMetricRow> = {}): ProcedureMetricRow {
  return {
    id: "row-1",
    shift_date: "2026-08-01",
    shift_type: "day",
    is_canonical: true,
    c_section_count: 0,
    vaginal_delivery_count: 0,
    cabg_count: 0,
    bronch_count: 0,
    sputum_induction_count: 0,
    other_procedure_count: 8,
    created_at: "2026-08-01T14:00:00.000Z",
    updated_at: "2026-08-01T14:00:00.000Z",
    ...overrides
  };
}

const septemberNow = new Date("2026-09-15T19:00:00.000Z");

describe("procedure metric canonical aggregation", () => {
  it("counts a Day shift with 8 procedures as 8", () => {
    const summary = summarizeProcedureMonth([procedureRow()], "2026-08", septemberNow);
    expect(summary.dayTotal).toBe(8);
    expect(summary.total).toBe(8);
  });

  it("verifies an edit from 8 to 10 contributes exactly 10, not 18", () => {
    const original = procedureRow({ id: "original", is_canonical: false, other_procedure_count: 8 });
    const edited = procedureRow({
      id: "edited",
      is_canonical: true,
      other_procedure_count: 10,
      updated_at: "2026-08-02T14:00:00.000Z"
    });

    expect(summarizeProcedureMonth([original, edited], "2026-08", septemberNow).total).toBe(10);
  });

  it("adds Day and Night values on the same represented date", () => {
    const summary = summarizeProcedureMonth([
      procedureRow({ id: "day", other_procedure_count: 8 }),
      procedureRow({ id: "night", shift_type: "night", other_procedure_count: 5 })
    ], "2026-08", septemberNow);

    expect(summary.days[0]).toEqual({ date: "2026-08-01", day: 8, night: 5, total: 13 });
    expect(summary.total).toBe(13);
  });

  it("ignores multiple noncanonical historical revisions", () => {
    const rows = [
      procedureRow({ id: "revision-1", is_canonical: false, other_procedure_count: 6 }),
      procedureRow({ id: "revision-2", is_canonical: false, other_procedure_count: 8 }),
      procedureRow({ id: "current", other_procedure_count: 10 })
    ];
    expect(summarizeProcedureMonth(rows, "2026-08", septemberNow).total).toBe(10);
  });

  it("distinguishes an explicit zero-procedure shift from no submission", () => {
    const summary = summarizeProcedureMonth([
      procedureRow({ other_procedure_count: 0 })
    ], "2026-08", septemberNow);

    expect(summary.days[0]).toEqual({ date: "2026-08-01", day: 0, night: null, total: 0 });
    expect(summary.days[1]).toEqual({ date: "2026-08-02", day: null, night: null, total: 0 });
    expect(summary.completedShifts).toBe(1);
  });

  it("attributes a late September edit to its represented August operational month", () => {
    const lateEdit = procedureRow({
      shift_date: "2026-08-31",
      shift_type: "night",
      other_procedure_count: 9,
      created_at: "2026-08-31T20:00:00.000Z",
      updated_at: "2026-09-03T17:00:00.000Z"
    });

    expect(summarizeProcedureMonth([lateEdit], "2026-08", septemberNow).nightTotal).toBe(9);
    expect(summarizeProcedureMonth([lateEdit], "2026-09", septemberNow).total).toBe(0);
  });

  it("keeps Day and Night subtotals equal to the monthly total", () => {
    const summary = summarizeProcedureMonth([
      procedureRow({ id: "day", c_section_count: 2, other_procedure_count: 6 }),
      procedureRow({ id: "night", shift_type: "night", bronch_count: 2, other_procedure_count: 3 })
    ], "2026-08", septemberNow);

    expect(summary.dayTotal).toBe(8);
    expect(summary.nightTotal).toBe(5);
    expect(summary.dayTotal + summary.nightTotal).toBe(summary.total);
  });
});

describe("procedure metric calendar boundaries", () => {
  it("uses America/Los_Angeles for the current month boundary", () => {
    expect(monthForInstant(new Date("2026-09-01T06:59:59.999Z"))).toBe("2026-08");
    expect(monthForInstant(new Date("2026-09-01T07:00:00.000Z"))).toBe("2026-09");
    expect(procedureMonthQueryRange("2026-08", new Date("2026-09-01T06:59:59.999Z"))).toEqual({
      minimumShiftDate: "2026-07-01",
      maximumShiftDate: "2026-08-31"
    });
  });

  it("uses elapsed Pacific calendar days for the current month average", () => {
    const now = new Date("2026-08-20T19:00:00.000Z");
    const summary = summarizeProcedureMonth([procedureRow({ other_procedure_count: 10 })], "2026-08", now);
    expect(summary.calendarDaysRepresented).toBe(20);
    expect(summary.dailyAverage).toBe(0.5);
  });

  it("handles December-to-January month boundaries", () => {
    expect(previousMonth("2027-01")).toBe("2026-12");
    expect(procedureMonthQueryRange("2027-01", new Date("2027-02-15T20:00:00.000Z"))).toEqual({
      minimumShiftDate: "2026-12-01",
      maximumShiftDate: "2027-01-31"
    });
  });

  it("makes future-month navigation unavailable by parsing it to the current month", () => {
    const now = new Date("2026-08-20T19:00:00.000Z");
    expect(parseProcedureMonth("2026-09", now)).toBe("2026-08");
    expect(parseProcedureMonth("invalid", now)).toBe("2026-08");
  });
});

describe("previous-month procedure comparison", () => {
  it("calculates the previous total, absolute difference, and percentage", () => {
    const rows = [
      procedureRow({ id: "previous", shift_date: "2026-07-01", other_procedure_count: 8 }),
      procedureRow({ id: "selected", shift_date: "2026-08-01", other_procedure_count: 10 })
    ];
    const report = buildProcedureMetricsReport(rows, "2026-08", septemberNow);

    expect(report.previous.total).toBe(8);
    expect(report.comparison.difference).toBe(2);
    expect(report.comparison.percentage).toBe(25);
  });

  it("does not produce Infinity or NaN when the previous total is zero", () => {
    const report = buildProcedureMetricsReport([procedureRow({ other_procedure_count: 10 })], "2026-08", septemberNow);
    expect(report.previous.total).toBe(0);
    expect(report.comparison.difference).toBe(10);
    expect(report.comparison.percentage).toBeNull();
    expect(JSON.stringify(report.comparison)).not.toMatch(/Infinity|NaN/);
  });
});
