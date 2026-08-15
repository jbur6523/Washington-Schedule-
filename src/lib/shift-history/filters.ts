import { addIsoDays, SHIFT_UPDATE_REPORTING_TIMEZONE } from "@/lib/shift-status/reporting-window";
import { timeZoneParts, wallTimeToIso } from "@/lib/time/zoned-date-time";

export type ShiftHistoryRange = "24h" | "7d" | "30d" | "custom";
export type ShiftHistoryShift = "all" | "day" | "night";

export type ShiftHistoryFilters = {
  range: ShiftHistoryRange;
  shift: ShiftHistoryShift;
  from: string;
  to: string;
  page: number;
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function localIsoDate(now: Date, timezone: string) {
  const parts = timeZoneParts(now, timezone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function parseShiftHistoryFilters(values: Record<string, string | string[] | undefined>) {
  const rawRange = Array.isArray(values.range) ? values.range[0] : values.range;
  const rawShift = Array.isArray(values.shift) ? values.shift[0] : values.shift;
  const rawFrom = Array.isArray(values.from) ? values.from[0] : values.from;
  const rawTo = Array.isArray(values.to) ? values.to[0] : values.to;
  const rawPage = Array.isArray(values.page) ? values.page[0] : values.page;

  return {
    range: (["24h", "7d", "30d", "custom"] as const).includes(rawRange as ShiftHistoryRange)
      ? rawRange as ShiftHistoryRange
      : "24h",
    shift: (["all", "day", "night"] as const).includes(rawShift as ShiftHistoryShift)
      ? rawShift as ShiftHistoryShift
      : "all",
    from: rawFrom && isoDatePattern.test(rawFrom) ? rawFrom : "",
    to: rawTo && isoDatePattern.test(rawTo) ? rawTo : "",
    page: Math.max(1, Math.min(500, Number.parseInt(rawPage ?? "1", 10) || 1))
  } satisfies ShiftHistoryFilters;
}

export function shiftHistoryInstantRange(
  filters: ShiftHistoryFilters,
  now = new Date(),
  timezone = SHIFT_UPDATE_REPORTING_TIMEZONE
) {
  const end = now;

  if (filters.range !== "custom") {
    const durationDays = filters.range === "24h" ? 1 : filters.range === "7d" ? 7 : 30;
    return {
      startsAt: new Date(now.getTime() - durationDays * 24 * 60 * 60 * 1000).toISOString(),
      endsAt: end.toISOString(),
      error: ""
    };
  }

  const defaults = defaultCustomHistoryDates(now, timezone);
  const from = !filters.from && !filters.to ? defaults.from : filters.from;
  const to = !filters.from && !filters.to ? defaults.to : filters.to;

  if (!from || !to || from > to) {
    return { startsAt: "", endsAt: "", error: "Choose a valid From and To date." };
  }

  const startsAt = wallTimeToIso(from, "00:00", timezone);
  const requestedEnd = wallTimeToIso(addIsoDays(to, 1), "00:00", timezone);

  if (!startsAt || !requestedEnd) {
    return { startsAt: "", endsAt: "", error: "The custom date range could not be resolved." };
  }

  return {
    startsAt,
    endsAt: new Date(Math.min(new Date(requestedEnd).getTime(), end.getTime())).toISOString(),
    error: ""
  };
}

export function defaultCustomHistoryDates(now = new Date(), timezone = SHIFT_UPDATE_REPORTING_TIMEZONE) {
  const to = localIsoDate(now, timezone);
  return { from: addIsoDays(to, -7), to };
}
