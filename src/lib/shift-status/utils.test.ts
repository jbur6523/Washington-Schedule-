// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";
import {
  currentShiftStatusWindow,
  latestShiftStatus,
  resolveCurrentShiftStatus
} from "@/lib/shift-status/utils";

const timezone = "America/Los_Angeles";

function update(overrides: Partial<ShiftStatusUpdate> = {}): ShiftStatusUpdate {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    department_id: "department-1",
    shift_date: "2026-07-27",
    shift_type: "day",
    rts_on: 8,
    rts_required: 8,
    vent_count: 5,
    bipap_count: 1,
    c_section_count: 0,
    vaginal_delivery_count: 0,
    cabg_count: 0,
    bronch_count: 0,
    sputum_induction_count: 0,
    other_procedure_count: 0,
    other_procedure_note: null,
    updated_by_staff_profile_id: null,
    updated_by_name: "Lead",
    created_at: "2026-07-27T16:00:00.000Z",
    updated_at: "2026-07-27T16:00:00.000Z",
    ...overrides
  };
}

describe("operational shift boundaries", () => {
  it.each([
    ["2026-01-15T15:59:00.000Z", "2026-01-14", "night"],
    ["2026-01-15T16:00:00.000Z", "2026-01-15", "day"],
    ["2026-01-16T03:59:00.000Z", "2026-01-15", "day"],
    ["2026-01-16T04:00:00.000Z", "2026-01-15", "night"],
    ["2026-01-16T10:00:00.000Z", "2026-01-15", "night"]
  ] as const)("maps %s to %s %s", (instant, shiftDate, shiftType) => {
    expect(currentShiftStatusWindow(timezone, new Date(instant))).toEqual({
      shiftDate,
      shiftType
    });
  });

  it.each([
    ["2026-03-08T09:30:00.000Z", "2026-03-07"],
    ["2026-03-08T10:30:00.000Z", "2026-03-07"],
    ["2026-11-01T08:30:00.000Z", "2026-10-31"],
    ["2026-11-01T09:30:00.000Z", "2026-10-31"]
  ] as const)("keeps the prior operational date through DST at %s", (instant, shiftDate) => {
    expect(currentShiftStatusWindow(timezone, new Date(instant))).toEqual({
      shiftDate,
      shiftType: "night"
    });
  });
});

describe("current shift selection", () => {
  it("never substitutes a prior shift record into a current-shift display", () => {
    const prior = update({
      id: "00000000-0000-0000-0000-000000000002",
      shift_date: "2026-07-26",
      updated_at: "2026-07-27T15:59:59.000Z"
    });

    const resolved = resolveCurrentShiftStatus(
      [prior],
      timezone,
      new Date("2026-07-27T17:00:00.000Z")
    );

    expect(resolved.currentWindow).toEqual({
      shiftDate: "2026-07-27",
      shiftType: "day"
    });
    expect(resolved.latest).toBeNull();
    expect(resolved.latestAny).toBe(prior);
    expect(resolved.showingFallback).toBe(false);
  });

  it("uses created_at and id to break equal updated_at ties deterministically", () => {
    const older = update();
    const newer = update({
      id: "00000000-0000-0000-0000-000000000002",
      created_at: "2026-07-27T16:01:00.000Z"
    });

    expect(latestShiftStatus([older, newer])).toBe(newer);
  });
});
