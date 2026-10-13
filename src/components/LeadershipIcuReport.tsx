"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { useIcuPatients } from "@/components/IcuReadOnlyViews";
import { buildIcuRoundingReport, printIcuRoundingReport } from "@/lib/icu-command-center/print-report";

export function LeadershipIcuReport({ departmentId, departmentName }: { departmentId: string; departmentName: string }) {
  const { records, loading, error, reload } = useIcuPatients(departmentId);
  const report = useMemo(() => buildIcuRoundingReport(records, departmentName, new Date(), false), [records, departmentName]);
  return <main className="min-h-screen px-4 py-6">
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <Link href="/director/shift-status" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-cyan-800"><ArrowLeft size={17} aria-hidden="true" />Back to Leadership Dashboard</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-black text-hospital-ink">ICU Report</h1><p className="mt-1 text-sm text-slate-500">The full report from ICU Command Center, including notes and rounding details.</p></div>
          <div className="flex gap-2">
            <button type="button" disabled={loading} onClick={() => void reload()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold disabled:opacity-50"><RefreshCw size={17} aria-hidden="true" />Refresh</button>
            <button type="button" disabled={loading || Boolean(error)} onClick={() => printIcuRoundingReport(records, departmentName)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-700 px-3 text-sm font-bold text-white disabled:opacity-50"><Printer size={17} aria-hidden="true" />Print Report</button>
          </div>
        </div>
      </header>
      {error ? <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-rose-800">{error}</p> : loading ? <p role="status" className="rounded-2xl bg-white p-4 text-slate-600">Loading ICU report…</p> : <iframe title="Full ICU rounding report" sandbox="allow-same-origin" srcDoc={report} className="w-full rounded-2xl border border-slate-200 bg-white" style={{ height: "75vh", minHeight: 600 }} />}
    </div>
  </main>;
}
