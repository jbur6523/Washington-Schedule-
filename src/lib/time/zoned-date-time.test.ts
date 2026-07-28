// @vitest-environment node

import { describe, expect, it } from "vitest";
import { wallTimeToIso } from "@/lib/time/zoned-date-time";

describe("America/Los_Angeles wall-time conversion", () => {
  it("uses the correct standard and daylight offsets", () => {
    expect(wallTimeToIso("2026-01-15", "12:00")).toBe(
      "2026-01-15T20:00:00.000Z"
    );
    expect(wallTimeToIso("2026-07-15", "12:00")).toBe(
      "2026-07-15T19:00:00.000Z"
    );
  });

  it("rejects the nonexistent spring-forward hour", () => {
    expect(wallTimeToIso("2026-03-08", "02:30")).toBe("");
  });

  it("resolves the repeated fall-back hour deterministically", () => {
    expect(wallTimeToIso("2026-11-01", "01:30")).toBe(
      "2026-11-01T08:30:00.000Z"
    );
  });

  it("rejects invalid calendar dates and clock values", () => {
    expect(wallTimeToIso("2026-02-30", "12:00")).toBe("");
    expect(wallTimeToIso("2026-07-15", "24:00")).toBe("");
  });
});
