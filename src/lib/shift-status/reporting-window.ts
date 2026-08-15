import type { ShiftStatusUpdate } from "@/lib/shift-status/types";
import { timeZoneParts, wallTimeToIso } from "@/lib/time/zoned-date-time";

export const SHIFT_UPDATE_REPORTING_TIMEZONE = "America/Los_Angeles";

export type ShiftUpdateReportingWindow = {
  id: string;
  startsAt: string;
  endsAt: string;
  localStartDate: string;
  cycle: "morning" | "evening";
};

function isoDate(year: number, month: number, day: number) {
  return [
    year.toString().padStart(4, "0"),
    month.toString().padStart(2, "0"),
    day.toString().padStart(2, "0")
  ].join("-");
}

export function addIsoDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return isoDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export type ShiftRecordSelection = {
  shiftDate: string;
  shiftType: "day" | "night";
};

export type ShiftRecordOptions = {
  day: ShiftRecordSelection;
  night: ShiftRecordSelection;
  defaultShiftType: ShiftRecordSelection["shiftType"];
};

export function shiftRecordOptionsForInstant(
  date = new Date(),
  timezone = SHIFT_UPDATE_REPORTING_TIMEZONE
): ShiftRecordOptions {
  const parts = timeZoneParts(date, timezone);
  const localDate = isoDate(parts.year, parts.month, parts.day);
  const priorDate = addIsoDays(localDate, -1);

  return {
    day: {
      shiftDate: parts.hour < 4 ? priorDate : localDate,
      shiftType: "day"
    },
    night: {
      shiftDate: parts.hour < 16 ? priorDate : localDate,
      shiftType: "night"
    },
    defaultShiftType: parts.hour >= 4 && parts.hour < 16 ? "day" : "night"
  };
}

export function defaultShiftRecordForInstant(
  date = new Date(),
  timezone = SHIFT_UPDATE_REPORTING_TIMEZONE
) {
  const options = shiftRecordOptionsForInstant(date, timezone);
  return options[options.defaultShiftType];
}

export function clinicalShiftStart(
  selection: ShiftRecordSelection,
  timezone = SHIFT_UPDATE_REPORTING_TIMEZONE
) {
  const localTime = selection.shiftType === "day" ? "06:30" : "18:30";
  const value = wallTimeToIso(selection.shiftDate, localTime, timezone);

  if (!value) {
    throw new Error(`Unable to resolve clinical shift start for ${selection.shiftDate}.`);
  }

  return value;
}

export function clinicalShiftTimeLabel(shiftType: ShiftRecordSelection["shiftType"]) {
  return shiftType === "day" ? "6:30 AM–6:30 PM" : "6:30 PM–6:30 AM";
}

export function currentClinicalShiftRecordForInstant(
  date = new Date(),
  timezone = SHIFT_UPDATE_REPORTING_TIMEZONE
): ShiftRecordSelection {
  const parts = timeZoneParts(date, timezone);
  const localDate = isoDate(parts.year, parts.month, parts.day);
  const minutesAfterMidnight = (parts.hour * 60) + parts.minute;
  const dayStartsAt = (6 * 60) + 30;
  const nightStartsAt = (18 * 60) + 30;

  if (minutesAfterMidnight < dayStartsAt) {
    return {
      shiftDate: addIsoDays(localDate, -1),
      shiftType: "night"
    };
  }

  if (minutesAfterMidnight < nightStartsAt) {
    return {
      shiftDate: localDate,
      shiftType: "day"
    };
  }

  return {
    shiftDate: localDate,
    shiftType: "night"
  };
}

export function reportingWindowForInstant(
  date = new Date(),
  timezone = SHIFT_UPDATE_REPORTING_TIMEZONE
): ShiftUpdateReportingWindow {
  const parts = timeZoneParts(date, timezone);
  const localDate = isoDate(parts.year, parts.month, parts.day);

  let localStartDate = localDate;
  let localEndDate = localDate;
  let startTime = "04:00";
  let endTime = "16:00";
  let cycle: ShiftUpdateReportingWindow["cycle"] = "morning";

  if (parts.hour >= 16) {
    startTime = "16:00";
    endTime = "04:00";
    localEndDate = addIsoDays(localDate, 1);
    cycle = "evening";
  } else if (parts.hour < 4) {
    localStartDate = addIsoDays(localDate, -1);
    startTime = "16:00";
    endTime = "04:00";
    cycle = "evening";
  }

  const startsAt = wallTimeToIso(localStartDate, startTime, timezone);
  const endsAt = wallTimeToIso(localEndDate, endTime, timezone);

  if (!startsAt || !endsAt) {
    throw new Error(`Unable to resolve Shift Update reporting window for ${timezone}.`);
  }

  return {
    id: startsAt,
    startsAt,
    endsAt,
    localStartDate,
    cycle
  };
}

export function reportingWindowContainsInstant(
  window: ShiftUpdateReportingWindow,
  value: string | Date
) {
  const instant = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const startsAt = new Date(window.startsAt).getTime();
  const endsAt = new Date(window.endsAt).getTime();

  return Number.isFinite(instant) && instant >= startsAt && instant < endsAt;
}

export function latestReportingWindowUpdate(
  updates: ShiftStatusUpdate[],
  window: ShiftUpdateReportingWindow
) {
  return [...updates]
    .filter((update) => reportingWindowContainsInstant(window, update.created_at))
    .sort((left, right) => {
      const createdDifference = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      if (createdDifference !== 0) {
        return createdDifference;
      }

      return right.id.localeCompare(left.id);
    })[0] ?? null;
}

export function reportingWindowEndDelay(
  window: ShiftUpdateReportingWindow,
  date = new Date()
) {
  return Math.max(0, new Date(window.endsAt).getTime() - date.getTime());
}
