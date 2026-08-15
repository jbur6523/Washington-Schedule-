// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";
import {
  clinicalShiftStart,
  defaultShiftRecordForInstant,
  latestReportingWindowUpdate,
  reportingWindowEndDelay,
  reportingWindowForInstant,
  shiftRecordOptionsForInstant
} from "@/lib/shift-status/reporting-window";

function update(id: string, createdAt: string): ShiftStatusUpdate {
  return {
    id,
    department_id: "department-1",
    shift_date: "2026-01-14",
    shift_type: "night",
    rts_on: 7,
    rts_required: 7.5,
    rvu_total: null,
    vent_count: 6,
    bipap_count: 4,
    c_section_count: 8,
    vaginal_delivery_count: 0,
    cabg_count: 0,
    bronch_count: 1,
    sputum_induction_count: 0,
    other_procedure_count: 0,
    other_procedure_note: null,
    shift_note: null,
    updated_by_staff_profile_id: "lead-1",
    updated_by_name: "Lead RT",
    created_at: createdAt,
    updated_at: createdAt
  };
}

describe("Shift Update reporting windows", () => {
  it.each([
    ["2026-08-16T12:00:00.000Z", "2026-08-16", "day", "2026-08-15", "night"],
    ["2026-08-15T23:48:00.000Z", "2026-08-15", "night", "2026-08-15", "day"],
    ["2026-08-16T09:00:00.000Z", "2026-08-15", "night", "2026-08-15", "day"]
  ] as const)(
    "maps editable records at %s without duplicating date logic",
    (instant, defaultDate, defaultShift, alternateDate, alternateShift) => {
      const options = shiftRecordOptionsForInstant(new Date(instant));
      const selectedDefault = defaultShiftRecordForInstant(new Date(instant));

      expect(selectedDefault).toEqual({ shiftDate: defaultDate, shiftType: defaultShift });
      expect(options[alternateShift]).toEqual({ shiftDate: alternateDate, shiftType: alternateShift });
    }
  );

  it("uses clinical 06:30 and 18:30 starts independently from workspace boundaries", () => {
    expect(clinicalShiftStart({ shiftDate: "2026-08-15", shiftType: "day" })).toBe(
      "2026-08-15T13:30:00.000Z"
    );
    expect(clinicalShiftStart({ shiftDate: "2026-08-15", shiftType: "night" })).toBe(
      "2026-08-16T01:30:00.000Z"
    );
  });

  it("schedules the next workspace transition at the exact reporting boundary", () => {
    const beforeEvening = new Date("2026-08-08T22:59:59.000Z");
    const beforeMorning = new Date("2026-08-09T10:59:59.000Z");
    expect(reportingWindowEndDelay(reportingWindowForInstant(beforeEvening), beforeEvening)).toBe(1_000);
    expect(reportingWindowEndDelay(reportingWindowForInstant(beforeMorning), beforeMorning)).toBe(1_000);
  });

  it.each([
    ["2026-01-15T12:00:00.000Z", "2026-01-15T12:00:00.000Z", "2026-01-16T00:00:00.000Z", "morning"],
    ["2026-01-15T23:59:59.999Z", "2026-01-15T12:00:00.000Z", "2026-01-16T00:00:00.000Z", "morning"],
    ["2026-01-16T00:00:00.000Z", "2026-01-16T00:00:00.000Z", "2026-01-16T12:00:00.000Z", "evening"],
    ["2026-01-16T11:59:59.999Z", "2026-01-16T00:00:00.000Z", "2026-01-16T12:00:00.000Z", "evening"],
    ["2026-01-16T12:00:00.000Z", "2026-01-16T12:00:00.000Z", "2026-01-17T00:00:00.000Z", "morning"]
  ] as const)("maps %s to the expected local reporting window", (instant, startsAt, endsAt, cycle) => {
    expect(reportingWindowForInstant(new Date(instant))).toMatchObject({ startsAt, endsAt, cycle });
  });

  it("keeps spring-forward resets at local 04:00 and 16:00", () => {
    expect(reportingWindowForInstant(new Date("2026-03-08T10:59:59.999Z"))).toMatchObject({
      startsAt: "2026-03-08T00:00:00.000Z",
      endsAt: "2026-03-08T11:00:00.000Z",
      cycle: "evening"
    });
    expect(reportingWindowForInstant(new Date("2026-03-08T11:00:00.000Z"))).toMatchObject({
      startsAt: "2026-03-08T11:00:00.000Z",
      endsAt: "2026-03-08T23:00:00.000Z",
      cycle: "morning"
    });
  });

  it("keeps fall-back resets at local 04:00 and 16:00", () => {
    expect(reportingWindowForInstant(new Date("2026-11-01T11:59:59.999Z"))).toMatchObject({
      startsAt: "2026-10-31T23:00:00.000Z",
      endsAt: "2026-11-01T12:00:00.000Z",
      cycle: "evening"
    });
    expect(reportingWindowForInstant(new Date("2026-11-01T12:00:00.000Z"))).toMatchObject({
      startsAt: "2026-11-01T12:00:00.000Z",
      endsAt: "2026-11-02T00:00:00.000Z",
      cycle: "morning"
    });
  });

  it.each([
    "2026-08-08T12:00:00.000Z",
    "2026-08-08T15:00:00.000Z",
    "2026-08-08T17:00:00.000Z",
    "2026-08-08T22:59:59.999Z"
  ])("keeps the 05:00 update active through 15:59 at %s", (instant) => {
    expect(reportingWindowForInstant(new Date(instant)).id).toBe("2026-08-08T11:00:00.000Z");
  });

  it.each([
    "2026-08-09T00:00:00.000Z",
    "2026-08-09T06:00:00.000Z",
    "2026-08-09T10:59:59.999Z"
  ])("keeps the 17:00 update active through 03:59 at %s", (instant) => {
    expect(reportingWindowForInstant(new Date(instant)).id).toBe("2026-08-08T23:00:00.000Z");
  });

  it("selects only the newest row created inside the active window", () => {
    const prior = update("prior", "2026-01-15T11:59:59.999Z");
    const first = update("first", "2026-01-15T13:00:00.000Z");
    const edited = update("edited", "2026-01-15T18:00:00.000Z");
    const next = update("next", "2026-01-16T00:00:00.000Z");
    const window = reportingWindowForInstant(new Date("2026-01-15T20:00:00.000Z"));

    expect(latestReportingWindowUpdate([prior, first, edited, next], window)).toBe(edited);
    expect(latestReportingWindowUpdate([prior, next], window)).toBeNull();
  });
});
