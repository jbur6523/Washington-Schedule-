import type { ShiftStatusShiftType, ShiftStatusUpdate } from "@/lib/shift-status/types";

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

function previousDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function zonedDateHour(timezone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");

  return {
    dateValue: `${year}-${month}-${day}`,
    hour
  };
}

export function currentShiftType() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "day" : "night";
}

export function currentShiftStatusWindow(timezone = "America/Los_Angeles") {
  const { dateValue, hour } = zonedDateHour(timezone);

  if (hour >= 8 && hour < 20) {
    return {
      shiftDate: dateValue,
      shiftType: "day" as ShiftStatusShiftType
    };
  }

  if (hour >= 20) {
    return {
      shiftDate: dateValue,
      shiftType: "night" as ShiftStatusShiftType
    };
  }

  return {
    shiftDate: previousDate(dateValue),
    shiftType: "night" as ShiftStatusShiftType
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

export function latestShiftStatus(updates: ShiftStatusUpdate[]) {
  return [...updates].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())[0] ?? null;
}

export function resolveCurrentShiftStatus(updates: ShiftStatusUpdate[], timezone = "America/Los_Angeles") {
  const currentWindow = currentShiftStatusWindow(timezone);
  const currentWindowUpdates = updates.filter(
    (update) => update.shift_date === currentWindow.shiftDate && update.shift_type === currentWindow.shiftType
  );
  const currentLatest = latestShiftStatus(currentWindowUpdates);
  const fallbackLatest = latestShiftStatus(updates);

  return {
    currentWindow,
    latest: currentLatest ?? fallbackLatest,
    currentLatest,
    fallbackLatest,
    showingFallback: !currentLatest && Boolean(fallbackLatest)
  };
}

export function updatedByName(update: ShiftStatusUpdate | null) {
  if (!update) {
    return "Unknown";
  }

  const related = Array.isArray(update.staff_profiles) ? update.staff_profiles[0] : update.staff_profiles;
  return related?.display_name ?? update.updated_by_name ?? "Unknown";
}
