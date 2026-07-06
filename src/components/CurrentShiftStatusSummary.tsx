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
  "vaginal_delivery_count",
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

function MiniStatCard({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string | number;
  tone?: "cyan" | "neutral";
}) {
  const toneClass =
    tone === "cyan"
      ? "border-cyan-100 bg-cyan-50 text-cyan-700"
      : "border-slate-100 bg-white/95 text-slate-500 shadow-sm";

  return (
    <div className={`flex min-h-[3.8rem] flex-col items-center justify-center rounded-2xl border px-2 py-1.5 text-center ${toneClass}`}>
      <p className="text-[9px] font-extrabold uppercase leading-[0.7rem] tracking-normal">{label}</p>
      <p className="mt-0.5 text-lg font-black leading-none text-hospital-ink">{value}</p>
    </div>
  );
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
      <div className="mt-2.5 border-t border-violet-100 pt-2.5">
        <p className="text-center text-xs font-black uppercase tracking-normal text-cyan-700">
          Current Shift Status {"\u00b7"} No Update
        </p>
        <p className="mt-2 text-center text-sm font-bold text-slate-500">Shift status unavailable.</p>
      </div>
    );
  }

  return (
    <div className="mt-2.5 border-t border-violet-100 pt-2.5">
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-center">
        <p className="text-xs font-black uppercase tracking-normal text-cyan-700">Current Shift Status</p>
        <span className="text-xs font-black uppercase tracking-normal text-cyan-700">{"\u00b7"}</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-normal ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-2 flex items-stretch gap-2">
        <span className="grid w-10 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Activity size={18} />
        </span>

        <div className="min-w-0 flex-1">
          {!latest ? (
            <p className="rounded-2xl border border-slate-100 bg-white/90 px-3 py-2.5 text-center text-sm font-bold text-slate-500 shadow-sm">
              No update has been submitted for the current shift yet.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <MiniStatCard label="SCHEDULED" value={formatShiftStatusNumber(latest.rts_on)} tone="cyan" />
              <MiniStatCard label="NEEDED" value={formatShiftStatusNumber(latest.rts_required)} />
              <MiniStatCard label="VENTS" value={latest.vent_count} />
            </div>
          )}
        </div>
      </div>

      {latest && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-[11px] font-bold leading-4 text-slate-500">
          <p>Last updated: {formatShiftStatusTime(latest.updated_at, timezone)}</p>
          <span className="hidden text-slate-300 min-[390px]:inline">{"\u00b7"}</span>
          <p>Updated by: {updatedByName(latest)}</p>
        </div>
      )}
    </div>
  );
}
