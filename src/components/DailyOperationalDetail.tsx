"use client";
import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { formatOneDecimal, type CalculatedRvuStaffingRow, type MetricShiftFilter } from "@/lib/metrics/rvu-staffing";
import { PROCEDURE_TYPES, type DailyProcedureMetric } from "@/lib/metrics/procedures";

const dateLabel = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const statusClass = (met: boolean) => met ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800";
function Staffing({ shift, row, failed }: { shift: string; row?: CalculatedRvuStaffingRow; failed: boolean }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-3"><h3 className="font-bold text-hospital-ink">{shift} Shift</h3>{failed ? <p className="mt-2 text-sm text-rose-800">Staffing data unavailable.</p> : !row ? <p className="mt-2 text-sm text-slate-500">No saved RVUs for this shift.</p> : <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
    {[["RVUs", row.rvuTotal], ["RTs Needed", formatOneDecimal(row.exactRtsNeeded)], ["RTs On Shift", formatOneDecimal(row.rts_on)], ["Variance", `${row.staffingVariance > 0 && formatOneDecimal(row.staffingVariance) !== "0.0" ? "+" : ""}${formatOneDecimal(row.staffingVariance)}`]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-600">{label}</dt><dd className={`font-semibold tabular-nums ${label === "Variance" ? row.metNeed ? "text-emerald-700" : "text-rose-700" : "text-hospital-ink"}`}>{value}</dd></div>)}
    <div className="col-span-2"><dt className="text-xs text-slate-600">Staffing Status</dt><dd className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-bold ${statusClass(row.metNeed)}`}>{row.metNeed ? "Met Need" : "Below Need"}</dd></div>
  </dl>}</section>;
}

export function DailyOperationalDetail({ rows, days, view = "both", rvuError = false, procedureError = false, current = false }: {
  rows: CalculatedRvuStaffingRow[]; days: DailyProcedureMetric[]; view?: "both" | "rvu" | "procedures"; rvuError?: boolean; procedureError?: boolean; current?: boolean;
}) {
  const dates = Array.from(new Set([...rows.map(row => row.shift_date), ...days.map(day => day.date)])).sort();
  const totalPages = Math.max(1, Math.ceil(dates.length / 7));
  const [page, setPage] = useState(current ? totalPages - 1 : 0);
  const [shift, setShift] = useState<MetricShiftFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const visible = dates.slice(page * 7, page * 7 + 7);
  const staffing = new Map(rows.map(row => [`${row.shift_date}:${row.shift_type}`, row]));
  const procedures = new Map(days.map(day => [day.date, day]));
  const shifts = shift === "all" ? ["day", "night"] as const : [shift];
  const changePage = (next: number) => { setPage(next); setExpanded(null); };
  return <section aria-labelledby="daily-operational-heading" className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft sm:p-5">
    <div className="flex items-center gap-2"><CalendarDays size={22} className="text-cyan-700" aria-hidden="true" /><h2 id="daily-operational-heading" className="text-lg font-extrabold text-hospital-ink">Daily Operational Detail</h2></div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Detail shift filter" className="flex flex-wrap gap-2">{(["all", "day", "night"] as const).map(value => <button key={value} type="button" aria-pressed={shift === value} onClick={() => setShift(value)} className={`min-h-10 rounded-xl border px-3 text-sm font-bold ${shift === value ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-300 bg-white text-slate-600"}`}>{value === "all" ? "All Shifts" : value === "day" ? "Day Shift" : "Night Shift"}</button>)}</div>
      <nav aria-label="Daily detail pagination" className="flex items-center gap-2 text-xs"><button type="button" disabled={page === 0} onClick={() => changePage(page - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-bold disabled:opacity-40"><ChevronLeft size={16} />Previous</button><span className="text-center text-slate-600">Page {page + 1} of {totalPages}<span className="block">7 days per page</span></span><button type="button" disabled={page >= totalPages - 1} onClick={() => changePage(page + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-bold disabled:opacity-40">Next<ChevronRight size={16} /></button></nav>
    </div>
    <div className="mt-3 space-y-2">{visible.map(date => {
      const day = procedures.get(date);
      const applicable = shifts.map(value => day?.[value]).filter(item => item != null);
      const total = applicable.reduce((sum, item) => sum + item.total, 0);
      const counts = PROCEDURE_TYPES.map(type => ({ label: type.label, total: applicable.reduce((sum, item) => sum + item.counts[type.id], 0) })).filter(item => item.total > 0);
      const open = expanded === date;
      const panelId = `operational-${date}`;
      return <article key={date} className="overflow-hidden rounded-xl border border-slate-300 bg-white">
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setExpanded(open ? null : date)} className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-sky-50">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-bold text-hospital-ink">{dateLabel(date)}</span>
            {view !== "rvu" && <span className="font-semibold text-slate-700">{procedureError ? "Procedures unavailable" : applicable.length ? `${total} ${total === 1 ? "Procedure" : "Procedures"}` : "No procedure updates"}</span>}
            {view !== "procedures" && shifts.map(value => { const row = staffing.get(`${date}:${value}`); return <span key={value} className="inline-flex flex-wrap items-center gap-1 text-xs text-slate-700"><span className="capitalize">{value}</span> {rvuError ? "unavailable" : row ? <>{row.rvuTotal} RVU / <span className={`rounded-full border px-2 py-0.5 font-bold ${statusClass(row.metNeed)}`}>{row.metNeed ? "Met Need" : "Below Need"}</span></> : "— No saved RVUs"}</span>; })}
          </span><ChevronDown size={17} aria-hidden="true" className={`shrink-0 text-slate-500 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && <div id={panelId} className="space-y-3 border-t border-slate-200 bg-sky-50/50 p-3">
          {view !== "procedures" && <div className={`grid gap-3 ${shift === "all" ? "sm:grid-cols-2" : ""}`}>{shifts.map(value => <Staffing key={value} shift={value === "day" ? "Day" : "Night"} row={staffing.get(`${date}:${value}`)} failed={rvuError} />)}</div>}
          {view !== "rvu" && <section className="rounded-xl border border-slate-200 bg-white p-3"><h3 className="font-bold text-hospital-ink">Procedures</h3>{procedureError ? <p className="mt-2 text-sm text-rose-800">Procedure data unavailable.</p> : <>
            <p className="mt-2 text-sm font-semibold">Total procedures: {applicable.length ? total : "Not reported"}</p>
            <p className="mt-1 text-xs text-slate-600">{shifts.map(value => `${value === "day" ? "Day" : "Night"}: ${day?.[value]?.total ?? "Not reported"}`).join(" · ")}</p>
            {counts.length ? <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">{counts.map(item => <div key={item.label}><dt className="text-xs text-slate-600">{item.label}</dt><dd className="font-semibold">{item.total}</dd></div>)}</dl> : <p className="mt-2 text-xs text-slate-500">{applicable.length ? "No procedures recorded." : "No procedure update submitted for the selected shift(s)."}</p>}
          </>}</section>}
        </div>}
      </article>;
    })}{!visible.length && <p className="py-5 text-center text-sm text-slate-600">{rvuError || procedureError ? "Daily details are temporarily unavailable." : "No daily details for this date range."}</p>}</div>
  </section>;
}
