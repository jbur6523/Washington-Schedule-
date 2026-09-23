// @vitest-environment node

import { describe, expect, it } from "vitest";
import type {
  IcuDeviceType,
  IcuPatientRecord,
  IcuSnapshotCounts
} from "@/lib/icu-command-center/types";
import { formatIcuAirway, formatIcuSettings, getIcuSnapshotCounts, supportsIcuStandby } from "@/lib/icu-command-center/utils";

function record(
  id: string,
  deviceType: IcuDeviceType,
  overrides: Partial<IcuPatientRecord> = {}
): IcuPatientRecord {
  return {
    id,
    department_id: "department-1",
    bed: `ICU-${id}`,
    device_type: deviceType,
    airway_size: null,
    airway_at: null,
    airway_location: null,
    airway_type: null,
    trach_type: null,
    trach_xlt: false,
    vent_mode: null,
    rate: null,
    tidal_volume: null,
    peep: null,
    fio2: null,
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
    created_at: "2026-08-06T16:00:00.000Z",
    updated_at: "2026-08-06T16:00:00.000Z",
    ...overrides
  };
}

describe("shared airway display", () => {
  it("keeps legacy ETT airway details", () => {
    expect(formatIcuAirway(record("1", "vent", { airway_size: "7.5", airway_at: "23", airway_location: "teeth" }))).toBe("ETT 7.5 @ 23 Teeth");
  });
  it.each(["shiley", "portex", "other"] as const)("formats %s trachs with and without XLT, never ETT location", (trach_type) => {
    const trach = record("1", "vent", { airway_type: "trach", airway_size: "4", trach_type, airway_at: "23", airway_location: "teeth" });
    const label = `Trach 4 ${trach_type[0].toUpperCase()}${trach_type.slice(1)}`;
    expect(formatIcuAirway(trach)).toBe(label);
    expect(formatIcuAirway({ ...trach, trach_xlt: true })).toBe(`${label} XLT`);
    expect(formatIcuAirway({ ...trach, device_type: "hfnc" })).toBe("");
  });
});

function operationalCounts(counts: IcuSnapshotCounts) {
  return {
    vents: counts.vents,
    hfnc: counts.hfnc,
    bipap: counts.bipap,
    cpap: counts.cpap,
    criticalVents: counts.criticalVents,
    totalActive: counts.totalActive
  };
}

describe("persistent ICU snapshot counts", () => {
  it("retains active ICU-owned counts across date and shift boundaries", () => {
    const yesterday = [
      record("vent-1", "vent", { is_critical_vent: true }),
      record("hfnc-1", "hfnc"),
      record("bipap-1", "bipap"),
      record("cpap-1", "cpap")
    ];

    expect(operationalCounts(getIcuSnapshotCounts(yesterday))).toEqual({
      vents: 1,
      hfnc: 1,
      bipap: 1,
      cpap: 1,
      criticalVents: 1,
      totalActive: 4
    });
  });

  it("does not change summary counts after an unrelated partial ICU update", () => {
    const records = [
      record("vent-1", "vent"),
      record("hfnc-1", "hfnc", { fio2: 40 }),
      record("bipap-1", "bipap")
    ];
    const before = operationalCounts(getIcuSnapshotCounts(records));
    const after = operationalCounts(
      getIcuSnapshotCounts(
        records.map((icuRecord) =>
          icuRecord.id === "hfnc-1"
            ? {
                ...icuRecord,
                fio2: 50,
                updated_at: "2026-08-07T16:00:00.000Z"
              }
            : icuRecord
        )
      )
    );

    expect(after).toEqual(before);
  });

  it("represents absent device categories as real zero counts", () => {
    expect(operationalCounts(getIcuSnapshotCounts([]))).toEqual({
      vents: 0,
      hfnc: 0,
      bipap: 0,
      cpap: 0,
      criticalVents: 0,
      totalActive: 0
    });
  });
});

describe("ICU device settings", () => {
  it("formats Cool Aerosol with only Flow and FiO2 in the requested order", () => {
    expect(
      formatIcuSettings(
        record("cool-aerosol-1", "cool_aerosol", {
          flow: 10,
          fio2: 40,
          rate: 12,
          peep: 5,
          ipap: 14,
          airway_size: "7.5"
        })
      )
    ).toBe("Flow 10 L/min - FiO2 40%");
  });

  it("retains standby state on supported ICU records", () => {
    for (const deviceType of ["vent", "hfnc", "bipap", "cpap"] as IcuDeviceType[]) {
      expect(supportsIcuStandby(deviceType)).toBe(true);
      expect(record(`${deviceType}-standby`, deviceType, { is_standby: true }).is_standby).toBe(true);
    }

    expect(supportsIcuStandby("cool_aerosol")).toBe(false);
  });
});
