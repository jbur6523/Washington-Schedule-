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

function addIsoDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return isoDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
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
