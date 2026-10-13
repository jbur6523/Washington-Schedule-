import { canonicalMetricRows, type RvuStaffingMetricRow } from "./rvu-staffing";

export function rvuHistoryWindow(shiftDate: string) {
  const date = new Date(`${shiftDate}T12:00:00Z`);
  const offset = (days: number) => {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  return { minimumShiftDate: offset(-15), maximumShiftDate: offset(-1) };
}

export function compareShiftRvus(current: Pick<RvuStaffingMetricRow, "shift_date" | "shift_type" | "rvu_total">, rows: RvuStaffingMetricRow[]) {
  const window = rvuHistoryWindow(current.shift_date);
  const values = canonicalMetricRows(rows).filter((row) =>
    row.shift_type === current.shift_type && row.shift_date >= window.minimumShiftDate && row.shift_date <= window.maximumShiftDate
  ).flatMap((row) => {
    const value = row.rvu_total === null || String(row.rvu_total).trim() === "" ? NaN : Number(row.rvu_total);
    return Number.isFinite(value) && value >= 0 ? [value] : [];
  });
  const total = current.rvu_total === null || String(current.rvu_total).trim() === "" ? NaN : Number(current.rvu_total);
  const currentRvus = Number.isFinite(total) && total >= 0 ? total : null;
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const percent = currentRvus !== null && average !== null && average > 0 ? (currentRvus - average) / average * 100 : null;
  const label = currentRvus === null ? "RVUs not recorded" : values.length < 10 ? "Not enough history"
    : average === 0 ? (currentRvus === 0 ? "Near average" : "Comparison unavailable")
    : percent! > 10 + 1e-9 ? "Above average" : percent! < -10 - 1e-9 ? "Below average" : "Near average";
  return { currentRvus, average, percent, count: values.length, label, ...window };
}
