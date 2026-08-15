import type {
  OfficialVentCountSource,
  ShiftStatusShiftType,
  ShiftStatusUpdate
} from "@/lib/shift-status/types";
import { defaultShiftRecordForInstant } from "@/lib/shift-status/reporting-window";

export function todayInTimezone(timezone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

export function currentShiftType(timezone = "America/Los_Angeles", date = new Date()) {
  return currentShiftStatusWindow(timezone, date).shiftType;
}

export function currentShiftStatusWindow(timezone = "America/Los_Angeles", date = new Date()) {
  return defaultShiftRecordForInstant(date, timezone) as {
    shiftDate: string;
    shiftType: ShiftStatusShiftType;
  };
}

export function shiftTypeLabel(shiftType: ShiftStatusShiftType) {
  return shiftType === "day" ? "Day Shift" : "Night Shift";
}

export function formatShiftStatusNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(value);
}

export type StaffingStatus = "staffed" | "short" | "no_update";

export const SHORT_STAFF_THRESHOLD = 0.5;

export function getStaffingStatus(
  rtsScheduled: number | null | undefined,
  rtsNeeded: number | null | undefined
): {
  status: StaffingStatus;
  shortAmount: number;
} {
  if (rtsScheduled === null || rtsScheduled === undefined || rtsNeeded === null || rtsNeeded === undefined) {
    return {
      status: "no_update",
      shortAmount: 0
    };
  }

  const scheduled = Number(rtsScheduled);
  const needed = Number(rtsNeeded);

  if (!Number.isFinite(scheduled) || !Number.isFinite(needed)) {
    return {
      status: "no_update",
      shortAmount: 0
    };
  }

  const rawShortAmount = needed - scheduled;
  const shortAmount = Math.max(0, rawShortAmount);

  return {
    status: rawShortAmount >= SHORT_STAFF_THRESHOLD ? "short" : "staffed",
    shortAmount
  };
}

export function staffingStatusLabel(status: StaffingStatus) {
  if (status === "short") {
    return "Short";
  }

  if (status === "staffed") {
    return "Staffed";
  }

  return "No Update";
}

export function formatShiftStatusTime(value: string | null | undefined, timezone = "America/Los_Angeles") {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).format(new Date(value)).replace(",", "");
}

export function officialVentSourceLabel(source: OfficialVentCountSource) {
  return source === "lead_command_center" ? "Lead Command Center" : "ICU Command Center";
}

export function latestShiftStatus(updates: ShiftStatusUpdate[]) {
  return [...updates].sort((left, right) => {
    const updatedAtDifference = new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    if (updatedAtDifference !== 0) {
      return updatedAtDifference;
    }

    const createdAtDifference = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }

    return right.id.localeCompare(left.id);
  })[0] ?? null;
}

export function latestShiftStatusFor(updates: ShiftStatusUpdate[], shiftDate: string, shiftType: ShiftStatusShiftType) {
  return latestShiftStatus(updates.filter((update) => update.shift_date === shiftDate && update.shift_type === shiftType));
}

export function resolveCurrentShiftStatus(
  updates: ShiftStatusUpdate[],
  timezone = "America/Los_Angeles",
  date = new Date()
) {
  const currentWindow = currentShiftStatusWindow(timezone, date);
  const latestAny = latestShiftStatus(updates);
  const currentLatest = latestShiftStatusFor(updates, currentWindow.shiftDate, currentWindow.shiftType);

  return {
    currentWindow,
    // Never substitute a prior operational shift into a current-shift card.
    latest: currentLatest,
    currentLatest,
    fallbackLatest: null,
    latestAny,
    showingFallback: false
  };
}

export function updatedByName(update: ShiftStatusUpdate | null) {
  if (!update) {
    return "Unknown";
  }

  const related = Array.isArray(update.staff_profiles) ? update.staff_profiles[0] : update.staff_profiles;
  return related?.display_name ?? update.updated_by_name ?? "Unknown";
}
