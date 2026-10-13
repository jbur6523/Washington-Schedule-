// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compareShiftRvus, rvuHistoryWindow } from "./rvu-comparison";
import type { RvuStaffingMetricRow } from "./rvu-staffing";

const current = { shift_date: "2026-10-12", shift_type: "night" as const, rvu_total: 100 };
const rows: RvuStaffingMetricRow[] = Array.from({ length: 10 }, (_, i) => ({
  id: String(i), shift_date: `2026-10-${String(i + 1).padStart(2, "0")}`, shift_type: "night",
  rvu_total: 100, rts_on: 4, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z"
}));
describe("shift RVU comparison", () => {
  it("uses the prior 15 calendar days across month boundaries", () => {
    expect(rvuHistoryWindow(current.shift_date)).toEqual({ minimumShiftDate: "2026-09-27", maximumShiftDate: "2026-10-11" });
  });
  it.each([[90, "Near average"], [110, "Near average"], [110.01, "Above average"], [89.99, "Below average"]])("classifies %s with inclusive ten-percent boundaries", (value, label) => {
    expect(compareShiftRvus({ ...current, rvu_total: value as number }, rows).label).toBe(label);
  });
  it("excludes the current shift, other shift types, and dates outside the window", () => {
    const extras = [
      { ...rows[0], id: "current", shift_date: current.shift_date, rvu_total: 999 },
      { ...rows[0], id: "old", shift_date: "2026-09-26", rvu_total: 999 },
      { ...rows[0], id: "day", shift_type: "day" as const, rvu_total: 999 }
    ];
    expect(compareShiftRvus(current, [...rows, ...extras])).toMatchObject({ count: 10, average: 100, label: "Near average" });
  });
  it("keeps the newest revision, even when it removes the saved RVU", () => {
    const revision = { ...rows[0], id: "revision", updated_at: "2026-10-12T00:00:00Z", rvu_total: null };
    expect(compareShiftRvus(current, [...rows, revision])).toMatchObject({ count: 9, label: "Not enough history" });
  });
  it("does not treat missing or invalid data as zero", () => {
    const invalid = rows.map((row, i) => ({ ...row, rvu_total: i === 0 ? null : i === 1 ? "" : i === 2 ? -1 : row.rvu_total }));
    expect(compareShiftRvus(current, invalid)).toMatchObject({ count: 7, average: 100, label: "Not enough history" });
    expect(compareShiftRvus({ ...current, rvu_total: null }, rows).label).toBe("RVUs not recorded");
  });
  it("handles zero means without dividing by zero", () => {
    const zeroRows = rows.map((row) => ({ ...row, rvu_total: 0 }));
    expect(compareShiftRvus(current, zeroRows)).toMatchObject({ percent: null, label: "Comparison unavailable" });
    expect(compareShiftRvus({ ...current, rvu_total: 0 }, zeroRows).label).toBe("Near average");
  });
});
