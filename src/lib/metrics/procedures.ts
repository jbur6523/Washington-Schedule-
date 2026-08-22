import { SHIFT_UPDATE_REPORTING_TIMEZONE } from "@/lib/shift-status/reporting-window";
import type { ShiftStatusShiftType } from "@/lib/shift-status/types";
import { timeZoneParts } from "@/lib/time/zoned-date-time";

export const PROCEDURE_METRICS_TIMEZONE = SHIFT_UPDATE_REPORTING_TIMEZONE;
export const RELIABLE_PROCEDURE_HISTORY_START_DATE = "2026-08-14";

export const PROCEDURE_TYPES = [
  { id: "cSections", field: "c_section_count", label: "C-Sections" },
  { id: "vaginalDeliveries", field: "vaginal_delivery_count", label: "Vaginal Deliveries" },
  { id: "cabg", field: "cabg_count", label: "CABG" },
  { id: "bronchs", field: "bronch_count", label: "Bronchs" },
  { id: "sputumInductions", field: "sputum_induction_count", label: "Sputum Inductions" },
  { id: "mri", field: "other_procedure_count", label: "MRI" }
] as const;

export type ProcedureType = (typeof PROCEDURE_TYPES)[number];
export type ProcedureTypeId = ProcedureType["id"];
export type ProcedureTypeTotals = Record<ProcedureTypeId, number>;

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

export type ProcedureShiftMetric = {
  counts: ProcedureTypeTotals;
  total: number;
};

export type DailyProcedureMetric = {
  date: string;
  day: ProcedureShiftMetric | null;
  night: ProcedureShiftMetric | null;
  counts: ProcedureTypeTotals;
  total: number;
};

export type ProcedureMonthSummary = {
  month: string;
  days: DailyProcedureMetric[];
  calendarDaysRepresented: number;
  reportedShifts: number;
  counts: ProcedureTypeTotals;
  total: number;
  dayTotal: number;
  nightTotal: number;
  dailyAverage: number;
  reportedShiftAverage: number | null;
  hasReliableFullMonth: boolean;
};

export type ProcedureChange = {
  difference: number;
  percentage: number | null;
};

export type ProcedureTypeComparison = ProcedureType & {
  selectedTotal: number;
  previousTotal: number;
  difference: number;
  percentage: number | null;
  share: number;
};

export type ProcedureMonthlyTrend = {
  month: string;
  total: number;
  dailyAverage: number;
  reportedShifts: number;
  status: "complete" | "month-to-date" | "partial-coverage";
  rollingAverage: number | null;
  rollingAverageMonthCount: number;
  comparison: ProcedureChange | null;
};

export type ProcedureMetricsReport = {
  selected: ProcedureMonthSummary;
  previous: ProcedureMonthSummary;
  comparison: ProcedureChange;
  comparisonPeriodLabel: string;
  selectedPeriodLabel: string;
  typeComparisons: ProcedureTypeComparison[];
  threeMonthAverage: number | null;
  threeMonthAverageMonths: string[];
  trend: ProcedureMonthlyTrend[];
  reliableHistoryStartDate: string;
};

function isoDate(year: number, month: number, day: number) {
  return [year, month, day]
    .map((value, index) => value.toString().padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function emptyProcedureTotals(): ProcedureTypeTotals {
  return {
    cSections: 0,
    vaginalDeliveries: 0,
    cabg: 0,
    bronchs: 0,
    sputumInductions: 0,
    mri: 0
  };
}

function addProcedureTotals(left: ProcedureTypeTotals, right: ProcedureTypeTotals) {
  const result = emptyProcedureTotals();

  for (const procedure of PROCEDURE_TYPES) {
    result[procedure.id] = left[procedure.id] + right[procedure.id];
  }

  return result;
}

export function procedureTotal(counts: ProcedureTypeTotals) {
  return PROCEDURE_TYPES.reduce((total, procedure) => total + counts[procedure.id], 0);
}

export function procedureCountsForRow(row: ProcedureMetricRow): ProcedureTypeTotals | null {
  const counts = emptyProcedureTotals();

  for (const procedure of PROCEDURE_TYPES) {
    const value = row[procedure.field];
    if (!Number.isInteger(value) || value < 0) {
      return null;
    }
    counts[procedure.id] = value;
  }

  return counts;
}

export function monthForInstant(
  now = new Date(),
  timezone = PROCEDURE_METRICS_TIMEZONE
) {
  const parts = timeZoneParts(now, timezone);
  return isoDate(parts.year, parts.month, 1).slice(0, 7);
}

export function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 1).slice(0, 7);
}

export function previousMonth(month: string) {
  return shiftMonth(month, -1);
}

export function nextMonth(month: string) {
  return shiftMonth(month, 1);
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
  const firstTrackedMonth = RELIABLE_PROCEDURE_HISTORY_START_DATE.slice(0, 7);

  if (!candidate || !/^\d{4}-(0[1-9]|1[0-2])$/.test(candidate) || candidate > currentMonth) {
    return currentMonth;
  }

  return candidate < firstTrackedMonth ? firstTrackedMonth : candidate;
}

export function procedureMonthQueryRange(
  month: string,
  now = new Date(),
  timezone = PROCEDURE_METRICS_TIMEZONE
) {
  const currentMonth = monthForInstant(now, timezone);
  const localToday = timeZoneParts(now, timezone);
  const earliestTrendDate = `${shiftMonth(month, -23)}-01`;

  return {
    minimumShiftDate: earliestTrendDate < RELIABLE_PROCEDURE_HISTORY_START_DATE
      ? RELIABLE_PROCEDURE_HISTORY_START_DATE
      : earliestTrendDate,
    maximumShiftDate: month === currentMonth
      ? isoDate(localToday.year, localToday.month, localToday.day)
      : `${month}-${daysInMonth(month).toString().padStart(2, "0")}`
  };
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
    if (!windows.has(key) && procedureCountsForRow(row) !== null) {
      windows.set(key, row);
    }
  }

  return Array.from(windows.values());
}

function reliableFullMonth(month: string) {
  return `${month}-01` >= RELIABLE_PROCEDURE_HISTORY_START_DATE;
}

function firstTrackedDay(month: string) {
  const startMonth = RELIABLE_PROCEDURE_HISTORY_START_DATE.slice(0, 7);
  if (month < startMonth) return null;
  return month === startMonth
    ? Number(RELIABLE_PROCEDURE_HISTORY_START_DATE.slice(-2))
    : 1;
}

export function summarizeProcedureMonth(
  rows: ProcedureMetricRow[],
  month: string,
  now = new Date(),
  timezone = PROCEDURE_METRICS_TIMEZONE,
  periodEndDay?: number
): ProcedureMonthSummary {
  const currentMonth = monthForInstant(now, timezone);
  const localToday = timeZoneParts(now, timezone);
  const defaultEndDay = month === currentMonth ? localToday.day : daysInMonth(month);
  const endDay = Math.max(0, Math.min(
    periodEndDay ?? defaultEndDay,
    daysInMonth(month)
  ));
  const startDay = firstTrackedDay(month);
  const calendarDaysRepresented = startDay === null || endDay < startDay
    ? 0
    : endDay - startDay + 1;
  const valuesByWindow = new Map<string, ProcedureShiftMetric>();

  for (const row of canonicalProcedureRows(rows)) {
    const day = Number(row.shift_date.slice(-2));
    if (
      row.shift_date >= RELIABLE_PROCEDURE_HISTORY_START_DATE
      && row.shift_date.startsWith(`${month}-`)
      && startDay !== null
      && day >= startDay
      && day <= endDay
    ) {
      const counts = procedureCountsForRow(row);
      if (counts !== null) {
        valuesByWindow.set(`${row.shift_date}:${row.shift_type}`, {
          counts,
          total: procedureTotal(counts)
        });
      }
    }
  }

  const days = Array.from({ length: calendarDaysRepresented }, (_, index): DailyProcedureMetric => {
    const date = `${month}-${((startDay ?? 1) + index).toString().padStart(2, "0")}`;
    const day = valuesByWindow.get(`${date}:day`) ?? null;
    const night = valuesByWindow.get(`${date}:night`) ?? null;
    const counts = addProcedureTotals(
      day?.counts ?? emptyProcedureTotals(),
      night?.counts ?? emptyProcedureTotals()
    );
    return { date, day, night, counts, total: procedureTotal(counts) };
  });
  const counts = days.reduce(
    (total, day) => addProcedureTotals(total, day.counts),
    emptyProcedureTotals()
  );
  const dayTotal = days.reduce((total, day) => total + (day.day?.total ?? 0), 0);
  const nightTotal = days.reduce((total, day) => total + (day.night?.total ?? 0), 0);
  const total = procedureTotal(counts);
  const reportedShifts = days.reduce(
    (count, day) => count + Number(day.day !== null) + Number(day.night !== null),
    0
  );

  return {
    month,
    days,
    calendarDaysRepresented,
    reportedShifts,
    counts,
    total,
    dayTotal,
    nightTotal,
    dailyAverage: calendarDaysRepresented === 0 ? 0 : total / calendarDaysRepresented,
    reportedShiftAverage: reportedShifts === 0 ? null : total / reportedShifts,
    hasReliableFullMonth: reliableFullMonth(month)
  };
}

function calculateChange(current: number, previous: number): ProcedureChange {
  const difference = current - previous;
  return {
    difference,
    percentage: previous === 0 ? null : (difference / previous) * 100
  };
}

function periodLabel(month: string, startDay: number, endDay: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthName = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long"
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return startDay > endDay ? "No tracked prior period" : `${monthName} ${startDay}–${endDay}`;
}

function monthsBetween(startMonth: string, endMonth: string) {
  const months: string[] = [];
  let month = startMonth;

  while (month <= endMonth) {
    months.push(month);
    month = nextMonth(month);
  }

  return months;
}

function average(values: number[]) {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

export function buildProcedureMetricsReport(
  rows: ProcedureMetricRow[],
  month: string,
  now = new Date(),
  timezone = PROCEDURE_METRICS_TIMEZONE
): ProcedureMetricsReport {
  const currentMonth = monthForInstant(now, timezone);
  const isCurrentMonth = month === currentMonth;
  const selected = summarizeProcedureMonth(rows, month, now, timezone);
  const comparisonMonth = previousMonth(month);
  const comparisonEndDay = isCurrentMonth
    ? Math.min(selected.calendarDaysRepresented, daysInMonth(comparisonMonth))
    : daysInMonth(comparisonMonth);
  const previous = summarizeProcedureMonth(rows, comparisonMonth, now, timezone, comparisonEndDay);
  const comparison = calculateChange(selected.total, previous.total);
  const typeComparisons = PROCEDURE_TYPES.map((procedure): ProcedureTypeComparison => {
    const selectedTotal = selected.counts[procedure.id];
    const previousTotal = previous.counts[procedure.id];
    const change = calculateChange(selectedTotal, previousTotal);
    return {
      ...procedure,
      selectedTotal,
      previousTotal,
      ...change,
      share: selected.total === 0 ? 0 : (selectedTotal / selected.total) * 100
    };
  });
  const rangeStartMonth = rows.reduce(
    (earliest, row) => row.shift_date.slice(0, 7) < earliest ? row.shift_date.slice(0, 7) : earliest,
    month
  );
  const monthlySummaries = monthsBetween(rangeStartMonth, month).map((summaryMonth) =>
    summarizeProcedureMonth(rows, summaryMonth, now, timezone)
  );
  const availableCompleteMonthsBeforeSelected = monthlySummaries.filter((summary) => (
    summary.month < month
    && summary.reportedShifts > 0
    && summary.hasReliableFullMonth
    && summary.calendarDaysRepresented === daysInMonth(summary.month)
  ));
  const threeMonthSummaries = availableCompleteMonthsBeforeSelected.slice(-3);
  const availableTrendSummaries = monthlySummaries.filter((summary) => summary.reportedShifts > 0);
  const trendSummaries = availableTrendSummaries.slice(-12);
  const trend = trendSummaries.map((summary): ProcedureMonthlyTrend => {
    const isPartialCurrentMonth = summary.month === currentMonth;
    const completedThroughThisMonth = availableTrendSummaries.filter((candidate) => (
      candidate.month <= summary.month
      && candidate.hasReliableFullMonth
      && candidate.month !== currentMonth
    ));
    const rollingInputs = isPartialCurrentMonth
      ? completedThroughThisMonth.filter((candidate) => candidate.month < summary.month).slice(-3)
      : completedThroughThisMonth.slice(-3);
    const priorMonthSummary = monthlySummaries.find((candidate) => candidate.month === previousMonth(summary.month));
    const rowComparison = summary.month === month
      ? comparison
      : priorMonthSummary && priorMonthSummary.reportedShifts > 0
        ? calculateChange(summary.total, priorMonthSummary.total)
        : null;

    return {
      month: summary.month,
      total: summary.total,
      dailyAverage: summary.dailyAverage,
      reportedShifts: summary.reportedShifts,
      status: isPartialCurrentMonth
        ? "month-to-date"
        : summary.hasReliableFullMonth ? "complete" : "partial-coverage",
      rollingAverage: average(rollingInputs.map((candidate) => candidate.total)),
      rollingAverageMonthCount: rollingInputs.length,
      comparison: rowComparison
    };
  });

  return {
    selected,
    previous,
    comparison,
    comparisonPeriodLabel: periodLabel(
      comparisonMonth,
      firstTrackedDay(comparisonMonth) ?? 1,
      firstTrackedDay(comparisonMonth) === null ? 0 : comparisonEndDay
    ),
    selectedPeriodLabel: periodLabel(
      month,
      firstTrackedDay(month) ?? 1,
      firstTrackedDay(month) === null ? 0 : (firstTrackedDay(month) ?? 1) + selected.calendarDaysRepresented - 1
    ),
    typeComparisons,
    threeMonthAverage: average(threeMonthSummaries.map((summary) => summary.total)),
    threeMonthAverageMonths: threeMonthSummaries.map((summary) => summary.month),
    trend,
    reliableHistoryStartDate: RELIABLE_PROCEDURE_HISTORY_START_DATE
  };
}

export function monthLabel(month: string, format: "long" | "short" = "long") {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: format,
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
