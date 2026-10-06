import { DailyOperationalDetail } from "@/components/DailyOperationalDetail";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { RvuStaffingMetrics } from "@/components/RvuStaffingMetrics";
import { ProcedureMetrics } from "@/components/ProcedureMetrics";
import { MetricsDateNavigation } from "@/components/MetricsDateNavigation";
import { canViewRvuStaffingMetrics } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { calculateMetricRows, metricReportingWindow, parseMetricDateRange } from "@/lib/metrics/rvu-staffing";
import { fetchRvuStaffingMetricRows, fetchProcedureMetricRows } from "@/lib/metrics/queries";
import { createClient } from "@/lib/supabase/server";
import { parseProcedureMonth, monthForInstant, procedureMonthQueryRange, buildProcedureMetricsReport, buildProcedureRangeReport, RELIABLE_PROCEDURE_HISTORY_START_DATE } from "@/lib/metrics/procedures";

export const dynamic = "force-dynamic";
export default async function RvuStaffingMetricsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await getAuthenticatedUserContext();
  if (auth.status === "unauthenticated") redirect("/login");
  if (auth.status === "error") return <AuthVerificationNotice message={auth.message} />;
  if (auth.status !== "authenticated" || !canViewRvuStaffingMetrics(auth.context)) notFound();
  const parameters = await searchParams;
  const now = new Date();
  const range = parseMetricDateRange(parameters?.range);
  const currentMonth = monthForInstant(now);
  const month = parseProcedureMonth(parameters?.month, now);
  const custom = parameters?.range === "custom";
  const today = procedureMonthQueryRange(currentMonth, now).maximumShiftDate;
  const window = custom ? metricReportingWindow("custom", today, parameters?.start, parameters?.end) : { start: `${month}-01`, end: procedureMonthQueryRange(month, now).maximumShiftDate, error: "" };
  const error = window.error || (window.end > today ? "End date must be today or earlier." : "");
  const view = parameters?.view === "rvu" || parameters?.view === "procedures" ? parameters.view : "both";
  const navigation = { month, currentMonth, custom };
  const procedureRange = custom && !error ? { minimumShiftDate: RELIABLE_PROCEDURE_HISTORY_START_DATE, maximumShiftDate: procedureMonthQueryRange(window.end.slice(0, 7), now).maximumShiftDate } : procedureMonthQueryRange(month, now);
  const client = error ? null : await createClient();
  const [rvu, procedures] = await Promise.all([
    client && view !== "procedures" ? fetchRvuStaffingMetricRows(client, auth.context.departmentId, { minimumShiftDate: window.start, maximumShiftDate: window.end, shift: "all" }) : Promise.resolve({ data: [], error: null }),
    client && view !== "rvu" ? fetchProcedureMetricRows(client, auth.context.departmentId, procedureRange) : Promise.resolve({ data: [], error: null })
  ]);
  const rvuRows = calculateMetricRows(rvu.data);
  const procedureReport = custom && !error ? buildProcedureRangeReport(procedures.data, window.start, window.end, now) : buildProcedureMetricsReport(procedures.data, month, now);
  const selectionHref = (selection: string) => {
    const query = new URLSearchParams(custom ? { range: "custom", start: window.start, end: window.end } : { month });
    query.set("view", selection);
    return `/admin/rvu-staffing-metrics?${query}`;
  };
  return <main className="min-h-screen px-4 py-6 sm:py-8"><div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
      <div><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Admin</p><h1 className="mt-2 text-2xl font-extrabold text-hospital-ink sm:text-3xl">RVU &amp; Procedure Metrics</h1></div>
      <Link href="/admin/metrics" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-bold">Back to Metrics</Link>
    </header>
    <MetricsDateNavigation key={`${month}-${window.start}-${window.end}-${custom}`} path="/admin/rvu-staffing-metrics" {...navigation} start={window.start} end={window.end} view={view} />
    <nav aria-label="Metrics view" className="flex justify-center"><div className="inline-flex rounded-xl border border-slate-300 bg-white p-1 shadow-sm">{[["both", "Both"], ["rvu", "RVUs"], ["procedures", "Procedures"]].map(([value, label]) => <Link key={value} href={selectionHref(value)} aria-current={view === value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-bold ${view === value ? "bg-cyan-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{label}</Link>)}</div></nav>
    {error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p> : <>
      {view !== "procedures" && <RvuStaffingMetrics embedded rows={rvuRows} range={range} navigation={navigation} start={window.start} end={window.end} loadError={Boolean(rvu.error)} />}
      {view !== "rvu" && <div className={view === "both" ? "border-t-2 border-slate-300 pt-6" : ""}><ProcedureMetrics embedded report={procedureReport} customRange={custom ? window : undefined} currentMonth={currentMonth} loadError={Boolean(procedures.error)} /></div>}
      <DailyOperationalDetail key={`${window.start}-${window.end}-${view}`} rows={rvuRows} days={view === "rvu" ? [] : procedureReport.selected.days} view={view} rvuError={Boolean(rvu.error)} procedureError={Boolean(procedures.error)} current={!custom && month === currentMonth} />
    </>}
  </div></main>;
}
