import type { IcuPatientRecord } from "./types";
import { icuBedOptions } from "./utils";

export const icuRoomGroups = [
  { id: "icu", label: "ICU C-E", units: ["C", "D", "E"] },
  { id: "imc", label: "IMC", units: ["IMC", "A", "B"] }
] as const;

export function icuRoomGroup(bed: string) {
  const unit = bed.trim().toUpperCase().match(/^[A-Z]+/)?.[0];
  return icuRoomGroups.find(group => (group.units as readonly string[]).includes(unit ?? ""))?.id;
}

export function compareIcuBeds(left: string, right: string) {
  return left.localeCompare(right, "en", { numeric: true });
}

// The shared configured list plus rooms already established in ICU records.
// Both boards use the same confirmed room configuration and existing records.
export function availableIcuBeds(records: Pick<IcuPatientRecord, "bed">[]) {
  return Array.from(new Set<string>([...icuBedOptions, ...records.map(record => record.bed)])).sort(compareIcuBeds);
}
