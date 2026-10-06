"use client";
import type { OperationalReport } from "@/lib/metrics/operational-export";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, X } from "lucide-react";
import type { CalculatedRvuStaffingRow, MetricDateRange } from "@/lib/metrics/rvu-staffing";

export function RvuStaffingDownload({ rows, range, disabled, rangeLabel, operational }: { rows: CalculatedRvuStaffingRow[]; range: MetricDateRange; disabled: boolean; rangeLabel?: string; operational?: OperationalReport }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function download(format: "pdf" | "xlsx") {
    setBusy(true); setMessage("");
    try {
      if (operational) {
        const { downloadOperationalReport } = await import("@/lib/metrics/operational-export");
        await downloadOperationalReport(operational, format);
      } else {
      const { downloadMetrics } = await import("@/lib/metrics/rvu-staffing-export");
      await downloadMetrics(rows, range, format, rangeLabel);
      }
      setMessage("Download started. You can attach the saved file to an email.");
    } catch { setMessage("Could not create the file. Please try again."); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" disabled={disabled} aria-haspopup="dialog" onClick={() => { setMessage(""); setOpen(true); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-bold text-white hover:bg-cyan-800 disabled:opacity-50"><Download size={18} />Download Report</button>
    {open && <dialog aria-labelledby="metrics-download-title" ref={element => { if (element && !element.open) element.showModal(); }} onClose={() => setOpen(false)} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-300 bg-white p-5 shadow-2xl backdrop:bg-slate-950/40">
      <div className="flex items-center justify-between gap-3"><h2 id="metrics-download-title" className="text-xl font-extrabold text-hospital-ink">Download Report</h2><button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-300 px-3 text-sm font-bold"><X size={16} />Close</button></div>
      <p className="mt-3 text-sm text-slate-600">{operational ? `Includes ${operational.view === "both" ? "RVUs and Procedures" : operational.view === "rvu" ? "RVUs" : "Procedures"} for ${operational.start} to ${operational.end}, with all daily details and both shifts.` : "Both shifts and all reported detail rows for the applied date range."}</p>
      <div className="mt-4 grid gap-3">
        <button type="button" disabled={busy} onClick={() => void download("pdf")} className="rounded-xl border-2 border-cyan-700 bg-sky-50 p-4 text-left text-hospital-ink disabled:opacity-50"><span className="flex items-center gap-2 font-bold"><FileText size={20} />Download PDF</span><span className="mt-1 block text-xs">Summary, trend charts and Daily Operational Detail.</span></button>
        <button type="button" disabled={busy} onClick={() => void download("xlsx")} className="rounded-xl border-2 border-cyan-700 bg-sky-50 p-4 text-left text-hospital-ink disabled:opacity-50"><span className="flex items-center gap-2 font-bold"><FileSpreadsheet size={20} />Download Excel (.xlsx)</span><span className="mt-1 block text-xs">Summaries and filterable Daily Operational Detail with numeric values.</span></button>
      </div>
      <p role="status" className="mt-3 text-sm text-slate-700">{busy ? "Preparing your report..." : message}</p>
    </dialog>}
  </>;
}
