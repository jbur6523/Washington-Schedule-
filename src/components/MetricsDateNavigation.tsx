"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel, previousMonth, nextMonth } from "@/lib/metrics/procedures";

export function MetricsDateNavigation({ custom = false, month, currentMonth, firstMonth, start, end, path, view }: {
  custom?: boolean; month: string; currentMonth: string; firstMonth?: string; start: string; end: string; path: string; view?: string;
}) {
  const [mode, setMode] = useState(custom);
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const reversed = Boolean(from && to && from > to);
  const linkClass = "inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 sm:px-4 sm:text-sm";
  const href = (value: string) => `${path}?month=${value}${view ? `&view=${view}` : ""}`;
  return <section aria-label="Reporting period" className="rounded-3xl border border-white bg-white/95 p-3 shadow-soft sm:p-4">
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div>{mode || (firstMonth && month <= firstMonth) ? <span aria-disabled="true" className={`${linkClass} opacity-40`}><ChevronLeft size={17} /><span className="hidden sm:inline">Previous Month</span><span className="sr-only sm:hidden">Prev</span></span> : <Link className={linkClass} href={href(previousMonth(month))} aria-label={`View ${monthLabel(previousMonth(month))}`}><ChevronLeft size={17} /><span className="hidden sm:inline">Previous Month</span><span className="sr-only sm:hidden">Prev</span></Link>}</div>
      <div className="inline-flex rounded-xl border border-slate-300 bg-slate-50 p-1" aria-label="Date navigation mode">
        {custom ? <Link href={href(month)} className="inline-flex min-h-10 items-center rounded-lg px-1 text-xs font-bold text-slate-600 sm:px-5 sm:text-sm">Monthly</Link> : <button type="button" aria-pressed={!mode} onClick={() => setMode(false)} className={`min-h-10 rounded-lg px-1 text-xs font-bold sm:px-5 sm:text-sm ${!mode ? "bg-cyan-700 text-white" : "text-slate-600"}`}>Monthly</button>}
        <button type="button" aria-pressed={mode} onClick={() => setMode(true)} className={`min-h-10 rounded-lg px-1 text-xs font-bold sm:px-5 sm:text-sm ${mode ? "bg-cyan-700 text-white" : "text-slate-600"}`}>Custom Range</button>
      </div>
      <div className="text-right">{mode || month >= currentMonth ? <span aria-disabled="true" className={`${linkClass} opacity-40`}><span className="hidden sm:inline">Next Month</span><span className="sr-only sm:hidden">Next</span><ChevronRight size={17} /></span> : <Link className={linkClass} href={href(nextMonth(month))} aria-label={`View ${monthLabel(nextMonth(month))}`}><span className="hidden sm:inline">Next Month</span><span className="sr-only sm:hidden">Next</span><ChevronRight size={17} /></Link>}</div>
    </div>
    {mode ? <form action={path} method="get" className="mt-3 flex flex-wrap items-center justify-center gap-3 border-t border-slate-200 pt-3">
      <input type="hidden" name="range" value="custom" />{view && <input type="hidden" name="view" value={view} />}
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">Start Date<input name="start" type="date" required value={from} onChange={e => setFrom(e.target.value)} className="h-11 w-40 rounded-lg border-2 border-slate-500 bg-white px-2 text-sm text-hospital-ink" /></label>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">End Date<input name="end" type="date" required min={from || undefined} value={to} onChange={e => setTo(e.target.value)} className="h-11 w-40 rounded-lg border-2 border-slate-500 bg-white px-2 text-sm text-hospital-ink" /></label>
      <button disabled={reversed} className="min-h-11 rounded-lg bg-cyan-700 px-5 text-sm font-bold text-white disabled:opacity-50">Apply</button>
      {reversed && <p role="alert" className="w-full text-center text-xs text-rose-700">Start date must be on or before end date.</p>}
    </form> : <div className="mt-3 text-center"><p className="text-xs font-semibold text-slate-500">Reporting Month</p><p className="mt-1 text-lg font-extrabold text-hospital-ink">{monthLabel(month)}</p>{month === currentMonth && <span className="text-xs font-semibold text-cyan-800">Month to Date</span>}</div>}
  </section>;
}
