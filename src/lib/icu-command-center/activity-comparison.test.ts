// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { IcuPatientEventRecord, IcuPatientRecord } from "@/lib/icu-command-center/types";
import {
  icuActivityStateFromEvent,
  icuActivityStateFromRecord,
  icuActivityStatusChanges
} from "@/lib/icu-command-center/activity-comparison";

function record(overrides: Partial<IcuPatientRecord> = {}): IcuPatientRecord {
  return {
    id: "icu-1",
    department_id: "department-1",
    bed: "C223",
    device_type: "vent",
    airway_size: null,
    airway_at: null,
    airway_location: null,
    vent_mode: "apvcmv",
    rate: 16,
    tidal_volume: 350,
    peep: 5,
    fio2: 30,
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
    is_critical_vent: true,
    is_standby: false,
    ventilator_outcome: null,
    discontinued_at: null,
    discontinued_by_staff_profile_id: null,
    is_active: true,
    created_by_staff_profile_id: null,
    updated_by_staff_profile_id: null,
    created_at: "2026-08-08T16:00:00.000Z",
    updated_at: "2026-08-08T16:00:00.000Z",
    ...overrides
  };
}

function event(eventData: Record<string, unknown>): IcuPatientEventRecord {
  return {
    id: "event-1",
    department_id: "department-1",
    icu_patient_id: "icu-1",
    event_type: "updated",
    event_time: "2026-08-08T17:00:00.000Z",
    event_summary: "ICU device settings updated.",
    event_data: eventData,
    created_by_staff_profile_id: null,
    created_by_name: "Lead RT",
    created_at: "2026-08-08T17:00:00.000Z"
  };
}

describe("ICU activity comparisons", () => {
  it("captures the complete relevant ventilator configuration", () => {
    expect(icuActivityStateFromRecord(record()).settings).toBe("Rate 16 - VT 350 - PEEP +5 - FiO2 30%");
  });

  it("captures only Flow and FiO2 for Cool Aerosol", () => {
    const state = icuActivityStateFromRecord(
      record({
        device_type: "cool_aerosol",
        vent_mode: null,
        rate: 18,
        tidal_volume: 400,
        peep: 8,
        fio2: 40,
        flow: 10,
        is_critical_vent: false
      })
    );

    expect(state.settings).toBe("Flow 10 L/min - FiO2 40%");
    expect(state.criticalVent).toBeNull();
    expect(state.standby).toBeNull();
  });

  it("reads embedded snapshots and describes status changes", () => {
    const previous = icuActivityStateFromRecord(record());
    const updated = icuActivityStateFromRecord(record({ is_critical_vent: false, is_standby: true }));
    const activity = event({ previousState: previous, updatedState: updated });

    expect(icuActivityStateFromEvent(activity, "previousState")).toEqual(previous);
    expect(icuActivityStatusChanges(previous, updated)).toEqual([
      "Critical → Not Critical",
      "Active → Standby"
    ]);
  });

  it("supports legacy flat event data", () => {
    expect(
      icuActivityStateFromEvent(
        event({ bed: "C223", device: "Vent - APVCMV", settings: "Rate 18 - VT 400 - PEEP +5 - FiO2 40%" })
      )?.settings
    ).toBe("Rate 18 - VT 400 - PEEP +5 - FiO2 40%");
  });
});
