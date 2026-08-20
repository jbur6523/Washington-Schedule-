import Link from "next/link";
import type { CalculatedRvuStaffingRow, MetricDateRange, MetricShiftFilter, RvuStaffingSummary } from "@/lib/metrics/rvu-staffing";
import {
  formatOneDecimal,
  groupMetricRows,
  metricDateRanges,
  metricShiftFilters,
  summarizeMetricRows
} from "@/lib/metrics/rvu-staffing";

function formatReportingDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatPercentage(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</h2>
      <p className="mt-1 text-2xl font-black text-hospital-ink">{value}</p>
      {helper && <p className="mt-1 text-xs font-bold text-slate-500">{helper}</p>}
    </article>
  );
}

function RvuTrendChart({ rows }: { rows: CalculatedRvuStaffingRow[] }) {
  const width = 720;
  const height = 220;
  const padding = 32;
  const values = rows.map((row) => row.rvuTotal);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(1, maximum - minimum);
  const points = rows.map((row, index) => {
    const x = rows.length === 1
      ? width / 2
      : padding + (index / (rows.length - 1)) * (width - padding * 2);
    const y = height - padding - ((row.rvuTotal - minimum) / span) * (height - padding * 2);
    return { row, x, y };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby="rvu-trend-title rvu-trend-description"
      className="h-auto w-full min-w-[36rem]"
    >
      <title id="rvu-trend-title">RVU trend by reporting window</title>
      <desc id="rvu-trend-description">
        Chronological raw RVU totals. Exact values are also available in the table below.
      </desc>
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5e1" />
      <polyline
        points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="#0e7490"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map(({ row, x, y }) => (
        <circle key={row.id} cx={x} cy={y} r="5" fill="#0891b2">
          <title>{`${formatReportingDate(row.shift_date)} ${row.shift_type}: ${row.rvuTotal} RVUs`}</title>
        </circle>
      ))}
      <text x={padding} y={20} className="fill-slate-500 text-[12px] font-bold">{maximum.toFixed(1)}</text>
      <text x={padding} y={height - 8} className="fill-slate-500 text-[12px] font-bold">{minimum.toFixed(1)}</text>
    </svg>
  );
}

function ComparisonTable({ groups }: { groups: Array<{ label: string; summary: RvuStaffingSummary }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-3">Group</th>
            <th className="px-3 py-3 text-right">Shifts</th>
            <th className="px-3 py-3 text-right">Avg RVUs</th>
            <th className="px-3 py-3 text-right">Avg RTs Needed</th>
            <th className="px-3 py-3 text-right">Avg RTs On Shift</th>
            <th className="px-3 py-3 text-right">Meeting Need</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map(({ label, summary }) => (
            <tr key={label}>
              <th className="px-3 py-3 font-black text-hospital-ink">{label}</th>
              <td className="px-3 py-3 text-right font-bold text-slate-700">{summary.shiftCount}</td>
              <td className="px-3 py-3 text-right font-bold text-slate-700">{formatOneDecimal(summary.averageRvus)}</td>
              <td className="px-3 py-3 text-right font-bold text-slate-700">{formatOneDecimal(summary.averageRtsNeeded)}</td>
              <td className="px-3 py-3 text-right font-bold text-slate-700">{formatOneDecimal(summary.averageRtsOn)}</td>
              <td className="px-3 py-3 text-right font-bold text-slate-700">{formatPercentage(summary.percentageMeetingNeed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RvuStaffingMetrics({
  rows,
  range,
  shift,
  loadError = false
}: {
  rows: CalculatedRvuStaffingRow[];
  range: MetricDateRange;
  shift: MetricShiftFilter;
  loadError?: boolean;
}) {
  const summary = summarizeMetricRows(rows);
  const shiftGroups = (["day", "night"] as const).map((shiftType) => ({
    label: shiftType === "day" ? "Day Shift" : "Night Shift",
    summary: summarizeMetricRows(rows.filter((row) => row.shift_type === shiftType))
  }));
  const seasonalGroups = groupMetricRows(rows, (row) => row.season)
    .reverse()
    .map(({ label, summary: seasonalSummary }) => ({ label, summary: seasonalSummary }));

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Admin</p>
          <h1 className="mt-2 text-2xl font-black text-hospital-ink">RVU &amp; Staffing Metrics</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Reporting-window staffing trends from exact saved RVUs and manually entered RTs On Shift.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/admin/metrics"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
            >
              Back to Metrics
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Date Range</span>
              <select name="range" defaultValue={range} className="mt-1 h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink">
                {metricDateRanges.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Shift</span>
              <select name="shift" defaultValue={shift} className="mt-1 h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink">
                {metricShiftFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button type="submit" className="min-h-11 rounded-2xl bg-cyan-700 px-5 text-sm font-black text-white shadow-sm">
              Apply Filters
            </button>
          </form>
        </section>

        {loadError ? (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-center shadow-soft">
            <h2 className="font-black text-rose-900">Metrics are temporarily unavailable.</h2>
            <p className="mt-1 text-sm font-bold text-rose-700">Please try again.</p>
          </section>
        ) : rows.length === 0 ? (
          <section className="rounded-3xl border border-slate-200 bg-white/95 p-8 text-center shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">No RVU data for these filters</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">
              Historical shifts without saved RVUs are excluded rather than counted as zero.
            </p>
          </section>
        ) : (
          <>
            <section aria-label="Metrics summary" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
              <SummaryCard label="Shifts with RVU Data" value={String(summary.shiftCount)} />
              <SummaryCard label="Average RVUs" value={formatOneDecimal(summary.averageRvus)} helper="per reporting window" />
              <SummaryCard label="Average RTs Needed" value={formatOneDecimal(summary.averageRtsNeeded)} />
              <SummaryCard label="Average RTs On Shift" value={formatOneDecimal(summary.averageRtsOn)} />
              <SummaryCard label="Meeting or Exceeding Need" value={formatPercentage(summary.percentageMeetingNeed)} />
              <SummaryCard label="Average Staffing Variance" value={formatOneDecimal(summary.averageStaffingVariance)} helper="RTs On Shift − exact need" />
            </section>

            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">RVU Trend</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">Chronological raw RVUs by reporting window</p>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
                <RvuTrendChart rows={rows} />
              </div>
            </section>

            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">Reporting-Window Detail</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[56rem] text-left text-sm">
                  <thead className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Reporting Date</th>
                      <th className="px-3 py-3">Shift</th>
                      <th className="px-3 py-3 text-right">RVUs</th>
                      <th className="px-3 py-3 text-right">RTs Needed</th>
                      <th className="px-3 py-3 text-right">RTs On Shift</th>
                      <th className="px-3 py-3 text-right">Variance</th>
                      <th className="px-3 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3 font-black text-hospital-ink">{formatReportingDate(row.shift_date)}</td>
                        <td className="px-3 py-3 font-bold capitalize text-slate-700">{row.shift_type}</td>
                        <td className="px-3 py-3 text-right font-bold text-slate-700">{row.rvuTotal}</td>
                        <td className="px-3 py-3 text-right font-bold text-slate-700">{formatOneDecimal(row.exactRtsNeeded)}</td>
                        <td className="px-3 py-3 text-right font-bold text-slate-700">{formatOneDecimal(row.rts_on)}</td>
                        <td className={`px-3 py-3 text-right font-black ${row.staffingVariance < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                          {formatOneDecimal(row.staffingVariance)}
                        </td>
                        <td className="px-3 py-3 text-right font-black text-slate-700">{row.metNeed ? "Met Need" : "Below Need"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">Day vs Night</h2>
              <div className="mt-3"><ComparisonTable groups={shiftGroups} /></div>
            </section>

            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">Seasonal Summary</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">Winter Dec–Feb · Spring Mar–May · Summer Jun–Aug · Fall Sep–Nov</p>
              <div className="mt-3"><ComparisonTable groups={seasonalGroups} /></div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
