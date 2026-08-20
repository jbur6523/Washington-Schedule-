import { describe, expect, it } from "vitest";
import {
  compactPersonName,
  isValidIsoDate,
  normalizeStaffUsername,
  normalizeTime,
  parseScheduleCode,
  parseStaffLeadMarker
} from "@/lib/schedule-import/parser";

describe("Schedule Code parser", () => {
  it("parses version metadata, ENTRY, SHORT_SHIFT, comments, and blank lines", () => {
    const parsed = parseScheduleCode(`
# staffing only
SCHEDULE_VERSION | Week 2 | 2026-08-23 | 2026-08-26

ENTRY | 2026-08-23 | day_shift | 06:30 | 19:00 | staff01 | scheduled # clean
SHORT_SHIFT | 2026-08-24 | night_shift | 18:30 | 07:00 | urgent | One RT short
`);
    expect(parsed.documentIssues).toEqual([]);
    expect(parsed.metadata).toEqual({ label: "Week 2", startsOn: "2026-08-23", endsOn: "2026-08-26" });
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ kind: "entry", entryStatus: "scheduled", issues: [] });
    expect(parsed.rows[1]).toMatchObject({ kind: "short_shift", severity: "urgent", issues: [] });
  });

  it.each(["lead", "shift_lead", "true"])("accepts the %s lead field", (marker) => {
    const parsed = parseScheduleCode(`ENTRY | 2026-08-23 | day_shift | 06:30 | 19:00 | staff01 | scheduled | ${marker}`);
    expect(parsed.rows[0].isShiftLead).toBe(true);
    expect(parsed.rows[0].issues).toEqual([]);
  });

  it.each(["Staff Name (L)", "Staff Name (lead)", "Staff Name shift lead", "Staff Name - L"])(
    "accepts inline lead marker %s",
    (identifier) => expect(parseStaffLeadMarker(identifier)).toEqual({ staffIdentifier: "Staff Name", isShiftLead: true })
  );

  it("normalizes username and full-name comparison forms", () => {
    expect(normalizeStaffUsername("Staff-01")).toBe("staff01");
    expect(compactPersonName(" Staff O'Neil ")).toBe("staffoneil");
  });

  it("normalizes HH:mm and database HH:mm:ss times", () => {
    expect(normalizeTime("6:30")).toBe("06:30");
    expect(normalizeTime("06:30:00")).toBe("06:30");
    expect(normalizeTime("24:00")).toBeNull();
  });

  it.each([
    ["2026-02-30", "date"],
    ["2026-08-23", "time"],
    ["2026-08-23", "status"],
    ["2026-08-23", "shift"]
  ])("reports malformed %s input", (_date, kind) => {
    const line = kind === "date"
      ? "ENTRY | 2026-02-30 | day_shift | 06:30 | 19:00 | staff01 | scheduled"
      : kind === "time"
        ? "ENTRY | 2026-08-23 | day_shift | 29:00 | 19:00 | staff01 | scheduled"
        : kind === "status"
          ? "ENTRY | 2026-08-23 | day_shift | 06:30 | 19:00 | staff01 | working"
          : "ENTRY | 2026-08-23 | unsupported | 06:30 | 19:00 | staff01 | scheduled";
    expect(parseScheduleCode(line).rows[0].issues.length).toBeGreaterThan(0);
  });

  it("validates real ISO calendar dates", () => {
    expect(isValidIsoDate("2026-08-23")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
  });
});
