import type { IcuPatientRecord } from "./types";
import { icuBedOptions } from "./utils";

export const icuRoomGroups = [
  { id: "icu", label: "ICU C-E", units: ["C", "D", "E"] },
  { id: "imc", label: "IMC", units: ["IMC", "A", "B"] },
  { id: "ed", label: "ED", units: ["ED"] },
  { id: "or", label: "OR", units: ["OR"] },
  { id: "other", label: "Other", units: [] }
] as const;

export function icuRoomGroup(bed: string) {
  const unit = bed.trim().toUpperCase().match(/^[A-Z]+/)?.[0];
  return icuRoomGroups.find(group => (group.units as readonly string[]).includes(unit ?? ""))?.id ?? "other";
}

export function compareIcuBeds(left: string, right: string) {
  return left.localeCompare(right, "en", { numeric: true });
}

// The shared configured list plus rooms already established in ICU records.
// Both boards use the same confirmed room configuration and existing records.
export function availableIcuBeds(records: Pick<IcuPatientRecord, "bed">[]) {
  return Array.from(new Set<string>([...icuBedOptions, ...records.map(record => record.bed)])).sort(compareIcuBeds);
}

export type IcuArea = "C Pod" | "D Pod" | "E Pod" | "IMC A" | "IMC B" | "ED" | "OR" | "Other";
export function areaForBed(bed: string): IcuArea | "" {
  if (!bed) return "";
  if (/^C22\d$/.test(bed)) return "C Pod";
  if (/^D23\d$/.test(bed)) return "D Pod";
  if (/^E24\d$/.test(bed)) return "E Pod";
  if (/^IMC - 20\d$/.test(bed)) return "IMC A";
  if (/^IMC - 21\d$/.test(bed)) return "IMC B";
  if (/^ED \d+$/.test(bed)) return "ED";
  if (/^OR \d+$/.test(bed)) return "OR";
  return "Other";
}
