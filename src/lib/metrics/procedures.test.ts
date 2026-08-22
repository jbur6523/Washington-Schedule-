// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  PROCEDURE_TYPES,
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
    shift_date: "2026-08-14",
    shift_type: "day",
    is_canonical: true,
    c_section_count: 0,
    vaginal_delivery_count: 0,
    cabg_count: 0,
    bronch_count: 0,
    sputum_induction_count: 0,
    other_procedure_count: 0,
    created_at: "2026-08-14T14:00:00.000Z",
    updated_at: "2026-08-14T14:00:00.000Z",
    ...overrides
  };
}

const septemberNow = new Date("2026-09-15T19:00:00.000Z");

describe("procedure metric canonical aggregation", () => {
  it("includes every persisted Shift Update procedure type with its current label", () => {
    expect(PROCEDURE_TYPES).toEqual([
      expect.objectContaining({ field: "c_section_count", label: "C-Sections" }),
      expect.objectContaining({ field: "vaginal_delivery_count", label: "Vaginal Deliveries" }),
      expect.objectContaining({ field: "cabg_count", label: "CABG" }),
      expect.objectContaining({ field: "bronch_count", label: "Bronchs" }),
      expect.objectContaining({ field: "sputum_induction_count", label: "Sputum Inductions" }),
      expect.objectContaining({ field: "other_procedure_count", label: "MRI" })
    ]);
  });

  it("makes the monthly total equal the sum of every procedure type", () => {
    const summary = summarizeProcedureMonth([
      procedureRow({
        c_section_count: 1,
        vaginal_delivery_count: 2,
        cabg_count: 3,
        bronch_count: 4,
        sputum_induction_count: 5,
        other_procedure_count: 6
      })
    ], "2026-08", septemberNow);

    expect(summary.counts).toEqual({
      cSections: 1,
      vaginalDeliveries: 2,
      cabg: 3,
      bronchs: 4,
      sputumInductions: 5,
      mri: 6
    });
    expect(Object.values(summary.counts).reduce((total, value) => total + value, 0)).toBe(21);
    expect(summary.total).toBe(21);
  });

  it("aggregates Day and Night shifts separately and together", () => {
    const summary = summarizeProcedureMonth([
      procedureRow({ id: "day", bronch_count: 8 }),
      procedureRow({ id: "night", shift_type: "night", other_procedure_count: 5 })
    ], "2026-08", septemberNow);

    expect(summary.days[0].day?.total).toBe(8);
    expect(summary.days[0].night?.total).toBe(5);
    expect(summary.days[0].total).toBe(13);
    expect(summary.dayTotal).toBe(8);
    expect(summary.nightTotal).toBe(5);
    expect(summary.total).toBe(13);
  });

  it("replaces an edited canonical shift instead of adding the prior contribution", () => {
    const original = procedureRow({ id: "original", is_canonical: false, bronch_count: 2, other_procedure_count: 1 });
    const edited = procedureRow({
      id: "edited",
      bronch_count: 3,
      other_procedure_count: 1,
      updated_at: "2026-08-02T14:00:00.000Z"
    });

    expect(summarizeProcedureMonth([original, edited], "2026-08", septemberNow).total).toBe(4);
  });

  it("deduplicates repeated canonical snapshots defensively by newest update", () => {
    const firstSave = procedureRow({ id: "save-1", bronch_count: 2 });
    const repeatedSave = procedureRow({
      id: "save-2",
      bronch_count: 2,
      updated_at: "2026-08-01T15:00:00.000Z"
    });

    expect(summarizeProcedureMonth([firstSave, repeatedSave], "2026-08", septemberNow).total).toBe(2);
  });

  it("ignores historical revisions and audit copies", () => {
    const rows = [
      procedureRow({ id: "revision-1", is_canonical: false, bronch_count: 6 }),
      procedureRow({ id: "revision-2", is_canonical: false, bronch_count: 8 }),
      procedureRow({ id: "current", bronch_count: 10 })
    ];
    expect(summarizeProcedureMonth(rows, "2026-08", septemberNow).total).toBe(10);
  });

  it("distinguishes a submitted zero shift from no submission", () => {
    const summary = summarizeProcedureMonth([procedureRow()], "2026-08", septemberNow);

    expect(summary.days[0].day).toEqual(expect.objectContaining({ total: 0 }));
    expect(summary.days[0].night).toBeNull();
    expect(summary.days[1].day).toBeNull();
    expect(summary.reportedShifts).toBe(1);
  });

  it("excludes every operational date before true tracking began", () => {
    const summary = summarizeProcedureMonth([
      procedureRow({ id: "before-cutoff", shift_date: "2026-08-13", bronch_count: 100 }),
      procedureRow({ id: "cutoff", shift_date: "2026-08-14", bronch_count: 4 })
    ], "2026-08", septemberNow);

    expect(summary.days[0].date).toBe("2026-08-14");
    expect(summary.total).toBe(4);
  });

  it("keeps a late edit in its represented operational month", () => {
    const lateEdit = procedureRow({
      shift_date: "2026-08-31",
      shift_type: "night",
      other_procedure_count: 9,
      updated_at: "2026-09-03T17:00:00.000Z"
    });

    expect(summarizeProcedureMonth([lateEdit], "2026-08", septemberNow).nightTotal).toBe(9);
    expect(summarizeProcedureMonth([lateEdit], "2026-09", septemberNow).total).toBe(0);
  });

  it("reconciles category, daily, and canonical shift totals", () => {
    const summary = summarizeProcedureMonth([
      procedureRow({ id: "day", c_section_count: 2, other_procedure_count: 6 }),
      procedureRow({ id: "night", shift_type: "night", bronch_count: 2, other_procedure_count: 3 })
    ], "2026-08", septemberNow);

    expect(Object.values(summary.counts).reduce((total, value) => total + value, 0)).toBe(summary.total);
    expect(summary.days.reduce((total, day) => total + day.total, 0)).toBe(summary.total);
    expect(summary.dayTotal + summary.nightTotal).toBe(summary.total);
  });
});

describe("procedure metric calendar boundaries and averages", () => {
  it("uses America/Los_Angeles for current-month boundaries", () => {
    expect(monthForInstant(new Date("2026-09-01T06:59:59.999Z"))).toBe("2026-08");
    expect(monthForInstant(new Date("2026-09-01T07:00:00.000Z"))).toBe("2026-09");
    expect(procedureMonthQueryRange("2026-08", new Date("2026-09-01T06:59:59.999Z"))).toEqual({
      minimumShiftDate: "2026-08-14",
      maximumShiftDate: "2026-08-31"
    });
  });

  it("calculates current-month average per elapsed calendar day", () => {
    const now = new Date("2026-08-20T19:00:00.000Z");
    const summary = summarizeProcedureMonth([procedureRow({ bronch_count: 10 })], "2026-08", now);
    expect(summary.calendarDaysRepresented).toBe(7);
    expect(summary.dailyAverage).toBeCloseTo(10 / 7);
  });

  it("calculates average per reported shift and counts a submitted zero", () => {
    const summary = summarizeProcedureMonth([
      procedureRow({ id: "positive", bronch_count: 10 }),
      procedureRow({ id: "zero", shift_type: "night" })
    ], "2026-08", septemberNow);

    expect(summary.reportedShifts).toBe(2);
    expect(summary.reportedShiftAverage).toBe(5);
  });

  it("handles December-to-January transitions", () => {
    expect(previousMonth("2027-01")).toBe("2026-12");
    expect(procedureMonthQueryRange("2027-01", new Date("2027-02-15T20:00:00.000Z"))).toEqual({
      minimumShiftDate: "2026-08-14",
      maximumShiftDate: "2027-01-31"
    });
  });

  it("rejects future and malformed month parameters", () => {
    const now = new Date("2026-08-20T19:00:00.000Z");
    expect(parseProcedureMonth("2026-09", now)).toBe("2026-08");
    expect(parseProcedureMonth("2026-07", now)).toBe("2026-08");
    expect(parseProcedureMonth("invalid", now)).toBe("2026-08");
  });
});

describe("procedure comparisons and historical trend", () => {
  it("does not compare the initial partial month with pre-tracking data", () => {
    const now = new Date("2026-08-20T19:00:00.000Z");
    const report = buildProcedureMetricsReport([
      procedureRow({ id: "previous-in-range", shift_date: "2026-07-20", bronch_count: 8 }),
      procedureRow({ id: "previous-out-of-range", shift_date: "2026-07-21", bronch_count: 100 }),
      procedureRow({ id: "selected", bronch_count: 10 })
    ], "2026-08", now);

    expect(report.comparisonPeriodLabel).toBe("No tracked prior period");
    expect(report.previous.total).toBe(0);
    expect(report.comparison).toEqual({ difference: 10, percentage: null });
  });

  it("compares a completed historical month with the entire previous month", () => {
    const report = buildProcedureMetricsReport([
      procedureRow({ id: "previous-end", shift_date: "2026-08-31", bronch_count: 8 }),
      procedureRow({ id: "selected", shift_date: "2026-09-30", bronch_count: 10 })
    ], "2026-09", new Date("2026-10-15T19:00:00.000Z"));

    expect(report.comparisonPeriodLabel).toBe("August 14–31");
    expect(report.previous.calendarDaysRepresented).toBe(18);
    expect(report.previous.total).toBe(8);
  });

  it("calculates procedure-type differences, percentages, and shares", () => {
    const report = buildProcedureMetricsReport([
      procedureRow({ id: "previous", shift_date: "2026-08-14", bronch_count: 4, other_procedure_count: 6 }),
      procedureRow({ id: "selected", shift_date: "2026-09-01", bronch_count: 6, other_procedure_count: 4 })
    ], "2026-09", new Date("2026-10-15T19:00:00.000Z"));
    const bronchs = report.typeComparisons.find((procedure) => procedure.id === "bronchs");

    expect(bronchs).toEqual(expect.objectContaining({
      selectedTotal: 6,
      previousTotal: 4,
      difference: 2,
      percentage: 50,
      share: 60
    }));
  });

  it("never produces Infinity or NaN when a previous value is zero", () => {
    const report = buildProcedureMetricsReport([
      procedureRow({ id: "previous-zero", shift_date: "2026-08-14" }),
      procedureRow({ id: "selected", shift_date: "2026-09-01", bronch_count: 10 })
    ], "2026-09", new Date("2026-10-15T19:00:00.000Z"));

    expect(report.comparison.percentage).toBeNull();
    expect(report.typeComparisons.find((procedure) => procedure.id === "bronchs")?.percentage).toBeNull();
    expect(JSON.stringify(report)).not.toMatch(/Infinity|NaN/);
  });

  it("uses the three most recent available completed months and excludes the current partial month", () => {
    const now = new Date("2027-05-20T19:00:00.000Z");
    const report = buildProcedureMetricsReport([
      procedureRow({ id: "jan", shift_date: "2027-01-01", bronch_count: 10 }),
      procedureRow({ id: "feb", shift_date: "2027-02-01", bronch_count: 20 }),
      procedureRow({ id: "mar", shift_date: "2027-03-01", bronch_count: 30 }),
      procedureRow({ id: "apr", shift_date: "2027-04-01", bronch_count: 40 }),
      procedureRow({ id: "may", shift_date: "2027-05-01", bronch_count: 500 })
    ], "2027-05", now);

    expect(report.threeMonthAverageMonths).toEqual(["2027-02", "2027-03", "2027-04"]);
    expect(report.threeMonthAverage).toBe(30);
    expect(report.trend.at(-1)).toEqual(expect.objectContaining({
      month: "2027-05",
      status: "month-to-date",
      rollingAverage: 30,
      rollingAverageMonthCount: 3
    }));
  });

  it("does not manufacture no-data historical months as zero-valued trend rows", () => {
    const report = buildProcedureMetricsReport([
      procedureRow({ id: "aug", shift_date: "2026-08-14", bronch_count: 10 }),
      procedureRow({ id: "oct", shift_date: "2026-10-01", bronch_count: 30 })
    ], "2026-10", new Date("2026-11-15T19:00:00.000Z"));

    expect(report.trend.map((month) => month.month)).toEqual(["2026-08", "2026-10"]);
    expect(report.trend.some((month) => month.month === "2026-09")).toBe(false);
  });
});
