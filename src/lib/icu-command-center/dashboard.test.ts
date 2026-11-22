import { describe, it, expect } from "vitest";
import { dashboardUnits, filterDashboardPatients } from "./dashboard";
import type { IcuPatientRecord } from "./types";
const beds = ["C220", "D230", "E240", "IMC - 201", "IMC - 211", "ED 31", "OR 2", "PACU"];
const records = beds.map((bed, index) => ({ id: String(index), bed, is_active: true, device_type: "hfnc" })) as IcuPatientRecord[];
describe("dashboard filters", () => {
  it.each(dashboardUnits.slice(1))("maps %s to configured unit identifiers", unit => {
    expect(filterDashboardPatients(records, unit, "All").map(record => record.bed)).toEqual([beds[dashboardUnits.indexOf(unit) - 1]]);
  });
  it("keeps other locations in All and excludes inactive patients", () => {
    expect(filterDashboardPatients([...records, { ...records[0], is_active: false }], "All", "All")).toHaveLength(8);
  });
  it("combines critical, CPAP, oxygen and treatment categories with units", () => {
    const patients = [
      { ...records[0], device_type: "vent", is_critical_vent: true },
      { ...records[1], device_type: "cpap" },
      { ...records[2], device_type: "nasal_cannula", rounding_data: { treatment: { name: "Nebulizer", frequency: "Q4", at: "now" } } }
    ] as IcuPatientRecord[];
    expect(filterDashboardPatients(patients, "C Pod", "Critical")).toHaveLength(1);
    expect(filterDashboardPatients(patients, "C Pod", "Noncritical Vent")).toHaveLength(0);
    expect(filterDashboardPatients(patients, "D Pod", "CPAP")).toHaveLength(1);
    expect(filterDashboardPatients(patients, "E Pod", "Oxygen Device")).toHaveLength(1);
    expect(filterDashboardPatients(patients, "E Pod", "Treatment")).toHaveLength(1);
    expect(filterDashboardPatients(patients, "D Pod", "Treatment")).toHaveLength(0);
  });
});
