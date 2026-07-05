"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusShiftType, ShiftStatusStaffOption } from "@/lib/shift-status/types";
import { currentShiftType, shiftTypeLabel, todayInTimezone } from "@/lib/shift-status/utils";

type ShiftUpdateForm = {
  shiftDate: string;
  shiftType: ShiftStatusShiftType;
  rtsOn: string;
  rtsRequired: string;
  ventCount: string;
  bipapCount: string;
  cSectionCount: string;
  cabgCount: string;
  bronchCount: string;
  sputumInductionCount: string;
  otherProcedureCount: string;
  otherProcedureNote: string;
  updatedByStaffProfileId: string;
  updatedByName: string;
};

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function ShiftUpdateClient({
  authContext,
  timezone
}: {
  authContext: AuthenticatedUserContext;
  timezone: string;
}) {
  const [staffOptions, setStaffOptions] = useState<ShiftStatusStaffOption[]>([]);
  const [form, setForm] = useState<ShiftUpdateForm>(() => ({
    shiftDate: todayInTimezone(timezone),
    shiftType: currentShiftType(),
    rtsOn: "",
    rtsRequired: "",
    ventCount: "",
    bipapCount: "",
    cSectionCount: "0",
    cabgCount: "0",
    bronchCount: "0",
    sputumInductionCount: "0",
    otherProcedureCount: "0",
    otherProcedureNote: "",
    updatedByStaffProfileId: authContext.staffProfileId ?? "",
    updatedByName: authContext.staffProfileId ? "" : authContext.displayName
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("staff_profiles")
        .select("id, display_name")
        .eq("department_id", authContext.departmentId)
        .eq("is_active", true)
        .order("display_name", { ascending: true });

      setStaffOptions((data ?? []) as ShiftStatusStaffOption[]);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authContext.departmentId]);

  const selectedStaff = useMemo(
    () => staffOptions.find((staff) => staff.id === form.updatedByStaffProfileId) ?? null,
    [form.updatedByStaffProfileId, staffOptions]
  );
  const updatedByName = selectedStaff?.display_name ?? form.updatedByName.trim();
  const canSave = Boolean(form.shiftDate && form.shiftType && form.rtsOn !== "" && form.rtsRequired !== "" && updatedByName);

  const saveShiftUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSave) {
      setError("Shift date, shift, RT counts, and updated-by attribution are required.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: saveError } = await supabase.from("shift_status_updates").insert({
      department_id: authContext.departmentId,
      shift_date: form.shiftDate,
      shift_type: form.shiftType,
      rts_on: numberValue(form.rtsOn),
      rts_required: numberValue(form.rtsRequired),
      vent_count: numberValue(form.ventCount),
      bipap_count: numberValue(form.bipapCount),
      c_section_count: numberValue(form.cSectionCount),
      cabg_count: numberValue(form.cabgCount),
      bronch_count: numberValue(form.bronchCount),
      sputum_induction_count: numberValue(form.sputumInductionCount),
      other_procedure_count: numberValue(form.otherProcedureCount),
      other_procedure_note: form.otherProcedureNote.trim() || null,
      updated_by_staff_profile_id: form.updatedByStaffProfileId || null,
      updated_by_name: updatedByName
    });

    setSaving(false);

    if (saveError) {
      setError("Unable to save shift update.");
      return;
    }

    setMessage("Shift update saved.");
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Respiratory Command Center</p>
          <h1 className="mt-2 text-2xl font-black text-hospital-ink">Shift Update</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Update current shift staffing and equipment numbers.
          </p>
          <Link
            href="/command-center"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
          >
            Back to Command Center
          </Link>
        </section>

        <form onSubmit={saveShiftUpdate} className="space-y-4">
          <section className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Shift</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Date</span>
                <input
                  type="date"
                  value={form.shiftDate}
                  onChange={(event) => setForm((current) => ({ ...current, shiftDate: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Shift</span>
                <select
                  value={form.shiftType}
                  onChange={(event) => setForm((current) => ({ ...current, shiftType: event.target.value as ShiftStatusShiftType }))}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                >
                  <option value="day">{shiftTypeLabel("day")}</option>
                  <option value="night">{shiftTypeLabel("night")}</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Staffing</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["rtsOn", "Number of RTs on"],
                ["rtsRequired", "Number of RTs required"]
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form[key as keyof ShiftUpdateForm]}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Equipment Counts</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["ventCount", "Vent count"],
                ["bipapCount", "BiPAP count"]
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form[key as keyof ShiftUpdateForm]}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Scheduled Procedures</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["cSectionCount", "C-Section count"],
                ["cabgCount", "CABG count"],
                ["bronchCount", "Bronch count"],
                ["sputumInductionCount", "Sputum Induction count"],
                ["otherProcedureCount", "Other count"]
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form[key as keyof ShiftUpdateForm]}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                </label>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Other procedure note</span>
              <input
                value={form.otherProcedureNote}
                onChange={(event) => setForm((current) => ({ ...current, otherProcedureNote: event.target.value.slice(0, 100) }))}
                maxLength={100}
                placeholder="Optional"
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              />
              <span className="mt-1 block text-xs font-bold text-slate-500">No patient information.</span>
            </label>
          </section>

          <section className="rounded-3xl border border-cyan-100 bg-cyan-50/80 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Updated By</h2>
            <label className="mt-3 block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Select staff member</span>
              <select
                value={form.updatedByStaffProfileId}
                onChange={(event) => setForm((current) => ({ ...current, updatedByStaffProfileId: event.target.value, updatedByName: "" }))}
                className="mt-1 min-h-11 w-full rounded-2xl border border-cyan-100 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              >
                <option value="">Select staff</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Or enter name/initials</span>
              <input
                value={form.updatedByName}
                onChange={(event) => setForm((current) => ({ ...current, updatedByStaffProfileId: "", updatedByName: event.target.value.slice(0, 120) }))}
                placeholder="Initials or name"
                className="mt-1 min-h-11 w-full rounded-2xl border border-cyan-100 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              />
            </label>
          </section>

          {error && <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
          {message && <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p>}

          <button
            type="submit"
            disabled={saving || !canSave}
            className="min-h-12 w-full rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
          >
            {saving ? "Saving..." : "Save Shift Update"}
          </button>
        </form>
      </div>
    </main>
  );
}
