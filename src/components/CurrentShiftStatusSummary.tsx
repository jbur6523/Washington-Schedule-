"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";
import { currentShiftType, formatShiftStatusTime, latestShiftStatus, todayInTimezone } from "@/lib/shift-status/utils";

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
  "updated_at"
].join(", ");

export function CurrentShiftStatusSummary({
  authContext,
  timezone
}: {
  authContext: AuthenticatedUserContext;
  timezone: string;
}) {
  const [updates, setUpdates] = useState<ShiftStatusUpdate[]>([]);
  const [error, setError] = useState("");
  const today = useMemo(() => todayInTimezone(timezone), [timezone]);
  const shiftType = useMemo(() => currentShiftType(), []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("shift_status_updates")
        .select(shiftStatusSelect)
        .eq("department_id", authContext.departmentId)
        .eq("shift_date", today)
        .eq("shift_type", shiftType)
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
  }, [authContext.departmentId, shiftType, today]);

  const latest = latestShiftStatus(updates);

  if (error || !latest) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Activity size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Current Shift Status</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-black text-hospital-ink">
            <div className="rounded-2xl bg-cyan-50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-cyan-700">RTs</p>
              <p>{latest.rts_on} on / {latest.rts_required} needed</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Vents</p>
              <p>{latest.vent_count}</p>
            </div>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-500">
            Last updated: {formatShiftStatusTime(latest.updated_at, timezone)}
          </p>
        </div>
      </div>
    </section>
  );
}
