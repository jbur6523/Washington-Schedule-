import type { IcuDeviceType, IcuPatientEventRecord, IcuPatientRecord } from "@/lib/icu-command-center/types";
import {
  formatIcuAirway,
  formatIcuDeviceSummary,
  formatIcuSettings,
  supportsIcuStandby
} from "@/lib/icu-command-center/utils";

export type IcuActivityAuditState = {
  bed: string;
  deviceType: IcuDeviceType | null;
  device: string;
  airway: string;
  settings: string;
  criticalVent: boolean | null;
  standby: boolean | null;
  isActive: boolean | null;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function deviceTypeValue(value: unknown): IcuDeviceType | null {
  return ["vent", "bipap", "cpap", "hfnc", "cool_aerosol"].includes(String(value))
    ? (value as IcuDeviceType)
    : null;
}

export function icuActivityStateFromRecord(record: IcuPatientRecord): IcuActivityAuditState {
  return {
    bed: record.bed,
    deviceType: record.device_type,
    device: formatIcuDeviceSummary(record),
    airway: formatIcuAirway(record),
    settings: formatIcuSettings(record),
    criticalVent: record.device_type === "vent" ? record.is_critical_vent : null,
    standby: supportsIcuStandby(record.device_type) ? record.is_standby : null,
    isActive: record.is_active
  };
}

export function icuActivityStateFromEvent(
  event: IcuPatientEventRecord,
  snapshotKey: "previousState" | "updatedState" = "updatedState"
): IcuActivityAuditState | null {
  const data = event.event_data;
  if (!data) {
    return null;
  }

  const snapshot = data[snapshotKey];
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const state = snapshot as Record<string, unknown>;
    return {
      bed: textValue(state.bed),
      deviceType: deviceTypeValue(state.deviceType),
      device: textValue(state.device),
      airway: textValue(state.airway),
      settings: textValue(state.settings) || "Settings not entered",
      criticalVent: booleanValue(state.criticalVent),
      standby: booleanValue(state.standby),
      isActive: booleanValue(state.isActive)
    };
  }

  if (snapshotKey === "previousState") {
    return null;
  }

  return {
    bed: textValue(data.bed),
    deviceType: null,
    device: textValue(data.device),
    airway: textValue(data.airway),
    settings: textValue(data.settings) || "Settings not entered",
    criticalVent: booleanValue(data.criticalVent),
    standby: booleanValue(data.standby),
    isActive: event.event_type === "discontinued" ? false : true
  };
}

export function icuActivityStatusChanges(
  previous: IcuActivityAuditState | null,
  updated: IcuActivityAuditState | null
) {
  if (!previous || !updated) {
    return [];
  }

  const changes: string[] = [];

  if (
    previous.criticalVent !== null &&
    updated.criticalVent !== null &&
    previous.criticalVent !== updated.criticalVent
  ) {
    changes.push(`${previous.criticalVent ? "Critical" : "Not Critical"} → ${updated.criticalVent ? "Critical" : "Not Critical"}`);
  }

  if (previous.standby !== null && updated.standby !== null && previous.standby !== updated.standby) {
    changes.push(`${previous.standby ? "Standby" : "Active"} → ${updated.standby ? "Standby" : "Active"}`);
  }

  if (previous.isActive !== null && updated.isActive !== null && previous.isActive !== updated.isActive) {
    changes.push(`${previous.isActive ? "Active" : "Discontinued"} → ${updated.isActive ? "Active" : "Discontinued"}`);
  }

  return changes;
}
