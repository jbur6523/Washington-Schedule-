"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Activity, Baby, Bed, ClipboardList, Droplet, MoreHorizontal, Stethoscope, User, Wind } from "lucide-react";
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
  vaginalDeliveryCount: string;
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

const labelClass = "block min-h-4 text-[11px] font-extrabold uppercase leading-4 tracking-normal text-slate-500";
const controlClass =
  "mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100";
const cyanControlClass =
  "mt-1 h-11 w-full rounded-2xl border border-cyan-100 bg-white px-3 text-sm font-bold text-hospital-ink outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100";
const twoColumnGridClass = "mt-3 grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2";

function isValidManualUpdater(value: string) {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized && normalized !== "sputum" && !normalized.includes("command center"));
}

function CountInputCard({
  icon,
  label,
  value,
  step = "1",
  inputMode = "numeric",
  onChange
}: {
  icon: ReactNode;
  label: string;
  value: string;
  step?: string;
  inputMode?: "numeric" | "decimal";
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-h-[7.25rem] flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/80 px-2.5 py-3 text-center shadow-sm">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
        {icon}
      </span>
      <span className="mt-2 text-[12px] font-extrabold leading-tight text-slate-600">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-2xl border border-cyan-100 bg-white px-2 text-center text-3xl font-black leading-none text-hospital-ink shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
      />
    </label>
  );
}

function ProcedureInputTile({
  icon,
  label,
  value,
  onChange
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-h-[8.5rem] flex-col items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-2.5 py-3 text-center shadow-sm">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
        {icon}
      </span>
      <span className="mt-2 flex min-h-8 items-center justify-center text-[12px] font-extrabold leading-tight text-slate-600">
        {label}
      </span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 h-10 w-full rounded-2xl border border-slate-200 bg-white px-2 text-center text-2xl font-black leading-none text-hospital-ink shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
      />
    </label>
  );
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
    cSectionCount: "",
    vaginalDeliveryCount: "",
    cabgCount: "",
    bronchCount: "",
    sputumInductionCount: "",
    otherProcedureCount: "",
    otherProcedureNote: "",
    updatedByStaffProfileId: authContext.role === "lead" ? authContext.staffProfileId ?? "" : "",
    updatedByName: ""
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
        .in("assigned_role", ["admin", "lead"])
        .eq("operations_role", "none")
        .order("display_name", { ascending: true });

      setStaffOptions((data ?? []) as ShiftStatusStaffOption[]);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authContext.departmentId]);

  const selectedStaff = useMemo(
    () => staffOptions.find((staff) => staff.id === form.updatedByStaffProfileId) ?? null,
    [form.updatedByStaffProfileId, staffOptions]
  );
  const manualUpdatedByName = isValidManualUpdater(form.updatedByName) ? form.updatedByName.trim() : "";
  const updatedByName = selectedStaff?.display_name ?? manualUpdatedByName;
  const canSave = Boolean(
    form.shiftDate &&
      form.shiftType &&
      form.rtsOn !== "" &&
      form.rtsRequired !== "" &&
      form.ventCount !== "" &&
      form.bipapCount !== "" &&
      updatedByName
  );

  const saveShiftUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSave) {
      setError("Select lead and enter shift numbers to continue.");
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
      vaginal_delivery_count: numberValue(form.vaginalDeliveryCount),
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
            <div className={twoColumnGridClass}>
              <label className="block">
                <span className={labelClass}>Date</span>
                <input
                  type="date"
                  value={form.shiftDate}
                  onChange={(event) => setForm((current) => ({ ...current, shiftDate: event.target.value }))}
                  className={controlClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Shift</span>
                <select
                  value={form.shiftType}
                  onChange={(event) => setForm((current) => ({ ...current, shiftType: event.target.value as ShiftStatusShiftType }))}
                  className={controlClass}
                >
                  <option value="day">{shiftTypeLabel("day")}</option>
                  <option value="night">{shiftTypeLabel("night")}</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Current Counts</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">Staffing and equipment for this shift</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <CountInputCard
                icon={<Users size={18} />}
                label="RTs Scheduled"
                value={form.rtsOn}
                onChange={(value) => setForm((current) => ({ ...current, rtsOn: value }))}
              />
              <CountInputCard
                icon={<User size={18} />}
                label="RTs Needed"
                value={form.rtsRequired}
                step="0.1"
                inputMode="decimal"
                onChange={(value) => setForm((current) => ({ ...current, rtsRequired: value }))}
              />
              <CountInputCard
                icon={<Wind size={18} />}
                label="Vents"
                value={form.ventCount}
                onChange={(value) => setForm((current) => ({ ...current, ventCount: value }))}
              />
              <CountInputCard
                icon={<Activity size={18} />}
                label="BiPAPs"
                value={form.bipapCount}
                onChange={(value) => setForm((current) => ({ ...current, bipapCount: value }))}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-hospital-ink">Scheduled Procedures</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">Counts for this shift</p>
              </div>
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <ClipboardList size={18} />
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <ProcedureInputTile
                icon={<Bed size={18} />}
                label="C-Sections"
                value={form.cSectionCount}
                onChange={(value) => setForm((current) => ({ ...current, cSectionCount: value }))}
              />
              <ProcedureInputTile
                icon={<Baby size={18} />}
                label="Vaginal Deliveries"
                value={form.vaginalDeliveryCount}
                onChange={(value) => setForm((current) => ({ ...current, vaginalDeliveryCount: value }))}
              />
              <ProcedureInputTile
                icon={<Activity size={18} />}
                label="CABG"
                value={form.cabgCount}
                onChange={(value) => setForm((current) => ({ ...current, cabgCount: value }))}
              />
              <ProcedureInputTile
                icon={<Stethoscope size={18} />}
                label="Bronchs"
                value={form.bronchCount}
                onChange={(value) => setForm((current) => ({ ...current, bronchCount: value }))}
              />
              <ProcedureInputTile
                icon={<Droplet size={18} />}
                label="Sputum Inductions"
                value={form.sputumInductionCount}
                onChange={(value) => setForm((current) => ({ ...current, sputumInductionCount: value }))}
              />
              <ProcedureInputTile
                icon={<MoreHorizontal size={18} />}
                label="Other"
                value={form.otherProcedureCount}
                onChange={(value) => setForm((current) => ({ ...current, otherProcedureCount: value }))}
              />
            </div>
            <label className="mt-3 block">
              <span className={labelClass}>Other Note (Optional)</span>
              <input
                value={form.otherProcedureNote}
                onChange={(event) => setForm((current) => ({ ...current, otherProcedureNote: event.target.value.slice(0, 100) }))}
                maxLength={100}
                className={controlClass}
              />
              <span className="mt-1 block text-xs font-bold text-slate-500">No patient information.</span>
            </label>
          </section>

          <section className="rounded-3xl border border-cyan-100 bg-cyan-50/80 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Updated By</h2>
            <label className="mt-3 block">
              <span className={labelClass}>Select Lead</span>
              <select
                value={form.updatedByStaffProfileId}
                onChange={(event) => setForm((current) => ({ ...current, updatedByStaffProfileId: event.target.value, updatedByName: "" }))}
                className={cyanControlClass}
              >
                <option value="">Select lead updating shift</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.display_name}
                  </option>
                ))}
              </select>
            </label>
            {staffOptions.length === 0 && (
              <p className="mt-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                No lead or admin users found. Please update access first.
              </p>
            )}
            <label className="mt-3 block border-t border-cyan-100 pt-3">
              <span className={labelClass}>Or enter initials/name</span>
              <input
                value={form.updatedByName}
                onChange={(event) => setForm((current) => ({ ...current, updatedByStaffProfileId: "", updatedByName: event.target.value.slice(0, 120) }))}
                placeholder="Initials or name"
                className={cyanControlClass}
              />
              {form.updatedByName && !manualUpdatedByName && (
                <span className="mt-1 block text-xs font-bold text-amber-700">
                  Enter a lead name or initials, not the shared Command Center account.
                </span>
              )}
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
          {!canSave && (
            <p className="text-center text-xs font-bold text-slate-500">
              Select lead and enter shift numbers to continue.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
