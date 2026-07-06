"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
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

export function CurrentShiftStatusSummary({
  authContext,
  timezone,
  shiftFilter
}: {
  authContext: AuthenticatedUserContext;
  timezone: string;
  shiftFilter: "day" | "night" | "all";
}) {
  const [updates, setUpdates] = useState<ShiftStatusUpdate[]>([]);
  const [error, setError] = useState("");
  const today = useMemo(() => todayInTimezone(timezone), [timezone]);
  const currentShift = useMemo(() => currentShiftType(), []);
  const selectedShiftType = useMemo<ShiftStatusShiftType>(
    () => (shiftFilter === "all" ? currentShift : shiftFilter),
    [currentShift, shiftFilter]
  );

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("shift_status_updates")
        .select(shiftStatusSelect)
        .eq("department_id", authContext.departmentId)
        .eq("shift_date", today)
        .eq("shift_type", selectedShiftType)
        .order("updated_at", { ascending: false })
        .limit(3);

      if (loadError) {
        setError("Shift status unavailable.");
        setUpdates([]);
        return;
      }

      setUpdates((data ?? []) as unknown as ShiftStatusUpdate[]);
      setError("");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authContext.departmentId, selectedShiftType, today]);

  const latest = latestShiftStatus(updates);
  const shortBy = latest ? Math.max(0, latest.rts_required - latest.rts_on) : 0;
  const staffingStatus = shortBy > 0 ? `Short by ${shortBy}` : "Fully staffed";

  if (error) {
    return (
      <div className="mt-4 border-t border-violet-100 pt-4">
        <p className="text-center text-sm font-black uppercase tracking-wide text-cyan-700">
          Current Shift Status · {shiftTypeLabel(selectedShiftType)}
        </p>
        <p className="mt-2 text-center text-sm font-bold text-slate-500">Shift status unavailable.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-violet-100 pt-4">
      <div className="text-center">
        <p className="text-sm font-black uppercase tracking-wide text-cyan-700">
          Current Shift Status · {shiftTypeLabel(selectedShiftType)}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Activity size={20} />
        </span>

        <div className="min-w-0 flex-1">
          {!latest ? (
            <p className="rounded-2xl border border-slate-100 bg-white/90 px-3 py-3 text-center text-sm font-bold text-slate-500 shadow-sm">
              No update submitted for this shift yet.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-sm font-black text-hospital-ink">
              <div className="rounded-2xl bg-cyan-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-cyan-700">RTs</p>
                <p>
                  {latest.rts_on} on / {latest.rts_required} needed
                </p>
                <p className={`mt-1 text-[11px] ${shortBy > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {staffingStatus}
                </p>
              </div>
              <div className="rounded-2xl bg-white/90 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Vents</p>
                <p>{latest.vent_count}</p>
              </div>
              <div className="rounded-2xl bg-white/90 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">BiPAPs</p>
                <p>{latest.bipap_count}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {latest && (
        <div className="mt-3 text-center text-xs font-bold text-slate-500">
          <p>Last updated: {formatShiftStatusTime(latest.updated_at, timezone)}</p>
          <p className="mt-1">Updated by: {updatedByName(latest)}</p>
        </div>
      )}
    </div>
  );
}
