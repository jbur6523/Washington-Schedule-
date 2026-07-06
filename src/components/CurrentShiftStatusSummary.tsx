"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";
import {
  formatShiftStatusNumber,
  formatShiftStatusTime,
  resolveCurrentShiftStatus,
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

function titleStatus(update: ShiftStatusUpdate | null) {
  if (!update) {
    return "No Update";
  }

  return update.rts_on >= update.rts_required ? "Staffed" : "Short";
}

function titleStatusClass(status: string) {
  if (status === "Staffed") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (status === "Short") {
    return "border-rose-100 bg-rose-50 text-rose-700";
  }

  return "border-slate-100 bg-slate-50 text-slate-500";
}

export function CurrentShiftStatusSummary({
  authContext,
  timezone
}: {
  authContext: AuthenticatedUserContext;
  timezone: string;
}) {
  const [updates, setUpdates] = useState<ShiftStatusUpdate[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadStatus = async () => {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("shift_status_updates")
        .select(shiftStatusSelect)
        .eq("department_id", authContext.departmentId)
        .order("updated_at", { ascending: false })
        .limit(30);

      if (loadError) {
        setError("Shift status unavailable.");
        setUpdates([]);
        return;
      }

      setUpdates((data ?? []) as unknown as ShiftStatusUpdate[]);
      setError("");
    };

    const timer = window.setTimeout(() => {
      void loadStatus();
    }, 0);
    const interval = window.setInterval(() => {
      void loadStatus();
    }, 60 * 1000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [authContext.departmentId, timezone]);

  const { latest } = resolveCurrentShiftStatus(updates, timezone);
  const statusLabel = titleStatus(latest);
  const statusClass = titleStatusClass(statusLabel);

  if (error) {
    return (
      <div className="mt-4 border-t border-violet-100 pt-4">
        <p className="text-center text-sm font-black uppercase tracking-wide text-cyan-700">
          Current Shift Status {"\u00b7"} No Update
        </p>
        <p className="mt-2 text-center text-sm font-bold text-slate-500">Shift status unavailable.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-violet-100 pt-4">
      <div className="flex flex-wrap items-center justify-center gap-2 text-center">
        <p className="text-sm font-black uppercase tracking-wide text-cyan-700">Current Shift Status</p>
        <span className="text-sm font-black uppercase tracking-wide text-cyan-700">{"\u00b7"}</span>
        <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Activity size={20} />
        </span>

        <div className="min-w-0 flex-1">
          {!latest ? (
            <p className="rounded-2xl border border-slate-100 bg-white/90 px-3 py-3 text-center text-sm font-bold text-slate-500 shadow-sm">
              No update has been submitted for the current shift yet.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-sm font-black text-hospital-ink">
              <div className="rounded-2xl bg-cyan-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-cyan-700">RTs Scheduled</p>
                <p>{formatShiftStatusNumber(latest.rts_on)}</p>
              </div>
              <div className="rounded-2xl bg-white/90 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">RTs Needed</p>
                <p>{formatShiftStatusNumber(latest.rts_required)}</p>
              </div>
              <div className="rounded-2xl bg-white/90 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Vents</p>
                <p>{latest.vent_count}</p>
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
