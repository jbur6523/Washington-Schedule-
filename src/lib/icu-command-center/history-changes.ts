import { icuActivityStateFromEvent } from "./activity-comparison";
import type { IcuPatientEventRecord } from "./types";

export type IcuHistoryChange = { label: string; previous: string; current: string };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

function airwayFields(value: string): Record<string, string> | null {
  const ett = /^ETT (\d+(?:\.\d+)?)(?: @ ([\d.]+))?(?: (Teeth|Gum|Nare))?$/.exec(value);
  if (ett) return { "ETT size": Number(ett[1]).toFixed(1), "ETT depth": ett[2] ?? "", "ETT location": ett[3] ?? "" };
  const trach = /^Trach (\d+(?:\.\d+)?)(?: (Shiley|Portex|Other))?( XLT)?$/.exec(value);
  if (trach) return { "Trach size": trach[1], "Trach type": trach[2] ?? "", "XLT": trach[3] ? "Yes" : "No" };
  return null;
}

function settingFields(value: string): Record<string, string> | null {
  if (!value || value === "Settings not entered") return {};
  const fields: Record<string, string> = {};
  for (const part of value.split(" - ")) {
    const match = /^(Rate|VT|PEEP|FiO2|PS|T-High|T-Low|P-High|P-Low|% Min Vol|IPAP|EPAP|CPAP|Flow) (.+)$/.exec(part);
    if (!match) return null;
    fields[match[1]] = match[2];
  }
  return fields;
}

/** Compare saved audit snapshots, including legacy formatted snapshots; never infer from the current patient. */
export function icuHistoryChanges(event: IcuPatientEventRecord): IcuHistoryChange[] | null {
  if (event.event_type !== "updated") return null;
  const data = event.event_data ?? {};
  const changes: IcuHistoryChange[] = [];
  const add = (label: string, previous: string, current: string) => {
    if (previous !== current) changes.push({ label, previous: previous || "Not recorded", current: current || "Cleared" });
  };
  const previousRecord = object(data.previousRecord);
  const currentRecord = object(data.record);
  const hasPreviousNote = "notes" in previousRecord || "previousNotes" in data;
  const previousNote = text("notes" in previousRecord ? previousRecord.notes : data.previousNotes);
  const currentNote = text("notes" in currentRecord ? currentRecord.notes : data.notes);
  if (data.action === "note_updated") {
    if (!hasPreviousNote) return null;
    add("Note", previousNote, currentNote);
    return changes;
  }
  if (data.action === "procedure_recorded") return null;
  const previous = icuActivityStateFromEvent(event, "previousState");
  const current = icuActivityStateFromEvent(event);
  if (!previous || !current) return null;
  add("Bed", previous.bed, current.bed);
  if (previous.device.startsWith("Vent - ") && current.device.startsWith("Vent - ")) {
    add("Vent mode", previous.device.slice(7), current.device.slice(7));
  } else add("Device / mode", previous.device, current.device);
  if (previous.airway !== current.airway) {
    const before = airwayFields(previous.airway);
    const after = airwayFields(current.airway);
    if (before && after && previous.airway.split(" ")[0] === current.airway.split(" ")[0]) {
      for (const key of Object.keys(before)) add(key, before[key], after[key]);
    } else add("Airway", previous.airway, current.airway);
  }
  const before = settingFields(previous.settings);
  const after = settingFields(current.settings);
  if (before && after) {
    for (const key of Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))) add(key, before[key] ?? "", after[key] ?? "");
  } else add("Settings", previous.settings, current.settings);
  for (const [key, label] of [["criticalVent", "Critical"], ["sbt", "SBT"], ["flolan", "Flolan"], ["prone", "Proned"], ["standby", "Standby"]] as const) {
    if (previous[key] !== null && current[key] !== null) add(label, previous[key] ? "Active" : "Off", current[key] ? "Active" : "Off");
  }
  if (hasPreviousNote) add("Note", previousNote, currentNote);
  return changes;
}
