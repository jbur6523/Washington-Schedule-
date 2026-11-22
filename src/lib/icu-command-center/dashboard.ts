import type { IcuPatientRecord } from "./types";
import { areaForBed } from "./rooms";
import { isOxygenDevice } from "./utils";
export const dashboardUnits = ["All", "C Pod", "D Pod", "E Pod", "IMC A", "IMC B", "ED", "OR"] as const;
export type DashboardUnit = typeof dashboardUnits[number];
export const dashboardDevices = ["All", "Vent", "BiPAP", "CPAP", "HFNC", "Cool Aerosol", "Oxygen Device", "Treatment", "Critical"] as const;
export type DashboardDevice = typeof dashboardDevices[number] | "Noncritical Vent";
export function matchesDashboardDevice(record: IcuPatientRecord, device: DashboardDevice) {
  switch (device) {
    case "All": return true;
    case "Noncritical Vent": return record.device_type === "vent" && !record.is_critical_vent;
    case "Treatment": return Boolean(record.rounding_data?.treatment?.name && record.rounding_data.treatment.frequency);
    case "Critical": return record.device_type === "vent" && record.is_critical_vent;
    case "Oxygen Device": return isOxygenDevice(record.device_type);
    case "Cool Aerosol": return record.device_type === "cool_aerosol";
    default: return record.device_type === device.toLowerCase();
  }
}
export function filterDashboardPatients(records: IcuPatientRecord[], unit: DashboardUnit, device: DashboardDevice) {
  return records.filter(record => record.is_active && (unit === "All" || areaForBed(record.bed) === unit) && matchesDashboardDevice(record, device));
}
