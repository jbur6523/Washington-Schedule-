import { MetricsDateNavigation } from "@/components/MetricsDateNavigation";
import Link from "next/link";
import {
  CheckCircle2,
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  ClipboardList,
  TrendingUp
} from "lucide-react";
import { ProcedureDailyDetail } from "@/components/ProcedureDailyDetail";
import {
  monthHref,
  monthLabel,
  type ProcedureChange,
  type ProcedureMetricsReport,
  type ProcedureMonthlyTrend
} from "@/lib/metrics/procedures";

function SummaryCard({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <h2 className="min-h-10 text-xs font-semibold leading-5 text-slate-600">{label}</h2>
      <p className={`mt-2 text-3xl font-extrabold tabular-nums tracking-tight ${tone === "up" ? "text-emerald-700" : tone === "down" ? "text-rose-700" : "text-hospital-ink"}`}>{value}</p>
    </article>
  );
}

function signedNumber(value: number) {
  return value > 0 ? `+${value}` : String(value);
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

function trendStatusLabel(status: ProcedureMonthlyTrend["status"]) {
  if (status === "month-to-date") return "Month to Date";
  if (status === "partial-coverage") return "Partial coverage";
  return "Complete";
}

function MixBar({ share }: { share: number }) {
  return <div aria-hidden="true" className="h-2.5 min-w-20 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-cyan-400" style={{ width: `${Math.max(0, Math.min(100, share))}%` }} /></div>;
}

function MonthlyTrendChart({ trend, selectedMonth }: { trend: ProcedureMonthlyTrend[]; selectedMonth: string }) {
  const width = Math.max(560, trend.length * 90);
  const height = 180;
  const maximum = Math.max(1, ...trend.map((month) => month.total));
  const slot = (width - 80) / Math.max(1, trend.length);
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="monthly-procedure-trend-title monthly-procedure-trend-description" className="h-44 w-full" style={{ minWidth: width }}>
    <title id="monthly-procedure-trend-title">Monthly procedure totals</title>
    <desc id="monthly-procedure-trend-description">Procedure totals by month. Partial coverage and month-to-date periods are labeled. Missing months are omitted, not counted as zero.</desc>
    <line x1="40" y1="132" x2={width - 20} y2="132" stroke="#cbd5e1" />
    <text x="30" y="136" textAnchor="end" fill="#64748b" fontSize="11">0</text>
    <text x="30" y="28" textAnchor="end" fill="#64748b" fontSize="11">{maximum}</text>
    {trend.map((month, index) => {
      const x = 40 + slot * (index + 0.5);
      const barHeight = month.total / maximum * 100;
      const selected = month.month === selectedMonth;
      return <g key={month.month}>
        <rect x={x - Math.min(36, slot * 0.3)} y={132 - barHeight} width={Math.min(72, slot * 0.6)} height={barHeight} rx="5" fill={selected ? "#0e7490" : "#67e8f9"}>
          <title>{`${monthLabel(month.month)}: ${month.total} procedures · ${trendStatusLabel(month.status)}`}</title>
        </rect>
        <text x={x} y={124 - barHeight} textAnchor="middle" fill="#132238" fontSize="12" fontWeight="700">{month.total}</text>
        <text x={x} y="153" textAnchor="middle" fill="#64748b" fontSize="11">{monthLabel(month.month, "short").replace(" 20", " ’")}</text>
        {month.status !== "complete" && <text x={x} y="170" textAnchor="middle" fill="#0e7490" fontSize="10">{trendStatusLabel(month.status)}</text>}
      </g>;
    })}
  </svg>;
}

export function ProcedureMetrics({
  report,
  currentMonth,
  customRange, rangeError = "",
  loadError = false
}: {
  report: ProcedureMetricsReport;
  currentMonth: string;
  customRange?: { start: string; end: string }; rangeError?: string; loadError?: boolean;
}) {
  const selectedMonth = report.selected.month;
  const isCurrentMonth = selectedMonth === currentMonth;
  const firstTrackedMonth = report.reliableHistoryStartDate.slice(0, 7);
  const comparisonDirection = report.comparison.difference > 0 ? "up" : report.comparison.difference < 0 ? "down" : "neutral";
  const selectedColumnLabel = customRange ? "Selected Range" : `${monthLabel(selectedMonth, "short")}${isCurrentMonth ? " MTD" : ""}`;
  const historyStartLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${report.reliableHistoryStartDate}T00:00:00.000Z`));

  const verified = report.selected.total === report.typeComparisons.reduce((total, item) => total + item.selectedTotal, 0)
    && report.selected.total === report.selected.days.reduce((total, day) => total + day.total, 0)
    && report.selected.total === report.selected.dayTotal + report.selected.nightTotal;

  return (
    <main className="min-h-screen px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-col justify-between gap-4 rounded-3xl border border-white bg-white/95 p-5 shadow-soft sm:flex-row sm:items-center sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Admin</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-hospital-ink sm:text-3xl">Procedure Metrics</h1>
            <p className="mt-2 text-sm text-slate-500">A simple view of procedure activity by month and shift.</p>
          </div>
          <Link href="/admin/metrics" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-hospital-ink hover:bg-slate-50"><ArrowLeft size={16} aria-hidden="true" />Back to Metrics</Link>
        </header>
        <MetricsDateNavigation key={`${selectedMonth}-${customRange?.start}-${customRange?.end}`} path="/admin/metrics/procedures" custom={Boolean(customRange)} month={selectedMonth} currentMonth={currentMonth} firstMonth={firstTrackedMonth} start={customRange?.start ?? `${selectedMonth}-01`} end={customRange?.end ?? report.selected.days.at(-1)?.date ?? `${selectedMonth}-01`} />

        {(!isCurrentMonth || customRange) && <div className="flex justify-end"><Link href={monthHref(currentMonth)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-700 px-4 text-sm font-bold text-white hover:bg-cyan-800">Return to Current Month</Link></div>}

        {rangeError ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{rangeError}</p> : loadError ? (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center shadow-soft">
            <h2 className="font-extrabold text-rose-900">Procedure metrics are temporarily unavailable.</h2>
            <p className="mt-1 text-sm font-bold text-rose-700">Please try again.</p>
          </section>
        ) : (
          <>
            <section aria-label="Procedure metrics summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryCard label="Total Procedures" value={String(report.selected.total)} />
              <SummaryCard label="Day Shift Procedures" value={String(report.selected.dayTotal)} />
              <SummaryCard label="Night Shift Procedures" value={String(report.selected.nightTotal)} />
              <SummaryCard label={customRange ? "Change vs Previous Period" : "Change vs Previous Month"} value={report.comparison.difference === 0 ? "No change" : signedNumber(report.comparison.difference)} tone={comparisonDirection} />
              <SummaryCard label="Average per Day" value={report.selected.dailyAverage.toFixed(1)} />
            </section>



            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft sm:p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                  <ClipboardList size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold text-hospital-ink">Procedures by Type</h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">{report.selectedPeriodLabel} compared with {report.comparisonPeriodLabel}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 md:hidden">
                {report.typeComparisons.map((procedure) => (
                  <article key={procedure.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-extrabold text-hospital-ink">{procedure.label}</h3>
                      <span className="text-2xl font-extrabold text-cyan-800">{procedure.selectedTotal}</span>
                    </div>
                    <div className="mt-3"><MixBar share={procedure.share} /></div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs font-extrabold uppercase text-slate-500">{report.comparisonPeriodLabel}</dt><dd className="mt-1 font-extrabold text-hospital-ink">{procedure.previousTotal}</dd></div>
                      <div><dt className="text-xs font-extrabold uppercase text-slate-500">Difference</dt><dd className="mt-1 font-extrabold text-hospital-ink">{signedNumber(procedure.difference)}</dd></div>
                      <div><dt className="text-xs font-extrabold uppercase text-slate-500">Change</dt><dd className="mt-1"><ChangeText change={procedure} previousTotal={procedure.previousTotal} compact /></dd></div>
                      <div><dt className="text-xs font-extrabold uppercase text-slate-500">Share</dt><dd className="mt-1 font-extrabold text-hospital-ink">{procedure.share.toFixed(1)}%</dd></div>
                    </dl>
                  </article>
                ))}
                <article className="rounded-2xl bg-cyan-50 p-4 text-hospital-ink">
                  <div className="flex items-center justify-between gap-3"><h3 className="font-extrabold">Total Procedures</h3><span className="text-2xl font-extrabold">{report.selected.total}</span></div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-600">
                    <span>Previous: {report.previous.total}</span>
                    <span>Difference: {signedNumber(report.comparison.difference)}</span>
                    <ChangeText change={report.comparison} previousTotal={report.previous.total} compact />
                    <span>Share: 100.0%</span>
                  </div>
                </article>
              </div>

              <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Procedure</th>
                      <th className="px-4 py-3 text-right">{selectedColumnLabel}</th>
                      <th className="px-4 py-3 text-right">{report.comparisonPeriodLabel}</th>
                      <th className="px-4 py-3 text-right">Change</th>
                      <th className="px-4 py-3 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.typeComparisons.map((procedure) => (
                      <tr key={procedure.id}>
                        <th className="px-4 py-3 font-extrabold text-hospital-ink">{procedure.label}</th>
                        <td className="px-4 py-3 text-right text-base font-extrabold text-cyan-800"><div className="flex items-center gap-4"><span className="w-8 shrink-0">{procedure.selectedTotal}</span><MixBar share={procedure.share} /></div></td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{procedure.previousTotal}</td>
                        <td className="px-4 py-3 text-right"><ChangeText change={procedure} previousTotal={procedure.previousTotal} /></td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{procedure.share.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-cyan-50 font-extrabold text-hospital-ink">
                    <tr>
                      <th className="px-4 py-3">Total Procedures</th>
                      <td className="px-4 py-3 text-right text-base">{report.selected.total}</td>
                      <td className="px-4 py-3 text-right">{report.previous.total}</td>
                      <td className="px-4 py-3 text-right"><ChangeText change={report.comparison} previousTotal={report.previous.total} /></td>
                      <td className="px-4 py-3 text-right">100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>



            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                    <TrendingUp size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-xl font-extrabold text-hospital-ink">Monthly Trend</h2>
                    <p className="mt-1 text-xs font-bold text-slate-500">Total procedures by month</p>
                  </div>
                </div>
                <div aria-label="Chart legend" className="flex flex-wrap gap-3 text-xs font-extrabold text-slate-600">
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-cyan-300" />Monthly total</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-cyan-700" />Selected month</span>
                </div>
              </div>
              {report.trend.length === 0 ? (
                <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500">No submitted procedure updates are available for the historical trend.</p>
              ) : (
                <>
                  <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-2">
                    <MonthlyTrendChart trend={report.trend} selectedMonth={selectedMonth} />
                  </div>
                </>
              )}
              <p className="mt-4 text-xs font-bold leading-5 text-slate-500">True procedure metrics tracking begins {historyStartLabel}. Earlier records are excluded. Months without submitted procedure updates are omitted, not treated as zero.</p>
            </section>


            <ProcedureDailyDetail key={`${selectedMonth}-${customRange?.start}-${customRange?.end}`} days={report.selected.days} isCurrentMonth={isCurrentMonth} />
            <div role="status" className="flex items-center gap-2 px-1 text-xs font-semibold">
              {verified ? <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800"><CheckCircle2 size={15} aria-hidden="true" />Data Verified</span> : <span className="rounded-full bg-amber-50 px-3 py-2 text-amber-800">Data verification pending</span>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
