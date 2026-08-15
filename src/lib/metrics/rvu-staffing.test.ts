// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  calculateMetricRows,
  canonicalMetricRows,
  exactRtsNeededFromRvus,
  groupMetricRows,
  minimumShiftDateForRange,
  parseMetricDateRange,
  parseMetricShiftFilter,
  roundStaffingToOneDecimal,
  rtsNeededFromRvus,
  seasonForReportingDate,
  summarizeMetricRows,
  type RvuStaffingMetricRow
} from "@/lib/metrics/rvu-staffing";

function metricRow(overrides: Partial<RvuStaffingMetricRow> = {}): RvuStaffingMetricRow {
  return {
    id: "row-1",
    shift_date: "2026-08-01",
    shift_type: "day",
    rvu_total: 154,
    rts_on: 6,
    created_at: "2026-08-01T11:00:00.000Z",
    updated_at: "2026-08-01T11:00:00.000Z",
    ...overrides
  };
}

describe("RVU staffing formula", () => {
  it("uses divisor 27 and normal one-decimal rounding", () => {
    expect(exactRtsNeededFromRvus(154)).toBeCloseTo(154 / 27);
    expect(rtsNeededFromRvus("154")).toBe(5.7);
    expect(rtsNeededFromRvus("182")).toBe(6.7);
    expect(rtsNeededFromRvus("187")).toBe(6.9);
    expect(rtsNeededFromRvus("188.65")).toBe(7);
    expect(roundStaffingToOneDecimal(6.84)).toBe(6.8);
    expect(roundStaffingToOneDecimal(6.85)).toBe(6.9);
  });

  it("rejects blank, negative, and malformed RVUs", () => {
    expect(rtsNeededFromRvus(0)).toBe(0);
    expect(rtsNeededFromRvus("")).toBeNull();
    expect(rtsNeededFromRvus("-1")).toBeNull();
    expect(rtsNeededFromRvus("not-a-number")).toBeNull();
    expect(rtsNeededFromRvus("Infinity")).toBeNull();
  });
});

describe("RVU staffing analytics", () => {
  it("uses only the latest canonical row per reporting window and excludes null RVUs", () => {
    const oldCorrection = metricRow({ id: "old", rvu_total: 135, updated_at: "2026-08-01T12:00:00.000Z" });
    const currentCorrection = metricRow({ id: "current", rvu_total: 154, updated_at: "2026-08-01T13:00:00.000Z" });
    const unavailable = metricRow({ id: "null-rvu", shift_date: "2026-08-02", rvu_total: null });

    expect(canonicalMetricRows([oldCorrection, unavailable, currentCorrection])).toHaveLength(2);
    const calculated = calculateMetricRows([oldCorrection, unavailable, currentCorrection]);
    expect(calculated).toHaveLength(1);
    expect(calculated[0]).toEqual(expect.objectContaining({ id: "current", rvuTotal: 154 }));
  });

  it("calculates summaries from exact needs and manual RTs On Shift", () => {
    const calculated = calculateMetricRows([
      metricRow({ id: "day", rvu_total: 154, rts_on: 6 }),
      metricRow({ id: "night", shift_date: "2026-08-02", shift_type: "night", rvu_total: 184, rts_on: 6 }),
      metricRow({ id: "day-2", shift_date: "2026-08-03", rvu_total: 188.65, rts_on: 7 })
    ]);
    const summary = summarizeMetricRows(calculated);

    expect(summary.shiftCount).toBe(3);
    expect(summary.averageRvus).toBeCloseTo((154 + 184 + 188.65) / 3);
    expect(summary.averageRtsNeeded).toBeCloseTo((154 / 27 + 184 / 27 + 188.65 / 27) / 3);
    expect(summary.averageRtsOn).toBeCloseTo(19 / 3);
    expect(summary.percentageMeetingNeed).toBeCloseTo(200 / 3);
    expect(summary.averageStaffingVariance).toBeCloseTo((6 - 154 / 27 + 6 - 184 / 27 + 7 - 188.65 / 27) / 3);
  });

  it("keeps standard season definitions centralized, including cross-year winter", () => {
    expect(seasonForReportingDate("2026-12-15")).toBe("Winter 2027");
    expect(seasonForReportingDate("2027-02-28")).toBe("Winter 2027");
    expect(seasonForReportingDate("2027-03-01")).toBe("Spring 2027");
    expect(seasonForReportingDate("2027-07-01")).toBe("Summer 2027");
    expect(seasonForReportingDate("2027-10-01")).toBe("Fall 2027");

    const groups = groupMetricRows(
      calculateMetricRows([
        metricRow({ id: "dec", shift_date: "2026-12-15" }),
        metricRow({ id: "feb", shift_date: "2027-02-01" })
      ]),
      (row) => row.season
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Winter 2027");
    expect(groups[0].summary.shiftCount).toBe(2);
  });

  it("parses safe filter defaults and inclusive date windows", () => {
    expect(parseMetricDateRange(undefined)).toBe("30");
    expect(parseMetricDateRange("invalid")).toBe("30");
    expect(parseMetricDateRange("365")).toBe("365");
    expect(parseMetricShiftFilter(undefined)).toBe("all");
    expect(parseMetricShiftFilter("night")).toBe("night");
    expect(parseMetricShiftFilter("invalid")).toBe("all");
    expect(minimumShiftDateForRange("7", "2026-08-14")).toBe("2026-08-08");
    expect(minimumShiftDateForRange("30", "2026-08-14")).toBe("2026-07-16");
    expect(minimumShiftDateForRange("all", "2026-08-14")).toBeNull();
  });
});
