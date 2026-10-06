"use client";

import { useState } from "react";
import { Table2 } from "lucide-react";
import { formatOneDecimal, metricShiftFilters, type CalculatedRvuStaffingRow, type MetricShiftFilter } from "@/lib/metrics/rvu-staffing";

function formatReportingDate(value: string, short = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", ...(short ? {} : { year: "numeric" as const }), timeZone: "UTC"
  }).format(new Date(`${value}T12:00:00Z`));
}


export function RvuStaffingDetail({ rows }: { rows: CalculatedRvuStaffingRow[] }) {
  const [detailShift, setDetailShift] = useState<MetricShiftFilter>("all");
  const filteredRows = rows.filter((row) => detailShift === "all" || row.shift_type === detailShift);
  return (
        <section aria-labelledby="detail-heading" className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft sm:p-6">
          <div className="flex items-center gap-3"><Table2 className="text-cyan-700" aria-hidden="true" /><h2 id="detail-heading" className="text-lg font-extrabold">Reporting-Window Detail</h2></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Variance = RTs on shift minus RTs needed. At one decimal: −0.4 or higher meets need; −0.5 or lower is below need.</p>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Detail shift filter">
            {metricShiftFilters.map((option) => <button key={option.value} type="button" aria-pressed={detailShift === option.value} onClick={() => setDetailShift(option.value)} className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${detailShift === option.value ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{option.value === "all" ? "All Shifts" : option.value === "day" ? "Day Shift" : "Night Shift"}</button>)}
          </div>
          <div className="mt-5 max-h-[32rem] overflow-auto rounded-2xl border border-slate-200" tabIndex={0} role="region" aria-label="Reporting-window detail table">
            <table className="w-full min-w-[760px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600"><tr>{["Reporting Date", "Shift", "RVUs", "RTs Needed", "RTs On Shift", "Variance", "Status"].map((label, index) => <th key={label} scope="col" className={`px-4 py-4 font-semibold ${index > 1 ? "text-right" : ""}`}>{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{filteredRows.map((row) => <tr key={row.id} className="even:bg-slate-50/50 hover:bg-sky-50/50">
                <th scope="row" className="whitespace-nowrap px-4 py-4 font-semibold text-hospital-ink">{formatReportingDate(row.shift_date)}</th>
                <td className={`px-4 py-4 font-medium capitalize ${row.shift_type === "day" ? "text-sky-700" : "text-violet-700"}`}>{row.shift_type}</td>
                <td className="px-4 py-4 text-right text-slate-700">{row.rvuTotal}</td>
                <td className="px-4 py-4 text-right text-slate-700">{formatOneDecimal(row.exactRtsNeeded)}</td>
                <td className="px-4 py-4 text-right text-slate-700">{formatOneDecimal(row.rts_on)}</td>
                <td className={`px-4 py-4 text-right font-bold ${row.metNeed ? "text-emerald-700" : "text-rose-700"}`}>{row.staffingVariance > 0 && formatOneDecimal(row.staffingVariance) !== "0.0" ? "+" : ""}{formatOneDecimal(row.staffingVariance)}</td>
                <td className="px-4 py-4 text-right"><span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${row.metNeed ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{row.metNeed ? "Met Need" : "Below Need"}</span></td>
              </tr>)}{filteredRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No reported shifts for this selection.</td></tr>}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">{filteredRows.length} reported shifts · Shifts without saved RVUs are excluded.</p>
        </section>
  );
}
