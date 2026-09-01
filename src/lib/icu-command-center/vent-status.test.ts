// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { IcuPatientEventRecord, IcuPatientRecord } from "@/lib/icu-command-center/types";
import {
  activeVentModifierLabels,
  currentIcuOperationalShift,
  formatVentCardTitle,
  nextIcuOperationalShiftBoundaryDelay,
  ventCardTone,
  ventShiftEventState,
  ventShiftEventSummary,
  ventStatusEventSummary
} from "@/lib/icu-command-center/vent-status";

function vent(overrides: Partial<IcuPatientRecord> = {}): IcuPatientRecord {
  return {
    id: "vent-1",
    department_id: "department-1",
    bed: "C223",
    device_type: "vent",
    airway_size: "7.5",
    airway_at: "23",
    airway_location: "teeth",
    vent_mode: "apvcmv",
    rate: 16,
    tidal_volume: 400,
    peep: 5,
    fio2: 40,
    ps: null,
    t_high: null,
    t_low: null,
    p_high: null,
    p_low: null,
    percent_min_vol: null,
    ipap: null,
    epap: null,
    cpap: null,
    flow: null,
    notes: null,
    is_critical_vent: false,
    is_sbt: false,
    is_flolan: false,
    is_prone: false,
    is_standby: false,
    ventilator_outcome: null,
    discontinued_at: null,
    discontinued_by_staff_profile_id: null,
    is_active: true,
    created_by_staff_profile_id: null,
    updated_by_staff_profile_id: null,
    created_at: "2026-08-22T15:00:00.000Z",
    updated_at: "2026-08-22T15:00:00.000Z",
    ...overrides
  };
}

function shiftEvent(
  eventType: "ct_noted" | "mri_noted",
  shiftDate: string,
  shiftType: "day" | "night"
): IcuPatientEventRecord {
  return {
    id: `${eventType}-${shiftDate}-${shiftType}`,
    department_id: "department-1",
    icu_patient_id: "vent-1",
    event_type: eventType,
    event_time: "2026-08-22T15:00:00.000Z",
    event_summary: eventType === "ct_noted" ? "CT noted this shift" : "MRI noted this shift",
    event_data: null,
    created_by_staff_profile_id: "staff-1",
    created_by_name: "ICU RT",
    operational_shift_date: shiftDate,
    operational_shift_type: shiftType,
    created_at: "2026-08-22T15:00:00.000Z"
  };
}

describe("ICU 07:00/19:00 operational shifts", () => {
  it.each([
    ["2026-08-22T13:59:59.999Z", "2026-08-21", "night"],
    ["2026-08-22T14:00:00.000Z", "2026-08-22", "day"],
    ["2026-08-23T01:59:59.999Z", "2026-08-22", "day"],
    ["2026-08-23T02:00:00.000Z", "2026-08-22", "night"],
    ["2027-01-01T14:59:59.999Z", "2026-12-31", "night"],
    ["2027-01-01T15:00:00.000Z", "2027-01-01", "day"]
  ] as const)("maps %s to %s %s in Pacific time", (instant, shiftDate, shiftType) => {
    expect(currentIcuOperationalShift(new Date(instant))).toEqual({ shiftDate, shiftType });
  });

  it("schedules an exact refresh at the next boundary", () => {
    expect(nextIcuOperationalShiftBoundaryDelay(new Date("2026-08-22T13:59:59.000Z"))).toBe(1_000);
    expect(nextIcuOperationalShiftBoundaryDelay(new Date("2026-08-23T01:59:59.000Z"))).toBe(1_000);
  });
});

describe("Vent status presentation", () => {
  it("uses Critical, Standby, and SBT color priority while retaining every modifier", () => {
    const sbt = vent({ is_sbt: true });
    expect(ventCardTone(sbt)).toBe("sbt");
    expect(formatVentCardTitle(sbt)).toBe("Vent – APVCMV");
    expect(activeVentModifierLabels(sbt)).toEqual(["SBT"]);

    const standby = vent({ is_sbt: true, is_standby: true });
    expect(ventCardTone(standby)).toBe("standby");
    expect(activeVentModifierLabels(standby)).toEqual(["SBT", "Standby"]);

    const critical = vent({ is_critical_vent: true, is_sbt: true, is_prone: true, is_flolan: true, is_standby: true });
    expect(ventCardTone(critical)).toBe("critical");
    expect(formatVentCardTitle(critical)).toBe("Critical Vent – APVCMV");
    expect(activeVentModifierLabels(critical)).toEqual(["SBT", "Proned", "On Flolan", "Standby"]);
  });

  it("uses operational audit wording without clinical start, stop, or transport claims", () => {
    const wording = [
      ventStatusEventSummary("sbt", true),
      ventStatusEventSummary("sbt", false),
      ventStatusEventSummary("critical", true),
      ventStatusEventSummary("critical", false),
      ventStatusEventSummary("flolan", true),
      ventStatusEventSummary("flolan", false),
      ventStatusEventSummary("prone", true),
      ventStatusEventSummary("prone", false),
      ventShiftEventSummary("ct"),
      ventShiftEventSummary("mri")
    ];

    expect(wording).toEqual([
      "SBT marked active",
      "SBT status cleared",
      "Critical status marked",
      "Critical status cleared",
      "Flolan marked active",
      "Flolan status cleared",
      "Prone status marked",
      "Prone status cleared",
      "CT noted this shift",
      "MRI noted this shift"
    ]);
    expect(wording.join(" ").toLowerCase()).not.toMatch(/started|ended|transport at|patient proned at/);
  });
});

describe("Vent shift-event state", () => {
  it("marks only events from the selected shift and collapses repeated rows defensively", () => {
    const currentShift = { shiftDate: "2026-08-22", shiftType: "day" } as const;
    const events = [
      shiftEvent("ct_noted", "2026-08-22", "day"),
      shiftEvent("ct_noted", "2026-08-22", "day"),
      shiftEvent("mri_noted", "2026-08-21", "night")
    ];

    expect(Array.from(ventShiftEventState(events, currentShift).get("vent-1") ?? [])).toEqual(["ct"]);
  });
});
