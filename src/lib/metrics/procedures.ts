import { procedureCounts, procedureTotal } from "@/lib/shift-status/procedures";
import { SHIFT_UPDATE_REPORTING_TIMEZONE } from "@/lib/shift-status/reporting-window";
import type { ShiftStatusShiftType, ShiftStatusUpdate } from "@/lib/shift-status/types";
import { timeZoneParts } from "@/lib/time/zoned-date-time";

export const PROCEDURE_METRICS_TIMEZONE = SHIFT_UPDATE_REPORTING_TIMEZONE;

export type ProcedureMetricRow = {
  id: string;
  shift_date: string;
  shift_type: ShiftStatusShiftType;
  is_canonical: boolean;
  c_section_count: number;
  vaginal_delivery_count: number;
  cabg_count: number;
  bronch_count: number;
  sputum_induction_count: number;
  other_procedure_count: number;
  created_at?: string;
  updated_at?: string;
};

export type DailyProcedureMetric = {
  date: string;
  day: number | null;
  night: number | null;
  total: number;
};

export type ProcedureMonthSummary = {
  month: string;
  days: DailyProcedureMetric[];
  calendarDaysRepresented: number;
  completedShifts: number;
  total: number;
  dayTotal: number;
  nightTotal: number;
  dailyAverage: number;
};

export type ProcedureMonthComparison = {
  difference: number;
  percentage: number | null;
};

export type ProcedureMetricsReport = {
  selected: ProcedureMonthSummary;
  previous: ProcedureMonthSummary;
  comparison: ProcedureMonthComparison;
};

function isoDate(year: number, month: number, day: number) {
  return [year, month, day]
    .map((value, index) => value.toString().padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

export function monthForInstant(
  now = new Date(),
  timezone = PROCEDURE_METRICS_TIMEZONE
) {
  const parts = timeZoneParts(now, timezone);
  return isoDate(parts.year, parts.month, 1).slice(0, 7);
}

export function previousMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 1).slice(0, 7);
}

export function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 1).slice(0, 7);
}

export function daysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function parseProcedureMonth(
  value: string | string[] | undefined,
  now = new Date(),
  timezone = PROCEDURE_METRICS_TIMEZONE
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const currentMonth = monthForInstant(now, timezone);

  if (!candidate || !/^\d{4}-(0[1-9]|1[0-2])$/.test(candidate) || candidate > currentMonth) {
    return currentMonth;
  }

  return candidate;
}

export function procedureMonthQueryRange(
  month: string,
  now = new Date(),
  timezone = PROCEDURE_METRICS_TIMEZONE
) {
  const currentMonth = monthForInstant(now, timezone);
  const localToday = timeZoneParts(now, timezone);
  const monthEnd = `${month}-${daysInMonth(month).toString().padStart(2, "0")}`;

  return {
    minimumShiftDate: `${previousMonth(month)}-01`,
    maximumShiftDate: month === currentMonth
      ? isoDate(localToday.year, localToday.month, localToday.day)
      : monthEnd
  };
}

function procedureValue(row: ProcedureMetricRow) {
  const values = [
    row.c_section_count,
    row.vaginal_delivery_count,
    row.cabg_count,
    row.bronch_count,
    row.sputum_induction_count,
    row.other_procedure_count
  ];

  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    return null;
  }

  return procedureTotal(procedureCounts(row as ShiftStatusUpdate));
}

export function canonicalProcedureRows(rows: ProcedureMetricRow[]) {
  const windows = new Map<string, ProcedureMetricRow>();
  const canonicalRows = rows
    .filter((row) => row.is_canonical)
    .sort((left, right) => {
      const updatedDifference = (right.updated_at ?? "").localeCompare(left.updated_at ?? "");
      if (updatedDifference !== 0) return updatedDifference;
      const createdDifference = (right.created_at ?? "").localeCompare(left.created_at ?? "");
      return createdDifference || right.id.localeCompare(left.id);
    });

  for (const row of canonicalRows) {
    const key = `${row.shift_date}:${row.shift_type}`;
    if (!windows.has(key) && procedureValue(row) !== null) {
      windows.set(key, row);
    }
  }

  return Array.from(windows.values());
}

export function summarizeProcedureMonth(
  rows: ProcedureMetricRow[],
  month: string,
  now = new Date(),
  timezone = PROCEDURE_METRICS_TIMEZONE
): ProcedureMonthSummary {
  const currentMonth = monthForInstant(now, timezone);
  const localToday = timeZoneParts(now, timezone);
  const calendarDaysRepresented = month === currentMonth
    ? localToday.day
    : daysInMonth(month);
  const valuesByWindow = new Map<string, number>();

  for (const row of canonicalProcedureRows(rows)) {
    if (row.shift_date.startsWith(`${month}-`)) {
      const value = procedureValue(row);
      if (value !== null) {
        valuesByWindow.set(`${row.shift_date}:${row.shift_type}`, value);
      }
    }
  }

  const days = Array.from({ length: calendarDaysRepresented }, (_, index): DailyProcedureMetric => {
    const date = `${month}-${(index + 1).toString().padStart(2, "0")}`;
    const day = valuesByWindow.get(`${date}:day`) ?? null;
    const night = valuesByWindow.get(`${date}:night`) ?? null;
    return { date, day, night, total: (day ?? 0) + (night ?? 0) };
  });
  const dayTotal = days.reduce((total, day) => total + (day.day ?? 0), 0);
  const nightTotal = days.reduce((total, day) => total + (day.night ?? 0), 0);
  const total = dayTotal + nightTotal;

  return {
    month,
    days,
    calendarDaysRepresented,
    completedShifts: days.reduce(
      (count, day) => count + Number(day.day !== null) + Number(day.night !== null),
      0
    ),
    total,
    dayTotal,
    nightTotal,
    dailyAverage: calendarDaysRepresented === 0 ? 0 : total / calendarDaysRepresented
  };
}

export function buildProcedureMetricsReport(
  rows: ProcedureMetricRow[],
  month: string,
  now = new Date(),
  timezone = PROCEDURE_METRICS_TIMEZONE
): ProcedureMetricsReport {
  const selected = summarizeProcedureMonth(rows, month, now, timezone);
  const previous = summarizeProcedureMonth(rows, previousMonth(month), now, timezone);
  const difference = selected.total - previous.total;

  return {
    selected,
    previous,
    comparison: {
      difference,
      percentage: previous.total === 0 ? null : (difference / previous.total) * 100
    }
  };
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric"
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function dateLabel(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function monthHref(month: string) {
  return `/admin/metrics/procedures?month=${month}`;
}
