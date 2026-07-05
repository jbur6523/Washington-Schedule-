"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusShiftType, ShiftStatusUpdate } from "@/lib/shift-status/types";
import {
  currentShiftType,
  formatShiftStatusTime,
  latestShiftStatus,
  shiftTypeLabel,
  todayInTimezone,
  updatedByName
} from "@/lib/shift-status/utils";

const shiftStatusSelect = [
  "id",
  "department_id",
  "shift_date",
  "shift_type",
  "rts_on",
  "rts_required",
  "vent_count",
  "bipap_count",
  "c_section_count",
  "cabg_count",
  "bronch_count",
  "sputum_induction_count",
  "other_procedure_count",
  "other_procedure_note",
  "updated_by_staff_profile_id",
  "updated_by_name",
  "created_at",
  "updated_at",
  "staff_profiles(display_name)"
].join(", ");

export function DirectorShiftStatusClient({
  authContext,
  timezone
}: {
  authContext: AuthenticatedUserContext;
  timezone: string;
}) {
  const [shiftDate, setShiftDate] = useState(() => todayInTimezone(timezone));
  const [shiftType, setShiftType] = useState<ShiftStatusShiftType>(() => currentShiftType());
  const [updates, setUpdates] = useState<ShiftStatusUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("shift_status_updates")
        .select(shiftStatusSelect)
        .eq("department_id", authContext.departmentId)
        .eq("shift_date", shiftDate)
        .eq("shift_type", shiftType)
        .order("updated_at", { ascending: false })
        .limit(10);

      setLoading(false);

      if (loadError) {
        setError("Unable to load shift status.");
        setUpdates([]);
        return;
      }

      setUpdates((data ?? []) as unknown as ShiftStatusUpdate[]);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authContext.departmentId, shiftDate, shiftType]);

  const latest = useMemo(() => latestShiftStatus(updates), [updates]);
  const shortBy = latest ? Math.max(0, latest.rts_required - latest.rts_on) : 0;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Director View</p>
          <h1 className="mt-2 text-3xl font-black text-hospital-ink">Shift Status</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Respiratory department shift numbers
          </p>
        </section>

        <section className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
          <h2 className="text-lg font-black text-hospital-ink">Select Shift</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Date</span>
              <input
                type="date"
                value={shiftDate}
                onChange={(event) => setShiftDate(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Shift</span>
              <select
                value={shiftType}
                onChange={(event) => setShiftType(event.target.value as ShiftStatusShiftType)}
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              >
                <option value="day">{shiftTypeLabel("day")}</option>
                <option value="night">{shiftTypeLabel("night")}</option>
              </select>
            </label>
          </div>
        </section>

        {loading && (
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <p className="text-sm font-bold text-slate-500">Loading shift status...</p>
          </section>
        )}

        {error && (
          <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}

        {!loading && !latest && !error && (
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-xl font-black text-hospital-ink">No shift update found.</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              The command center has not saved numbers for this date and shift yet.
            </p>
          </section>
        )}

        {latest && (
          <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
              {shiftTypeLabel(latest.shift_type)}
            </p>
            <h2 className="mt-1 text-2xl font-black text-hospital-ink">
              {latest.rts_on} on / {latest.rts_required} required
            </h2>
            <p className={`mt-2 text-sm font-black ${shortBy > 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {shortBy > 0 ? `Short by ${shortBy}` : "Staffing meets requirement"}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-cyan-50 px-3 py-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Vent count</p>
                <p className="mt-1 text-2xl font-black text-hospital-ink">{latest.vent_count}</p>
              </div>
              <div className="rounded-2xl bg-cyan-50 px-3 py-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">BiPAP count</p>
                <p className="mt-1 text-2xl font-black text-hospital-ink">{latest.bipap_count}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Scheduled Procedures</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm font-bold text-slate-700">
                <div>C-Sections: {latest.c_section_count}</div>
                <div>CABG: {latest.cabg_count}</div>
                <div>Bronch: {latest.bronch_count}</div>
                <div>Sputum Induction: {latest.sputum_induction_count}</div>
                <div>Other: {latest.other_procedure_count}</div>
              </dl>
              {latest.other_procedure_note && (
                <p className="mt-2 text-xs font-bold text-slate-500">Other note: {latest.other_procedure_note}</p>
              )}
            </div>

            <p className="mt-4 text-xs font-bold text-slate-500">
              Last updated: {formatShiftStatusTime(latest.updated_at, timezone)} by {updatedByName(latest)}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
