import type {
  IcuOperationalShiftType,
  IcuPatientEventRecord,
  IcuPatientRecord,
  IcuVentShiftEventKey,
  IcuVentStatusKey
} from "@/lib/icu-command-center/types";
import { icuVentModeLabels } from "@/lib/icu-command-center/utils";
import { addIsoDays } from "@/lib/shift-status/reporting-window";
import { timeZoneParts, wallTimeToIso } from "@/lib/time/zoned-date-time";

export const ICU_OPERATIONAL_TIMEZONE = "America/Los_Angeles";

export type IcuOperationalShift = {
  shiftDate: string;
  shiftType: IcuOperationalShiftType;
};

function isoDate(year: number, month: number, day: number) {
  return [year, month, day].map((value, index) => value.toString().padStart(index === 0 ? 4 : 2, "0")).join("-");
}

export function currentIcuOperationalShift(
  date = new Date(),
  timezone = ICU_OPERATIONAL_TIMEZONE
): IcuOperationalShift {
  const parts = timeZoneParts(date, timezone);
  const localDate = isoDate(parts.year, parts.month, parts.day);

  if (parts.hour < 7) {
    return { shiftDate: addIsoDays(localDate, -1), shiftType: "night" };
  }

  if (parts.hour < 19) {
    return { shiftDate: localDate, shiftType: "day" };
  }

  return { shiftDate: localDate, shiftType: "night" };
}

export function nextIcuOperationalShiftBoundaryDelay(
  date = new Date(),
  timezone = ICU_OPERATIONAL_TIMEZONE
) {
  const parts = timeZoneParts(date, timezone);
  const localDate = isoDate(parts.year, parts.month, parts.day);
  const candidates = [
    wallTimeToIso(localDate, "07:00", timezone),
    wallTimeToIso(localDate, "19:00", timezone),
    wallTimeToIso(addIsoDays(localDate, 1), "07:00", timezone)
  ]
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => value > date.getTime());

  return Math.max(0, Math.min(...candidates) - date.getTime());
}

export function ventStatusEventSummary(status: IcuVentStatusKey, active: boolean) {
  const summaries: Record<IcuVentStatusKey, [string, string]> = {
    sbt: ["SBT marked active", "SBT status cleared"],
    critical: ["Critical status marked", "Critical status cleared"],
    flolan: ["Flolan marked active", "Flolan status cleared"],
    prone: ["Prone status marked", "Prone status cleared"]
  };

  return summaries[status][active ? 0 : 1];
}

export function isVentStatusActive(record: IcuPatientRecord, status: IcuVentStatusKey) {
  switch (status) {
    case "sbt":
      return record.is_sbt;
    case "critical":
      return record.is_critical_vent;
    case "flolan":
      return record.is_flolan;
    case "prone":
      return record.is_prone;
  }
}

export function withVentStatus(
  record: IcuPatientRecord,
  status: IcuVentStatusKey,
  active: boolean
): IcuPatientRecord {
  const field: Record<IcuVentStatusKey, keyof IcuPatientRecord> = {
    sbt: "is_sbt",
    critical: "is_critical_vent",
    flolan: "is_flolan",
    prone: "is_prone"
  };

  return { ...record, [field[status]]: active };
}

export function ventShiftEventSummary(event: IcuVentShiftEventKey) {
  return `${event.toUpperCase()} noted this shift`;
}

export function activeVentModifierLabels(record: IcuPatientRecord) {
  return [
    record.is_sbt ? "SBT" : null,
    record.is_prone ? "Proned" : null,
    record.is_flolan ? "On Flolan" : null
  ].filter((value): value is string => Boolean(value));
}

export function formatVentCardTitle(record: IcuPatientRecord) {
  if (record.device_type !== "vent") {
    return "";
  }

  const device = record.is_critical_vent ? "Critical Vent" : "Vent";
  return record.vent_mode ? `${device} – ${icuVentModeLabels[record.vent_mode]}` : device;
}

export function ventCardTone(record: IcuPatientRecord): "critical" | "sbt" | "normal" {
  if (record.device_type !== "vent") {
    return "normal";
  }

  if (record.is_critical_vent) {
    return "critical";
  }

  return record.is_sbt ? "sbt" : "normal";
}

export function ventShiftEventState(
  events: IcuPatientEventRecord[],
  shift: IcuOperationalShift
) {
  const state = new Map<string, Set<IcuVentShiftEventKey>>();

  for (const event of events) {
    if (
      event.operational_shift_date !== shift.shiftDate
      || event.operational_shift_type !== shift.shiftType
      || (event.event_type !== "ct_noted" && event.event_type !== "mri_noted")
    ) {
      continue;
    }

    const key: IcuVentShiftEventKey = event.event_type === "ct_noted" ? "ct" : "mri";
    const patientEvents = state.get(event.icu_patient_id) ?? new Set<IcuVentShiftEventKey>();
    patientEvents.add(key);
    state.set(event.icu_patient_id, patientEvents);
  }

  return state;
}

export function isBoardUpdateEvent(eventType: IcuPatientEventRecord["event_type"]) {
  return [
    "critical_status_updated",
    "sbt_status_updated",
    "flolan_status_updated",
    "prone_status_updated",
    "ct_noted",
    "mri_noted"
  ].includes(eventType);
}
