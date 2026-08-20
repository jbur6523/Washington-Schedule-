import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Moon, Sun } from "lucide-react";
import {
  dateLabel,
  monthHref,
  monthLabel,
  nextMonth,
  previousMonth,
  type DailyProcedureMetric,
  type ProcedureMetricsReport
} from "@/lib/metrics/procedures";

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</h2>
      <p className="mt-1 text-2xl font-black text-hospital-ink">{value}</p>
      {helper ? <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{helper}</p> : null}
    </article>
  );
}

function comparisonText(report: ProcedureMetricsReport) {
  const { selected, previous, comparison } = report;

  if (previous.total === 0) {
    if (selected.total > 0) {
      return { value: `Up ${comparison.difference}`, helper: "Up from 0 last month" };
    }

    return { value: "No change", helper: "No procedures recorded in either month" };
  }

  if (comparison.difference === 0) {
    return { value: "No change", helper: "Same total as last month" };
  }

  const direction = comparison.difference > 0 ? "Up" : "Down";
  return {
    value: `${direction} ${Math.abs(comparison.difference)}`,
    helper: `${Math.abs(comparison.percentage ?? 0).toFixed(1)}% ${direction.toLowerCase()} from last month`
  };
}

function ProcedureTrendChart({ days }: { days: DailyProcedureMetric[] }) {
  const width = Math.max(720, days.length * 28 + 64);
  const height = 260;
  const topPadding = 30;
  const bottomPadding = 42;
  const sidePadding = 32;
  const chartHeight = height - topPadding - bottomPadding;
  const maximum = Math.max(1, ...days.map((day) => day.total));
  const slotWidth = (width - sidePadding * 2) / Math.max(1, days.length);
  const barWidth = Math.max(8, Math.min(18, slotWidth - 5));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby="procedure-trend-title procedure-trend-description"
      className="h-auto w-full min-w-[45rem]"
    >
      <title id="procedure-trend-title">Daily procedure trend</title>
      <desc id="procedure-trend-description">
        Stacked daily bars show Day shift procedures in cyan and Night shift procedures in violet. Exact values and missing updates are listed in the daily history table.
      </desc>
      <line
        x1={sidePadding}
        y1={height - bottomPadding}
        x2={width - sidePadding}
        y2={height - bottomPadding}
        stroke="#cbd5e1"
      />
      <text x={sidePadding} y={20} className="fill-slate-500 text-[11px] font-bold">{maximum}</text>
      <text x={sidePadding} y={height - bottomPadding + 18} className="fill-slate-500 text-[11px] font-bold">0</text>
      {days.map((day, index) => {
        const x = sidePadding + index * slotWidth + (slotWidth - barWidth) / 2;
        const dayHeight = ((day.day ?? 0) / maximum) * chartHeight;
        const nightHeight = ((day.night ?? 0) / maximum) * chartHeight;
        const baseline = height - bottomPadding;
        const showDateLabel = days.length <= 16 || index % 3 === 0 || index === days.length - 1;

        return (
          <g key={day.date}>
            {day.day !== null && day.day > 0 ? (
              <rect
                x={x}
                y={baseline - dayHeight}
                width={barWidth}
                height={dayHeight}
                rx="3"
                fill="#0891b2"
              >
                <title>{`${dateLabel(day.date)} Day: ${day.day}`}</title>
              </rect>
            ) : null}
            {day.night !== null && day.night > 0 ? (
              <rect
                x={x}
                y={baseline - dayHeight - nightHeight}
                width={barWidth}
                height={nightHeight}
                rx="3"
                fill="#7c3aed"
              >
                <title>{`${dateLabel(day.date)} Night: ${day.night}`}</title>
              </rect>
            ) : null}
            {day.day === 0 ? (
              <circle cx={x + barWidth / 2 - 3} cy={baseline - 3} r="2.5" fill="#0891b2">
                <title>{`${dateLabel(day.date)} Day: 0`}</title>
              </circle>
            ) : null}
            {day.night === 0 ? (
              <circle cx={x + barWidth / 2 + 3} cy={baseline - 3} r="2.5" fill="#7c3aed">
                <title>{`${dateLabel(day.date)} Night: 0`}</title>
              </circle>
            ) : null}
            {showDateLabel ? (
              <text
                x={x + barWidth / 2}
                y={height - 12}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] font-bold"
              >
                {Number(day.date.slice(-2))}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function countCell(value: number | null) {
  return value === null ? <span aria-label="No canonical update">—</span> : value;
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
  const comparison = comparisonText(report);
  const isCurrentMonth = selectedMonth === currentMonth;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="overflow-hidden rounded-3xl border border-white bg-white/95 shadow-soft">
          <div className="bg-gradient-to-br from-cyan-800 via-cyan-700 to-slate-800 px-5 py-6 text-white sm:px-7">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-100">Metrics · Procedures</p>
            <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-black sm:text-4xl">{monthLabel(selectedMonth)}</h1>
                <p className="mt-2 text-sm font-bold text-cyan-50">Monthly procedure volume from canonical Shift Updates</p>
              </div>
              <div className="rounded-3xl border border-white/20 bg-white/10 px-5 py-4 backdrop-blur-sm">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-100">Total Procedures</p>
                <p className="mt-1 text-5xl font-black">{report.selected.total}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={monthHref(previousMonth(selectedMonth))}
              aria-label={`View ${monthLabel(previousMonth(selectedMonth))}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
            >
              <ChevronLeft size={17} aria-hidden="true" />
              Previous Month
            </Link>
            <p className="text-center text-sm font-black text-hospital-ink">{monthLabel(selectedMonth)}</p>
            {isCurrentMonth ? (
              <span
                aria-disabled="true"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 text-sm font-extrabold text-slate-400"
              >
                Next Month
                <ChevronRight size={17} aria-hidden="true" />
              </span>
            ) : (
              <Link
                href={monthHref(nextMonth(selectedMonth))}
                aria-label={`View ${monthLabel(nextMonth(selectedMonth))}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
              >
                Next Month
                <ChevronRight size={17} aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/admin/metrics"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
          >
            Back to Metrics
          </Link>
          {!isCurrentMonth ? (
            <Link
              href={monthHref(currentMonth)}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white"
            >
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
            <section aria-label="Procedure metrics summary" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
              <SummaryCard label="Month and Year" value={monthLabel(selectedMonth)} />
              <SummaryCard label="Day Shift Procedures" value={String(report.selected.dayTotal)} />
              <SummaryCard label="Night Shift Procedures" value={String(report.selected.nightTotal)} />
              <SummaryCard
                label="Daily Average"
                value={report.selected.dailyAverage.toFixed(1)}
                helper={`Across ${report.selected.calendarDaysRepresented} calendar days`}
              />
              <SummaryCard
                label={`Previous Month Total · ${monthLabel(report.previous.month)}`}
                value={String(report.previous.total)}
                helper={report.previous.completedShifts === 0 ? `No canonical Shift Updates in ${monthLabel(report.previous.month)}` : undefined}
              />
              <SummaryCard label="Change vs Previous Month" value={comparison.value} helper={comparison.helper} />
            </section>

            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-hospital-ink">Daily Procedure Trend</h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">Combined total with Day and Night shift contributions</p>
                </div>
                <div aria-label="Chart legend" className="flex flex-wrap gap-3 text-xs font-extrabold text-slate-600">
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-cyan-600" />Day</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-violet-600" />Night</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-300 bg-white" />No update</span>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
                <ProcedureTrendChart days={report.selected.days} />
              </div>
            </section>

            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                  <CalendarDays size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-black text-hospital-ink">Daily History</h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">A dash means no canonical Shift Update; 0 means an entered zero-procedure shift.</p>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3 text-right"><span className="inline-flex items-center gap-1"><Sun size={13} aria-hidden="true" />Day</span></th>
                      <th className="px-3 py-3 text-right"><span className="inline-flex items-center gap-1"><Moon size={13} aria-hidden="true" />Night</span></th>
                      <th className="px-3 py-3 text-right"><span className="inline-flex items-center gap-1"><ClipboardList size={13} aria-hidden="true" />Total</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.selected.days.map((day) => {
                      const hasUpdate = day.day !== null || day.night !== null;
                      return (
                        <tr key={day.date}>
                          <th className="px-3 py-3 font-black text-hospital-ink">{dateLabel(day.date)}</th>
                          <td className="px-3 py-3 text-right font-bold text-cyan-800">{countCell(day.day)}</td>
                          <td className="px-3 py-3 text-right font-bold text-violet-800">{countCell(day.night)}</td>
                          <td className="px-3 py-3 text-right font-black text-hospital-ink">{hasUpdate ? day.total : <span aria-label="No canonical update">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
