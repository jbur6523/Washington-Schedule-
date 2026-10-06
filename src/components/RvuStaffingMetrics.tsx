import Link from "next/link";
import { RvuStaffingFilters } from "@/components/RvuStaffingFilters";
import { MetricsDateNavigation } from "@/components/MetricsDateNavigation";
import { RvuStaffingDownload } from "@/components/RvuStaffingDownload";
import { RvuStaffingDetail } from "@/components/RvuStaffingDetail";
import { RvuStaffingTrendChart } from "@/components/RvuStaffingTrendChart";
import { ArrowLeft, BarChart3, Moon, Sun, Users } from "lucide-react";
import type { CalculatedRvuStaffingRow, MetricDateRange } from "@/lib/metrics/rvu-staffing";
import { formatOneDecimal, summarizeMetricRows } from "@/lib/metrics/rvu-staffing";

const panel = "rounded-3xl border border-white bg-white/95 p-5 shadow-soft sm:p-6";
const shifts = ["day", "night"] as const;

function formatPercentage(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
    <dt className="min-h-10 text-xs font-semibold leading-5 text-slate-600">{label}</dt>
    <dd className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-hospital-ink">{value}</dd>
    <dd className="mt-2 text-xs leading-5 text-slate-500">{helper}</dd>
  </div>;
}

export function RvuStaffingMetrics({ rows, range, start, end, navigation, rangeError = "", loadError = false }: {
  navigation?: { month: string; currentMonth: string; custom: boolean };
  rows: CalculatedRvuStaffingRow[]; range: MetricDateRange; start?: string; end?: string; rangeError?: string; loadError?: boolean;
}) {
  const shiftGroups = shifts.map((type) => ({ type, name: type === "day" ? "Day" : "Night", summary: summarizeMetricRows(rows.filter((row) => row.shift_type === type)) }));
  return <main className="min-h-screen px-4 py-6 sm:py-8">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className={`${panel} flex flex-col justify-between gap-4 sm:flex-row sm:items-center`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Admin</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-hospital-ink sm:text-3xl">RVU &amp; Staffing Metrics</h1>
          <p className="mt-2 text-sm text-slate-500">A simple view of staffing performance by shift.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RvuStaffingDownload rows={rows} range={range} disabled={loadError || Boolean(rangeError) || rows.length === 0} rangeLabel={navigation ? `${navigation.custom ? "Custom" : "Monthly"}: ${start} to ${end}` : range === "custom" ? `Custom: ${start} to ${end}` : undefined} />
          <Link href="/admin/metrics" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-hospital-ink hover:bg-slate-50"><ArrowLeft size={16} aria-hidden="true" />Back to Metrics</Link>
        </div>
      </header>
      {navigation ? <MetricsDateNavigation key={`${navigation.month}-${start}-${end}`} path="/admin/rvu-staffing-metrics" {...navigation} start={start ?? ""} end={end ?? ""} /> : <section aria-label="Report filters" className="w-fit max-w-full rounded-2xl border border-white bg-white/95 p-3 shadow-soft">
        <RvuStaffingFilters key={`${range}-${start}-${end}`} range={range} start={start} end={end} />
      </section>}
      {rangeError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{rangeError}</p> : loadError ? <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center">
        <h2 className="font-bold text-rose-900">Metrics are temporarily unavailable.</h2><p className="mt-2 text-sm text-rose-700">Please try again.</p>
      </section> : rows.length === 0 ? <section className={`${panel} text-center`}>
        <h2 className="text-lg font-bold text-hospital-ink">No RVU data for these filters</h2><p className="mt-2 text-sm text-slate-500">Historical shifts without saved RVUs are excluded rather than counted as zero.</p>
      </section> : <>
        <section aria-label="Metrics summary" className="grid gap-5 lg:grid-cols-2">
          {shiftGroups.map(({ type, name, summary }) => {
            const Icon = type === "day" ? Sun : Moon;
            return <section key={type} aria-label={`${name} Shift summary`} className="rounded-3xl border border-white bg-white/95 p-3 shadow-soft">
              <div className={`flex items-center gap-3 rounded-2xl px-4 py-4 ${type === "day" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>
                <Icon size={27} aria-hidden="true" /><div><h2 className="text-lg font-extrabold">{name} Shift</h2><p className="mt-1 text-xs">{summary.shiftCount ? `${summary.shiftCount} reported shifts` : "No reported shifts"}</p></div>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <SummaryCard label={`Average ${name} Staff On Shift`} value={formatOneDecimal(summary.averageRtsOn)} helper="RTs per reported shift" />
                <SummaryCard label={`Average ${name} Staff Needed`} value={formatOneDecimal(summary.averageRtsNeeded)} helper="RTs per reported shift" />
                <SummaryCard label={`Average ${name} Shift RVU`} value={formatOneDecimal(summary.averageRvus)} helper="RVUs per reported shift" />
                <SummaryCard label={`${name} Shift Coverage Rate`} value={formatPercentage(summary.percentageMeetingNeed)} helper="Reported shifts meeting need" />
              </dl>
            </section>;
          })}
        </section>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className={`${panel} min-w-0`}><div className="flex items-center gap-3"><BarChart3 className="text-cyan-700" aria-hidden="true" /><h2 className="text-lg font-extrabold">RVU Trend</h2></div><p className="mt-2 text-xs text-slate-500">RVUs for each reported Day and Night shift.</p><RvuStaffingTrendChart rows={rows} /></section>
          <section className={`${panel} min-w-0`}><div className="flex items-center gap-3"><Users className="text-cyan-700" aria-hidden="true" /><h2 className="text-lg font-extrabold">Staffing Trend</h2></div><p className="mt-2 text-xs text-slate-500">RTs needed vs. on shift. Choose Day or Night below.</p><RvuStaffingTrendChart rows={rows} staffing /></section>
        </div>
        <RvuStaffingDetail key={range} rows={rows} />
      </>}
    </div>
  </main>;
}
