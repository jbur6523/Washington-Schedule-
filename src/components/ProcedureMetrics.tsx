import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleMinus,
  ClipboardList,
  Moon,
  Sun,
  TrendingUp
} from "lucide-react";
import {
  PROCEDURE_TYPES,
  dateLabel,
  monthHref,
  monthLabel,
  nextMonth,
  previousMonth,
  type ProcedureChange,
  type ProcedureMetricsReport,
  type ProcedureMonthlyTrend,
  type ProcedureShiftMetric
} from "@/lib/metrics/procedures";

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</h2>
      <p className="mt-1 text-2xl font-black text-hospital-ink">{value}</p>
      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{helper}</p>
    </article>
  );
}

function signedNumber(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function changeDetails(change: ProcedureChange, previousTotal: number, comparisonLabel: string) {
  if (previousTotal === 0) {
    if (change.difference > 0) {
      return {
        direction: "up" as const,
        value: `Up ${change.difference} procedures`,
        helper: `Up from 0 in ${comparisonLabel}`
      };
    }

    return {
      direction: "neutral" as const,
      value: "No change",
      helper: "No procedures recorded in either period"
    };
  }

  if (change.difference === 0) {
    return {
      direction: "neutral" as const,
      value: "No change",
      helper: `Same total as ${comparisonLabel}`
    };
  }

  const direction = change.difference > 0 ? "up" as const : "down" as const;
  const word = direction === "up" ? "Up" : "Down";
  return {
    direction,
    value: `${word} ${Math.abs(change.difference)} procedures`,
    helper: `${Math.abs(change.percentage ?? 0).toFixed(1)}% vs ${comparisonLabel}`
  };
}

function ChangeText({
  change,
  previousTotal,
  compact = false
}: {
  change: ProcedureChange;
  previousTotal: number;
  compact?: boolean;
}) {
  if (previousTotal === 0) {
    return change.difference > 0
      ? <span className="font-extrabold text-emerald-700">Up from 0</span>
      : <span className="font-extrabold text-slate-500">No change</span>;
  }

  if (change.difference === 0) {
    return <span className="font-extrabold text-slate-500">No change</span>;
  }

  const isUp = change.difference > 0;
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 font-extrabold ${isUp ? "text-emerald-700" : "text-rose-700"}`}>
      <Icon size={compact ? 13 : 15} aria-hidden="true" />
      {signedNumber(change.difference)} · {Math.abs(change.percentage ?? 0).toFixed(1)}%
    </span>
  );
}

function ProcedureBreakdown({ shift }: { shift: ProcedureShiftMetric | null }) {
  if (!shift) {
    return <span className="font-bold text-slate-400">No update submitted</span>;
  }

  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-600">
      {PROCEDURE_TYPES.map((procedure) => (
        <span key={procedure.id}>{procedure.label}: <strong className="text-hospital-ink">{shift.counts[procedure.id]}</strong></span>
      ))}
    </span>
  );
}

function trendStatusLabel(status: ProcedureMonthlyTrend["status"]) {
  if (status === "month-to-date") return "Month to Date";
  if (status === "partial-coverage") return "Partial coverage";
  return "Complete";
}

function MonthlyTrendChart({ trend, selectedMonth }: { trend: ProcedureMonthlyTrend[]; selectedMonth: string }) {
  const width = 920;
  const height = 300;
  const topPadding = 34;
  const bottomPadding = 54;
  const sidePadding = 42;
  const chartHeight = height - topPadding - bottomPadding;
  const maximum = Math.max(1, ...trend.flatMap((month) => [month.total, month.rollingAverage ?? 0]));
  const slotWidth = (width - sidePadding * 2) / Math.max(1, trend.length);
  const barWidth = Math.max(22, Math.min(48, slotWidth * 0.55));
  const linePoints = trend.flatMap((month, index) => {
    if (month.rollingAverage === null) return [];
    const x = sidePadding + index * slotWidth + slotWidth / 2;
    const y = topPadding + chartHeight - (month.rollingAverage / maximum) * chartHeight;
    return [`${x},${y}`];
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby="monthly-procedure-trend-title monthly-procedure-trend-description"
      className="h-auto w-full"
    >
      <title id="monthly-procedure-trend-title">Monthly procedure totals and rolling average</title>
      <desc id="monthly-procedure-trend-description">
        Bars show monthly procedure totals. The line shows the average of up to three available completed months. Exact values are listed below the chart.
      </desc>
      <line x1={sidePadding} y1={height - bottomPadding} x2={width - sidePadding} y2={height - bottomPadding} stroke="#cbd5e1" />
      <text x={sidePadding} y={20} className="fill-slate-500 text-[11px] font-bold">{maximum}</text>
      <text x={sidePadding - 8} y={height - bottomPadding + 4} textAnchor="end" className="fill-slate-500 text-[11px] font-bold">0</text>
      {trend.map((month, index) => {
        const x = sidePadding + index * slotWidth + (slotWidth - barWidth) / 2;
        const barHeight = (month.total / maximum) * chartHeight;
        const baseline = height - bottomPadding;
        const selected = month.month === selectedMonth;
        return (
          <g key={month.month}>
            <rect
              x={x}
              y={baseline - barHeight}
              width={barWidth}
              height={Math.max(barHeight, 2)}
              rx="7"
              fill={selected ? "#0e7490" : "#67e8f9"}
              stroke={selected ? "#164e63" : "none"}
              strokeWidth={selected ? 3 : 0}
            >
              <title>{`${monthLabel(month.month)}: ${month.total} procedures · ${trendStatusLabel(month.status)}`}</title>
            </rect>
            <text x={x + barWidth / 2} y={baseline - barHeight - 8} textAnchor="middle" className="fill-slate-700 text-[11px] font-black">
              {month.total}
            </text>
            <text x={x + barWidth / 2} y={height - 30} textAnchor="middle" className="fill-slate-600 text-[10px] font-bold">
              {monthLabel(month.month, "short").replace(" 20", " ’")}
            </text>
            {month.status === "month-to-date" ? (
              <text x={x + barWidth / 2} y={height - 14} textAnchor="middle" className="fill-cyan-700 text-[9px] font-black">MTD</text>
            ) : null}
          </g>
        );
      })}
      {linePoints.length > 1 ? (
        <polyline points={linePoints.join(" ")} fill="none" stroke="#7c3aed" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      ) : null}
      {trend.map((month, index) => month.rollingAverage === null ? null : (
        <circle
          key={`${month.month}-average`}
          cx={sidePadding + index * slotWidth + slotWidth / 2}
          cy={topPadding + chartHeight - (month.rollingAverage / maximum) * chartHeight}
          r="5"
          fill="#7c3aed"
          stroke="white"
          strokeWidth="2"
        >
          <title>{`${monthLabel(month.month)} rolling average: ${month.rollingAverage.toFixed(1)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function ProcedureMetrics({
  report,
  currentMonth,
  loadError = false
}: {
  report: ProcedureMetricsReport;
  currentMonth: string;
  loadError?: boolean;
}) {
  const selectedMonth = report.selected.month;
  const isCurrentMonth = selectedMonth === currentMonth;
  const firstTrackedMonth = report.reliableHistoryStartDate.slice(0, 7);
  const comparison = changeDetails(report.comparison, report.previous.total, report.comparisonPeriodLabel);
  const selectedColumnLabel = `${monthLabel(selectedMonth, "short")}${isCurrentMonth ? " MTD" : ""}`;
  const averageMonthsLabel = report.threeMonthAverageMonths.length === 0
    ? "No completed reliable months available"
    : `Across ${report.threeMonthAverageMonths.length} completed ${report.threeMonthAverageMonths.length === 1 ? "month" : "months"}: ${report.threeMonthAverageMonths.map((month) => monthLabel(month, "short")).join(", ")}`;
  const historyStartLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${report.reliableHistoryStartDate}T00:00:00.000Z`));

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="overflow-hidden rounded-3xl border border-white bg-white/95 shadow-soft">
          <div className="bg-gradient-to-br from-cyan-800 via-cyan-700 to-slate-800 px-5 py-6 text-white sm:px-7">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-100">Metrics · Procedures</p>
            <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-black sm:text-4xl">
                  {monthLabel(selectedMonth)}{isCurrentMonth ? " — Month to Date" : ""}
                </h1>
                <p className="mt-2 text-sm font-bold text-cyan-50">Canonical Day and Night Shift Updates · America/Los_Angeles</p>
              </div>
              <div className="rounded-3xl border border-white/20 bg-white/10 px-5 py-4 backdrop-blur-sm">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-100">Total Procedures</p>
                <p className="mt-1 text-5xl font-black">{report.selected.total}</p>
                <p className="mt-1 text-xs font-bold text-cyan-50">Sum of all six procedure types</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            {selectedMonth <= firstTrackedMonth ? (
              <span aria-disabled="true" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 text-sm font-extrabold text-slate-400">
                <ChevronLeft size={17} aria-hidden="true" /> Previous Month
              </span>
            ) : (
              <Link
                href={monthHref(previousMonth(selectedMonth))}
                aria-label={`View ${monthLabel(previousMonth(selectedMonth))}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
              >
                <ChevronLeft size={17} aria-hidden="true" /> Previous Month
              </Link>
            )}
            <p className="text-center text-sm font-black text-hospital-ink">{monthLabel(selectedMonth)}</p>
            {isCurrentMonth ? (
              <span aria-disabled="true" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 text-sm font-extrabold text-slate-400">
                Next Month <ChevronRight size={17} aria-hidden="true" />
              </span>
            ) : (
              <Link
                href={monthHref(nextMonth(selectedMonth))}
                aria-label={`View ${monthLabel(nextMonth(selectedMonth))}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
              >
                Next Month <ChevronRight size={17} aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/admin/metrics" className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700">
            Back to Metrics
          </Link>
          {!isCurrentMonth ? (
            <Link href={monthHref(currentMonth)} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white">
              Return to Current Month
            </Link>
          ) : null}
        </div>

        {loadError ? (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center shadow-soft">
            <h2 className="font-black text-rose-900">Procedure metrics are temporarily unavailable.</h2>
            <p className="mt-1 text-sm font-bold text-rose-700">Please try again.</p>
          </section>
        ) : (
          <>
            <section aria-label="Procedure metrics summary" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
              <SummaryCard
                label="Average per Day"
                value={report.selected.dailyAverage.toFixed(1)}
                helper={`${report.selected.total} ÷ ${report.selected.calendarDaysRepresented} calendar days`}
              />
              <SummaryCard
                label="Average per Reported Shift"
                value={report.selected.reportedShiftAverage === null ? "—" : report.selected.reportedShiftAverage.toFixed(1)}
                helper={report.selected.reportedShifts === 0
                  ? "No submitted Day/Night shifts"
                  : `${report.selected.total} ÷ ${report.selected.reportedShifts} submitted Day/Night shifts`}
              />
              <SummaryCard
                label="Previous-Period Total"
                value={String(report.previous.total)}
                helper={report.comparisonPeriodLabel}
              />
              <SummaryCard
                label="Change from Previous Period"
                value={comparison.value}
                helper={comparison.helper}
              />
              <SummaryCard
                label="Three-Month Average"
                value={report.threeMonthAverage === null ? "—" : report.threeMonthAverage.toFixed(1)}
                helper={averageMonthsLabel}
              />
            </section>

            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                  <ClipboardList size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-black text-hospital-ink">Procedures by Type</h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">{report.selectedPeriodLabel} compared with {report.comparisonPeriodLabel}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 md:hidden">
                {report.typeComparisons.map((procedure) => (
                  <article key={procedure.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-black text-hospital-ink">{procedure.label}</h3>
                      <span className="text-2xl font-black text-cyan-800">{procedure.selectedTotal}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs font-extrabold uppercase text-slate-500">{report.comparisonPeriodLabel}</dt><dd className="mt-1 font-black text-hospital-ink">{procedure.previousTotal}</dd></div>
                      <div><dt className="text-xs font-extrabold uppercase text-slate-500">Difference</dt><dd className="mt-1 font-black text-hospital-ink">{signedNumber(procedure.difference)}</dd></div>
                      <div><dt className="text-xs font-extrabold uppercase text-slate-500">Change</dt><dd className="mt-1"><ChangeText change={procedure} previousTotal={procedure.previousTotal} compact /></dd></div>
                      <div><dt className="text-xs font-extrabold uppercase text-slate-500">Share</dt><dd className="mt-1 font-black text-hospital-ink">{procedure.share.toFixed(1)}%</dd></div>
                    </dl>
                  </article>
                ))}
                <article className="rounded-2xl bg-slate-900 p-4 text-white">
                  <div className="flex items-center justify-between gap-3"><h3 className="font-black">Total Procedures</h3><span className="text-2xl font-black">{report.selected.total}</span></div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-300">
                    <span>Previous: {report.previous.total}</span>
                    <span>Difference: {signedNumber(report.comparison.difference)}</span>
                    <ChangeText change={report.comparison} previousTotal={report.previous.total} compact />
                    <span>Share: 100.0%</span>
                  </div>
                </article>
              </div>

              <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Procedure</th>
                      <th className="px-4 py-3 text-right">{selectedColumnLabel}</th>
                      <th className="px-4 py-3 text-right">{report.comparisonPeriodLabel}</th>
                      <th className="px-4 py-3 text-right">Difference</th>
                      <th className="px-4 py-3 text-right">Change</th>
                      <th className="px-4 py-3 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.typeComparisons.map((procedure) => (
                      <tr key={procedure.id}>
                        <th className="px-4 py-3 font-black text-hospital-ink">{procedure.label}</th>
                        <td className="px-4 py-3 text-right text-base font-black text-cyan-800">{procedure.selectedTotal}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{procedure.previousTotal}</td>
                        <td className="px-4 py-3 text-right font-black text-hospital-ink">{signedNumber(procedure.difference)}</td>
                        <td className="px-4 py-3 text-right"><ChangeText change={procedure} previousTotal={procedure.previousTotal} /></td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{procedure.share.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 font-black text-white">
                    <tr>
                      <th className="px-4 py-3">Total Procedures</th>
                      <td className="px-4 py-3 text-right text-base">{report.selected.total}</td>
                      <td className="px-4 py-3 text-right">{report.previous.total}</td>
                      <td className="px-4 py-3 text-right">{signedNumber(report.comparison.difference)}</td>
                      <td className="px-4 py-3 text-right"><ChangeText change={report.comparison} previousTotal={report.previous.total} /></td>
                      <td className="px-4 py-3 text-right">100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                    <TrendingUp size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-xl font-black text-hospital-ink">Monthly Trend</h2>
                    <p className="mt-1 text-xs font-bold text-slate-500">Monthly totals with an available completed-month rolling average</p>
                  </div>
                </div>
                <div aria-label="Chart legend" className="flex flex-wrap gap-3 text-xs font-extrabold text-slate-600">
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-cyan-300" />Monthly total</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded bg-violet-600" />Rolling average</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-cyan-700" />Selected month</span>
                </div>
              </div>
              {report.trend.length === 0 ? (
                <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500">No submitted procedure updates are available for the historical trend.</p>
              ) : (
                <>
                  <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
                    <MonthlyTrendChart trend={report.trend} selectedMonth={selectedMonth} />
                  </div>
                  <div className="mt-4 space-y-3 md:hidden" aria-label="Monthly procedure trend data">
                    {report.trend.toReversed().map((month) => (
                      <article key={month.month} className={`rounded-2xl border p-4 ${month.month === selectedMonth ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div><h3 className="font-black text-hospital-ink">{monthLabel(month.month)}</h3><p className="text-xs font-bold text-slate-500">{trendStatusLabel(month.status)}</p></div>
                          <span className="text-2xl font-black text-cyan-800">{month.total}</span>
                        </div>
                        <p className="mt-2 text-xs font-bold text-slate-600">Daily avg {month.dailyAverage.toFixed(1)} · Rolling avg {month.rollingAverage === null ? "—" : month.rollingAverage.toFixed(1)}</p>
                        <div className="mt-2 text-sm">{month.comparison ? <ChangeText change={month.comparison} previousTotal={month.total - month.comparison.difference} compact /> : <span className="font-bold text-slate-400">No prior-month comparison</span>}</div>
                      </article>
                    ))}
                  </div>
                  <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
                    <table className="w-full text-left text-sm" aria-label="Monthly procedure trend data">
                      <thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">Total Procedures</th><th className="px-4 py-3 text-right">Daily Average</th><th className="px-4 py-3 text-right">3-Month Rolling Average</th><th className="px-4 py-3 text-right">Change vs Prior Month</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.trend.toReversed().map((month) => (
                          <tr key={month.month} className={month.month === selectedMonth ? "bg-cyan-50" : undefined}>
                            <th className="px-4 py-3 font-black text-hospital-ink">{monthLabel(month.month)} <span className="ml-1 text-[10px] font-extrabold uppercase text-slate-500">{trendStatusLabel(month.status)}</span></th>
                            <td className="px-4 py-3 text-right font-black text-cyan-800">{month.total}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-700">{month.dailyAverage.toFixed(1)}</td>
                            <td className="px-4 py-3 text-right font-bold text-violet-700">{month.rollingAverage === null ? "—" : `${month.rollingAverage.toFixed(1)} (${month.rollingAverageMonthCount} mo)`}</td>
                            <td className="px-4 py-3 text-right">{month.comparison ? <ChangeText change={month.comparison} previousTotal={month.total - month.comparison.difference} /> : <span className="font-bold text-slate-400">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <p className="mt-4 text-xs font-bold leading-5 text-slate-500">True procedure metrics tracking begins {historyStartLabel}. Earlier records are excluded. Months without submitted procedure updates are omitted, not treated as zero.</p>
            </section>

            <details open className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <summary className="cursor-pointer list-none">
                <span className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><CalendarDays size={20} aria-hidden="true" /></span>
                  <span><span className="block text-xl font-black text-hospital-ink">Daily and Shift Detail</span><span className="mt-1 block text-xs font-bold text-slate-500">Trace every category total to its canonical Day and Night shift</span></span>
                </span>
              </summary>
              <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">“No update submitted” is missing data. A submitted shift showing all zeroes is a reported zero and counts in the reported-shift average.</p>

              <div className="mt-4 space-y-3 lg:hidden">
                {report.selected.days.map((day) => (
                  <article key={day.date} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3"><h3 className="font-black text-hospital-ink">{dateLabel(day.date)}</h3><span className="rounded-xl bg-slate-900 px-3 py-1 text-sm font-black text-white">Total {day.day || day.night ? day.total : "—"}</span></div>
                    <div className="mt-3 space-y-3">
                      <section><h4 className="inline-flex items-center gap-1 text-xs font-extrabold uppercase text-cyan-800"><Sun size={13} aria-hidden="true" />Day · {day.day ? `${day.day.total} total` : "missing"}</h4><div className="mt-1"><ProcedureBreakdown shift={day.day} /></div></section>
                      <section><h4 className="inline-flex items-center gap-1 text-xs font-extrabold uppercase text-violet-800"><Moon size={13} aria-hidden="true" />Night · {day.night ? `${day.night.total} total` : "missing"}</h4><div className="mt-1"><ProcedureBreakdown shift={day.night} /></div></section>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[70rem] text-left text-sm">
                  <thead className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Operational Date</th><th className="px-3 py-3"><span className="inline-flex items-center gap-1"><Sun size={13} aria-hidden="true" />Day procedure counts</span></th><th className="px-3 py-3 text-right">Day Total</th><th className="px-3 py-3"><span className="inline-flex items-center gap-1"><Moon size={13} aria-hidden="true" />Night procedure counts</span></th><th className="px-3 py-3 text-right">Night Total</th><th className="px-3 py-3 text-right">Combined</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.selected.days.map((day) => (
                      <tr key={day.date}>
                        <th className="px-3 py-3 align-top font-black text-hospital-ink">{dateLabel(day.date)}</th>
                        <td className="px-3 py-3 align-top"><ProcedureBreakdown shift={day.day} /></td>
                        <td className="px-3 py-3 text-right align-top font-black text-cyan-800">{day.day?.total ?? <span aria-label="No Day shift update">—</span>}</td>
                        <td className="px-3 py-3 align-top"><ProcedureBreakdown shift={day.night} /></td>
                        <td className="px-3 py-3 text-right align-top font-black text-violet-800">{day.night?.total ?? <span aria-label="No Night shift update">—</span>}</td>
                        <td className="px-3 py-3 text-right align-top font-black text-hospital-ink">{day.day || day.night ? day.total : <span aria-label="No shift updates">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-black text-hospital-ink"><tr><th className="px-3 py-3" colSpan={2}>Selected Month Totals</th><td className="px-3 py-3 text-right text-cyan-800">{report.selected.dayTotal}</td><td className="px-3 py-3">Sum of canonical shifts</td><td className="px-3 py-3 text-right text-violet-800">{report.selected.nightTotal}</td><td className="px-3 py-3 text-right">{report.selected.total}</td></tr></tfoot>
                </table>
              </div>
            </details>

            <section aria-label="Reconciliation" className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                {report.selected.total === report.typeComparisons.reduce((total, procedure) => total + procedure.selectedTotal, 0)
                  ? <ArrowUpRight className="mt-0.5 text-emerald-700" size={20} aria-hidden="true" />
                  : <CircleMinus className="mt-0.5 text-rose-700" size={20} aria-hidden="true" />}
                <div><h2 className="font-black text-emerald-950">Report reconciled</h2><p className="mt-1 text-sm font-bold text-emerald-800">Procedure types ({report.selected.total}) = daily totals ({report.selected.days.reduce((total, day) => total + day.total, 0)}) = canonical shift totals ({report.selected.dayTotal + report.selected.nightTotal}).</p></div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
