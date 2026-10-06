"use client";
import { useState } from "react";
import { metricDateRanges, type MetricDateRange } from "@/lib/metrics/rvu-staffing";

export function RvuStaffingFilters({ range, start = "", end = "" }: { range: MetricDateRange; start?: string; end?: string }) {
  const [selection, setSelection] = useState(range);
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const reversed = Boolean(from && to && from > to);
  return <form method="get" className="flex flex-wrap items-center gap-2">
    <label className="flex items-center gap-2"><span className="text-xs font-bold text-slate-600">Date Range</span>
      <select name="range" value={selection} onChange={event => setSelection(event.target.value as MetricDateRange)} className="h-11 w-32 rounded-lg border-2 border-slate-500 bg-white px-3 text-sm font-semibold text-hospital-ink">
        {metricDateRanges.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    {selection === "custom" && <>
      <label className="flex items-center gap-2"><span className="text-xs font-bold text-slate-600">Start Date</span><input type="date" name="start" required value={from} onChange={event => setFrom(event.target.value)} className="block h-11 w-40 rounded-lg border-2 border-slate-500 bg-white px-3 text-sm text-hospital-ink" /></label>
      <label className="flex items-center gap-2"><span className="text-xs font-bold text-slate-600">End Date</span><input type="date" name="end" required min={from || undefined} value={to} onChange={event => setTo(event.target.value)} className="block h-11 w-40 rounded-lg border-2 border-slate-500 bg-white px-3 text-sm text-hospital-ink" /></label>
    </>}
    <button type="submit" disabled={selection === "custom" && reversed} className="min-h-11 rounded-lg bg-cyan-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-50">Apply Date Range</button>
    {selection === "custom" && reversed && <p role="alert" className="w-full text-xs text-rose-700">Start date must be on or before end date.</p>}
  </form>;
}
