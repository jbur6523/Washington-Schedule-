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

export function currentShiftType() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "day" : "night";
}

export function shiftTypeLabel(shiftType: ShiftStatusShiftType) {
  return shiftType === "day" ? "Day Shift" : "Night Shift";
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

export function updatedByName(update: ShiftStatusUpdate | null) {
  if (!update) {
    return "Unknown";
  }

  const related = Array.isArray(update.staff_profiles) ? update.staff_profiles[0] : update.staff_profiles;
  return related?.display_name ?? update.updated_by_name ?? "Unknown";
}
