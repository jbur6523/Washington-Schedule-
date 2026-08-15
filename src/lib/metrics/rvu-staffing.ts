import type { ShiftStatusShiftType } from "@/lib/shift-status/types";

export const RVUS_PER_RT = 27;

export const metricDateRanges = [
  { value: "7", label: "7 Days", days: 7 },
  { value: "30", label: "30 Days", days: 30 },
  { value: "90", label: "90 Days", days: 90 },
  { value: "365", label: "1 Year", days: 365 },
  { value: "all", label: "All Data", days: null }
] as const;

export const metricShiftFilters = [
  { value: "all", label: "All Shifts" },
  { value: "day", label: "Day" },
  { value: "night", label: "Night" }
] as const;

export type MetricDateRange = (typeof metricDateRanges)[number]["value"];
export type MetricShiftFilter = (typeof metricShiftFilters)[number]["value"];

export type RvuStaffingMetricRow = {
  id: string;
  shift_date: string;
  shift_type: ShiftStatusShiftType;
  rvu_total: number | string | null;
  rts_on: number;
  created_at: string;
  updated_at: string;
};

export type CalculatedRvuStaffingRow = Omit<RvuStaffingMetricRow, "rvu_total"> & {
  rvuTotal: number;
  exactRtsNeeded: number;
  staffingVariance: number;
  metNeed: boolean;
  season: string;
};

export type RvuStaffingSummary = {
  shiftCount: number;
  averageRvus: number | null;
  averageRtsNeeded: number | null;
  averageRtsOn: number | null;
  percentageMeetingNeed: number | null;
  averageStaffingVariance: number | null;
};

export function exactRtsNeededFromRvus(value: number) {
  return value / RVUS_PER_RT;
}

export function roundStaffingToOneDecimal(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function rtsNeededFromRvus(value: string | number) {
  const textValue = String(value).trim();
  const rvuTotal = Number(textValue);

  if (!textValue || !Number.isFinite(rvuTotal) || rvuTotal < 0) {
    return null;
  }

  return roundStaffingToOneDecimal(exactRtsNeededFromRvus(rvuTotal));
}

export function formatOneDecimal(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  const rounded = roundStaffingToOneDecimal(value);
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}

export function canonicalMetricRows(rows: RvuStaffingMetricRow[]) {
  const sorted = [...rows].sort((left, right) => {
    const updatedDifference = new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    if (updatedDifference !== 0) {
      return updatedDifference;
    }

    const createdDifference = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    return createdDifference || right.id.localeCompare(left.id);
  });
  const windows = new Map<string, RvuStaffingMetricRow>();

  for (const row of sorted) {
    const key = `${row.shift_date}:${row.shift_type}`;
    if (!windows.has(key)) {
      windows.set(key, row);
    }
  }

  return Array.from(windows.values());
}

export function seasonForReportingDate(dateValue: string) {
  const [year, month] = dateValue.split("-").map(Number);

  if (month === 12 || month <= 2) {
    return `Winter ${month === 12 ? year + 1 : year}`;
  }

  if (month <= 5) {
    return `Spring ${year}`;
  }

  if (month <= 8) {
    return `Summer ${year}`;
  }

  return `Fall ${year}`;
}

export function calculateMetricRows(rows: RvuStaffingMetricRow[]) {
  return canonicalMetricRows(rows)
    .flatMap((row): CalculatedRvuStaffingRow[] => {
      if (row.rvu_total === null) {
        return [];
      }

      const rvuTotal = Number(row.rvu_total);
      const rtsOn = Number(row.rts_on);
      if (!Number.isFinite(rvuTotal) || rvuTotal < 0 || !Number.isFinite(rtsOn) || rtsOn < 0) {
        return [];
      }

      const exactRtsNeeded = exactRtsNeededFromRvus(rvuTotal);
      return [{
        ...row,
        rts_on: rtsOn,
        rvuTotal,
        exactRtsNeeded,
        staffingVariance: rtsOn - exactRtsNeeded,
        metNeed: rtsOn >= exactRtsNeeded,
        season: seasonForReportingDate(row.shift_date)
      }];
    })
    .sort((left, right) => {
      const dateDifference = left.shift_date.localeCompare(right.shift_date);
      if (dateDifference !== 0) {
        return dateDifference;
      }

      return left.shift_type === right.shift_type ? 0 : left.shift_type === "day" ? -1 : 1;
    });
}

function average(values: number[]) {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

export function summarizeMetricRows(rows: CalculatedRvuStaffingRow[]): RvuStaffingSummary {
  if (rows.length === 0) {
    return {
      shiftCount: 0,
      averageRvus: null,
      averageRtsNeeded: null,
      averageRtsOn: null,
      percentageMeetingNeed: null,
      averageStaffingVariance: null
    };
  }

  return {
    shiftCount: rows.length,
    averageRvus: average(rows.map((row) => row.rvuTotal)),
    averageRtsNeeded: average(rows.map((row) => row.exactRtsNeeded)),
    averageRtsOn: average(rows.map((row) => row.rts_on)),
    percentageMeetingNeed: (rows.filter((row) => row.metNeed).length / rows.length) * 100,
    averageStaffingVariance: average(rows.map((row) => row.staffingVariance))
  };
}

export function groupMetricRows(
  rows: CalculatedRvuStaffingRow[],
  keyForRow: (row: CalculatedRvuStaffingRow) => string
) {
  const groups = new Map<string, CalculatedRvuStaffingRow[]>();

  for (const row of rows) {
    const key = keyForRow(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.entries()).map(([label, groupRows]) => ({
    label,
    rows: groupRows,
    summary: summarizeMetricRows(groupRows)
  }));
}

export function parseMetricDateRange(value: string | string[] | undefined): MetricDateRange {
  const candidate = Array.isArray(value) ? value[0] : value;
  return metricDateRanges.some((range) => range.value === candidate)
    ? candidate as MetricDateRange
    : "30";
}

export function parseMetricShiftFilter(value: string | string[] | undefined): MetricShiftFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return metricShiftFilters.some((shift) => shift.value === candidate)
    ? candidate as MetricShiftFilter
    : "all";
}

export function minimumShiftDateForRange(range: MetricDateRange, currentReportingDate: string) {
  const days = metricDateRanges.find((option) => option.value === range)?.days ?? null;
  if (days === null) {
    return null;
  }

  const [year, month, day] = currentReportingDate.split("-").map(Number);
  const minimum = new Date(Date.UTC(year, month - 1, day - (days - 1)));
  return [
    minimum.getUTCFullYear().toString().padStart(4, "0"),
    (minimum.getUTCMonth() + 1).toString().padStart(2, "0"),
    minimum.getUTCDate().toString().padStart(2, "0")
  ].join("-");
}
