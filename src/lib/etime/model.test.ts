import { describe, expect, it } from "vitest";
import {
  addDays,
  periodStart,
  periodOpen,
  validateEntry,
  signedName,
  validDate,
} from "./model";
import { layoutRows } from "./layout";
import { formatClockInput } from "./model";
it("formats typed 24-hour times and accepts only 24:00 at hour 24", () => {
  expect(formatClockInput("2130")).toBe("21:30");
  expect(formatClockInput("0930")).toBe("09:30");
  expect(formatClockInput("9:30", true)).toBe("09:30");
  expect(formatClockInput("2400")).toBe("24:00");
  expect(formatClockInput("21:3",true)).toBe("21:3");
  const entry = {
    date: "2026-10-15",
    category: "punches",
    clock_out: "24:00",
    reason: "Forgot out punch",
  };
  expect(validateEntry(entry, new Date("2026-10-15T18:00Z")).clock_out).toBe(
    "24:00",
  );
  expect(() =>
    validateEntry(
      { ...entry, clock_out: "24:01" },
      new Date("2026-10-15T18:00Z"),
    ),
  ).toThrow();
});
describe("eTime periods and validation", () => {
  it("anchors 14-day Sunday periods independently of Monday schedule weeks", () => {
    expect(periodStart("2026-10-10")).toBe("2026-09-27");
    expect(periodStart("2026-10-11")).toBe("2026-10-11");
    expect(periodStart("2026-10-24")).toBe("2026-10-11");
    expect(periodStart("2026-10-25")).toBe("2026-10-25");
    expect(addDays("2026-10-11", 16)).toBe("2026-10-27");
  });
  it("keeps previous and current open through Tuesday Pacific, including DST", () => {
    expect(periodOpen("2026-10-11", new Date("2026-10-28T06:59:59Z"))).toBe(
      true,
    );
    expect(periodOpen("2026-10-11", new Date("2026-10-28T07:00:00Z"))).toBe(
      false,
    );
    expect(periodOpen("2026-10-25", new Date("2026-10-28T07:00:00Z"))).toBe(
      true,
    );
    expect(periodOpen("2026-10-25", new Date("2026-11-11T07:59:59Z"))).toBe(
      true,
    );
    expect(periodOpen("2026-10-25", new Date("2026-11-11T08:00:00Z"))).toBe(
      false,
    );
  });
  it("preserves a single lunch punch or exact 50-minute pair", () => {
    const base = {
      date: "2026-10-15",
      category: "lunch",
      reason: "Forgot punch",
    };
    const now = new Date("2026-10-15T18:00Z");
    expect(validateEntry({ ...base, lunch_out: "12:00" }, now)).toEqual({
      ...base,
      lunch_out: "12:00",
    });
    expect(validateEntry({ ...base, lunch_in: "12:50" }, now)).toEqual({
      ...base,
      lunch_in: "12:50",
    });
    expect(
      validateEntry({ ...base, lunch_out: "12:00", lunch_in: "12:50" }, now),
    ).toEqual({ ...base, lunch_out: "12:00", lunch_in: "12:50" });
    expect(() => validateEntry(base, now)).toThrow();
  });
  it("rejects closed dates, invalid dates, injected fields, and unadopted signatures", () => {
    expect(validDate("2026-02-30")).toBe(false);
    expect(() =>
      validateEntry({
        date: "2026-09-01",
        category: "other",
        hours: "3",
        reason: "X",
      }),
    ).toThrow();
    expect(() => signedName("Other Person", "Test Employee", true)).toThrow();
    expect(() => signedName("Test Employee", "Test Employee", false)).toThrow();
    expect(
      validateEntry(
        {
          date: "2026-10-15",
          category: "holiday",
          hours: "7.25",
          reason: "Holiday",
          entered: { initials: "XX" },
        },
        new Date("2026-10-15T18:00Z"),
      ),
    ).not.toHaveProperty("entered");
  });
  it("continues long text without losing entry identity or initials", () => {
    const rows = layoutRows([
      {
        id: "entry",
        revision: 2,
        date: "2026-10-15",
        category: "other",
        hours: "2",
        reason: "W".repeat(90),
        entered: { initials: "TK", actor: "test", at: "now", revision: 2 },
      },
    ]);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map((r) => r.reason.replaceAll("\n", "")).join("")).toBe(
      "W".repeat(90),
    );
    expect(
      rows.every((r) => r.id === "entry" && r.entered?.initials === "TK"),
    ).toBe(true);
  });
});
