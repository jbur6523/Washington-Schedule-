"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchRvuStaffingMetricRows } from "@/lib/metrics/queries";
import { compareShiftRvus, rvuHistoryWindow } from "@/lib/metrics/rvu-comparison";
import type { RvuStaffingMetricRow } from "@/lib/metrics/rvu-staffing";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

export function ShiftRvuComparison({ update }: { update: ShiftStatusUpdate }) {
  const [history, setHistory] = useState<{ rows: RvuStaffingMetricRow[]; error: boolean } | null>(null);
  const { department_id: departmentId, shift_date: date, shift_type: shift, updated_at: updatedAt } = update;
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await fetchRvuStaffingMetricRows(createClient(), departmentId, { ...rvuHistoryWindow(date), shift });
        if (active) setHistory({ rows: result.data, error: Boolean(result.error) });
      } catch {
        if (active) setHistory({ rows: [], error: true });
      }
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [departmentId, date, shift, updatedAt]);

  const result = compareShiftRvus(update, history?.rows ?? []);
  const format = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const label = result.currentRvus === null ? "RVUs not recorded" : !history ? "Loading comparison…" : history.error ? "Comparison unavailable" : result.label;
  return <div className="mt-2 w-full text-xs text-slate-600">
    {result.currentRvus !== null && <p className="font-bold">{format(result.currentRvus)} RVUs</p>}
    <details className="mt-1">
      <summary className="cursor-pointer rounded-lg px-1 py-1 font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600">{label}</summary>
      <div className="mt-2 space-y-1 text-left leading-5">
        <p>Compared with {shift} shifts from {result.minimumShiftDate} through {result.maximumShiftDate}, excluding this shift.</p>
        {history?.error ? <p>Could not load RVU history. Retrying automatically.</p> : !history ? <p>Loading RVU history…</p> : <>
          <p>15-day average: {result.average === null ? "—" : `${format(result.average)} RVUs`}</p>
          <p>{result.count} valid shifts recorded; at least 10 required.</p>
          {result.count >= 10 && result.percent !== null && <p>Current: {result.percent > 0 ? "+" : ""}{format(result.percent)}% versus average.</p>}
          {result.average === 0 && <p>The historical average is zero; a percentage comparison is unavailable.</p>}
        </>}
        <p>Near average means within ±10%. This comparison does not change RTs Needed.</p>
      </div>
    </details>
  </div>;
}
