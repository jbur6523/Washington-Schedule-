// @vitest-environment node

import { describe, expect, it } from "vitest";
import { parseShiftHistoryFilters, shiftHistoryInstantRange } from "@/lib/shift-history/filters";

describe("Shift History filters", () => {
  it("defaults to the rolling previous 24 hours and all shifts", () => {
    const filters = parseShiftHistoryFilters({});
    const now = new Date("2026-08-15T20:00:00.000Z");
    expect(filters).toMatchObject({ range: "24h", shift: "all", page: 1 });
    expect(shiftHistoryInstantRange(filters, now)).toEqual({
      startsAt: "2026-08-14T20:00:00.000Z",
      endsAt: "2026-08-15T20:00:00.000Z",
      error: ""
    });
  });

  it("uses inclusive Pacific calendar dates for Custom and excludes future shifts", () => {
    const filters = parseShiftHistoryFilters({
      range: "custom",
      shift: "night",
      from: "2026-08-01",
      to: "2026-08-15"
    });
    const result = shiftHistoryInstantRange(filters, new Date("2026-08-15T20:00:00.000Z"));
    expect(result).toEqual({
      startsAt: "2026-08-01T07:00:00.000Z",
      endsAt: "2026-08-15T20:00:00.000Z",
      error: ""
    });
  });

  it("rejects reversed or incomplete custom ranges", () => {
    const filters = parseShiftHistoryFilters({ range: "custom", from: "2026-08-15", to: "2026-08-01" });
    expect(shiftHistoryInstantRange(filters).error).toContain("valid From and To");
  });
});
