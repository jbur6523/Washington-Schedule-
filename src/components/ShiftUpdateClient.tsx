"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Baby, Bed, Bone, ClipboardList, Droplet, Heart, Stethoscope, User, Users, Wind } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusShiftType, ShiftStatusStaffOption, ShiftStatusUpdate } from "@/lib/shift-status/types";
import { fetchShiftStatusUpdateForRecord } from "@/lib/shift-status/client-queries";
import { shiftTypeLabel } from "@/lib/shift-status/utils";
import {
  defaultShiftRecordForInstant,
  reportingWindowEndDelay,
  reportingWindowForInstant,
  shiftRecordOptionsForInstant,
  type ShiftRecordSelection,
  type ShiftUpdateReportingWindow
} from "@/lib/shift-status/reporting-window";
import {
  optionalShiftStatusNumberValue,
  rtsNeededFromRvus,
  shiftStatusNumberValue,
  validateShiftStatusCounts
} from "@/lib/shift-status/validation";
import { rememberSessionRvu } from "@/lib/shift-status/session-rvu";

type ShiftUpdateForm = {
  shiftDate: string;
  shiftType: ShiftStatusShiftType;
  rtsOn: string;
  rvuCount: string;
  ventCount: string;
  bipapCount: string;
  cSectionCount: string;
  vaginalDeliveryCount: string;
  cabgCount: string;
  bronchCount: string;
  sputumInductionCount: string;
  otherProcedureCount: string;
  otherProcedureNote: string;
  shiftNote: string;
  updatedByStaffProfileId: string;
  updatedByName: string;
};

const notListedLeadValue = "__not_listed__";

function shiftUpdateFormForSelection(
  update: ShiftStatusUpdate | null,
  selection: ShiftRecordSelection,
  authContext: AuthenticatedUserContext
): ShiftUpdateForm {
  const savedStaffProfileId = update?.updated_by_staff_profile_id ?? null;
  const savedUpdaterName = update?.updated_by_name?.trim() ?? "";
  const fallbackStaffProfileId = authContext.role === "lead" ? authContext.staffProfileId ?? "" : "";

  return {
    shiftDate: selection.shiftDate,
    shiftType: selection.shiftType,
    rtsOn: update ? String(update.rts_on) : "",
    rvuCount: update?.rvu_total === null || update?.rvu_total === undefined ? "" : String(update.rvu_total),
    ventCount: update?.vent_count === null || update?.vent_count === undefined ? "" : String(update.vent_count),
    bipapCount: update ? String(update.bipap_count) : "",
    cSectionCount: update ? String(update.c_section_count) : "0",
    vaginalDeliveryCount: update ? String(update.vaginal_delivery_count) : "0",
    cabgCount: update ? String(update.cabg_count) : "0",
    bronchCount: update ? String(update.bronch_count) : "0",
    sputumInductionCount: update ? String(update.sputum_induction_count) : "0",
    otherProcedureCount: update ? String(update.other_procedure_count) : "0",
    otherProcedureNote: update?.other_procedure_note ?? "",
    shiftNote: update?.shift_note ?? "",
    updatedByStaffProfileId: savedStaffProfileId ?? (savedUpdaterName ? notListedLeadValue : fallbackStaffProfileId),
    updatedByName: savedStaffProfileId ? "" : savedUpdaterName
  };
}

function formSignature(form: ShiftUpdateForm) {
  return JSON.stringify(form);
}

function withDefaultProcedureCounts(form: ShiftUpdateForm): ShiftUpdateForm {
  return {
    ...form,
    cSectionCount: form.cSectionCount.trim() || "0",
    vaginalDeliveryCount: form.vaginalDeliveryCount.trim() || "0",
    cabgCount: form.cabgCount.trim() || "0",
    bronchCount: form.bronchCount.trim() || "0",
    sputumInductionCount: form.sputumInductionCount.trim() || "0",
    otherProcedureCount: form.otherProcedureCount.trim() || "0"
  };
}

function formatLastKnownTime(value: string, timezone: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

function lastKnownHelper(update: ShiftStatusUpdate | null, value: number | null | undefined, timezone: string) {
  if (!update || value === null || value === undefined) {
    return "Last: —";
  }

  const timestamp = formatLastKnownTime(update.updated_at, timezone);
  return timestamp ? `Last: ${value} · ${timestamp}` : `Last: ${value}`;
}

const labelClass = "block min-h-4 text-[11px] font-extrabold uppercase leading-4 tracking-normal text-slate-500";
const controlClass =
  "mt-1 h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
const cyanControlClass =
  "mt-1 h-11 w-full rounded-2xl border border-cyan-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
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
  placeholder,
  helperText,
  onBlur,
  onChange,
  onFocus
}: {
  icon: ReactNode;
  label: string;
  value: string;
  step?: string;
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
  helperText?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onFocus?: () => void;
}) {
  return (
    <label className="flex min-h-[8.75rem] flex-col items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-2.5 py-3 text-center shadow-sm">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
        {icon}
      </span>
      <span className="mt-2 text-[12px] font-extrabold leading-tight text-slate-600">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        className="mt-2 h-11 w-full rounded-2xl border border-slate-400 bg-white px-2 text-center text-3xl font-black leading-none text-hospital-ink shadow-sm outline-none transition placeholder:text-base placeholder:font-bold placeholder:text-slate-400/70 focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
      />
      {helperText && <span className="mt-1 text-[10px] font-bold leading-tight text-slate-400">{helperText}</span>}
    </label>
  );
}

function ProcedureInputTile({
  icon,
  label,
  value,
  helperText,
  onChange
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helperText: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-h-[9.75rem] flex-col items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-2.5 py-3 text-center shadow-sm">
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
        onBlur={(event) => {
          if (!event.currentTarget.value.trim()) {
            onChange("0");
          }
        }}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-2xl border border-slate-400 bg-white px-2 text-center text-3xl font-black leading-none text-hospital-ink shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
      />
      <span className="mt-1 text-[10px] font-bold leading-tight text-slate-400">{helperText}</span>
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
  const router = useRouter();
  const initialSelection = useMemo(
    () => defaultShiftRecordForInstant(new Date(), timezone),
    [timezone]
  );
  const [reportingWindow, setReportingWindow] = useState<ShiftUpdateReportingWindow>(() => reportingWindowForInstant());
  const [selection, setSelection] = useState<ShiftRecordSelection>(initialSelection);
  const [staffOptions, setStaffOptions] = useState<ShiftStatusStaffOption[]>([]);
  const [form, setForm] = useState<ShiftUpdateForm>(() =>
    shiftUpdateFormForSelection(null, initialSelection, authContext)
  );
  const [loadingSelection, setLoadingSelection] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastKnownUpdate, setLastKnownUpdate] = useState<ShiftStatusUpdate | null>(null);
  const [error, setError] = useState("");
  const [editingRvus, setEditingRvus] = useState(true);
  const submissionInFlightRef = useRef(false);
  const latestLoadRequestIdRef = useRef(0);
  const [cleanFormSignature, setCleanFormSignature] = useState(() => formSignature(form));
  const dirty = formSignature(form) !== cleanFormSignature;

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

  const loadSelectedShiftUpdate = useCallback(async () => {
    const requestId = latestLoadRequestIdRef.current + 1;
    latestLoadRequestIdRef.current = requestId;
    setLoadingSelection(true);
    const supabase = createClient();
    const { data: selectedUpdate, error: updatesError } = await fetchShiftStatusUpdateForRecord(
      supabase,
      authContext.departmentId,
      selection.shiftDate,
      selection.shiftType
    );

    if (requestId !== latestLoadRequestIdRef.current) {
      return;
    }

    if (updatesError) {
      setLastKnownUpdate(null);
      setLoadingSelection(false);
      setError("The selected shift could not be loaded. Try again.");
      return;
    }

    const nextForm = shiftUpdateFormForSelection(selectedUpdate, selection, authContext);
    setLastKnownUpdate(selectedUpdate);
    setForm(nextForm);
    setCleanFormSignature(formSignature(nextForm));
    setEditingRvus(true);
    setLoadingSelection(false);
    setError("");
  }, [authContext, selection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSelectedShiftUpdate();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSelectedShiftUpdate]);

  useEffect(() => {
    const delay = reportingWindowEndDelay(reportingWindow);
    const timer = window.setTimeout(() => {
      const now = new Date();
      const nextWindow = reportingWindowForInstant(now);
      setReportingWindow(nextWindow);
      const nextSelection = defaultShiftRecordForInstant(now, timezone);

      if (
        dirty
        && !window.confirm("A new Shift Update workspace is available. Discard unsaved changes and switch?")
      ) {
        setError("The new workspace is available. Your unsaved selected-shift values were kept.");
        return;
      }

      setLoadingSelection(true);
      setSelection(nextSelection);
      setError("");
    }, delay + 25);

    return () => window.clearTimeout(timer);
  }, [dirty, reportingWindow, timezone]);

  const selectShiftType = (shiftType: ShiftStatusShiftType) => {
    const options = shiftRecordOptionsForInstant(new Date(), timezone);
    const nextSelection = options[shiftType];

    if (
      nextSelection.shiftDate === selection.shiftDate
      && nextSelection.shiftType === selection.shiftType
    ) {
      return;
    }

    if (dirty && !window.confirm("Discard unsaved changes and open the other shift?")) {
      return;
    }

    setLoadingSelection(true);
    setSelection(nextSelection);
    setError("");
  };

  const selectedStaff = useMemo(
    () => staffOptions.find((staff) => staff.id === form.updatedByStaffProfileId) ?? null,
    [form.updatedByStaffProfileId, staffOptions]
  );

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);
  const isNotListedLead = form.updatedByStaffProfileId === notListedLeadValue;
  const manualUpdatedByName = isNotListedLead && isValidManualUpdater(form.updatedByName)
    ? form.updatedByName.trim()
    : "";
  const updatedByName = selectedStaff?.display_name ?? manualUpdatedByName;
  const calculatedRtsNeeded = rtsNeededFromRvus(form.rvuCount);
  const canSave = Boolean(
    form.shiftDate &&
      form.shiftType &&
      form.rtsOn !== "" &&
      calculatedRtsNeeded !== null &&
      form.bipapCount !== "" &&
      updatedByName &&
      !loadingSelection
  );

  const saveShiftUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submissionInFlightRef.current) {
      return;
    }

    const editableRecords = shiftRecordOptionsForInstant(new Date(), timezone);
    if (editableRecords[form.shiftType].shiftDate !== form.shiftDate) {
      setError("This shift is no longer editable from the current workspace. Reopen the applicable Day or Night shift.");
      return;
    }

    const normalizedForm = withDefaultProcedureCounts(form);
    setForm(normalizedForm);

    if (!canSave || calculatedRtsNeeded === null) {
      setError("Select lead and enter shift numbers to continue.");
      return;
    }

    const countValidationError = validateShiftStatusCounts(normalizedForm);
    if (countValidationError) {
      setError(countValidationError);
      return;
    }

    submissionInFlightRef.current = true;
    setSaving(true);
    setError("");

    const basePayload = {
      department_id: authContext.departmentId,
      shift_date: normalizedForm.shiftDate,
      shift_type: normalizedForm.shiftType,
      rts_on: shiftStatusNumberValue(normalizedForm.rtsOn),
      rts_required: calculatedRtsNeeded,
      rvu_total: normalizedForm.rvuCount.trim(),
      vent_count: optionalShiftStatusNumberValue(normalizedForm.ventCount),
      bipap_count: shiftStatusNumberValue(normalizedForm.bipapCount),
      c_section_count: shiftStatusNumberValue(normalizedForm.cSectionCount),
      cabg_count: shiftStatusNumberValue(normalizedForm.cabgCount),
      bronch_count: shiftStatusNumberValue(normalizedForm.bronchCount),
      sputum_induction_count: shiftStatusNumberValue(normalizedForm.sputumInductionCount),
      other_procedure_count: shiftStatusNumberValue(normalizedForm.otherProcedureCount),
      other_procedure_note: form.otherProcedureNote.trim() || null,
      shift_note: form.shiftNote.trim() || null,
      updated_by_staff_profile_id: selectedStaff?.id ?? null,
      updated_by_name: updatedByName
    };

    try {
      const supabase = createClient();
      const { error: saveError } = await supabase.rpc("save_shift_status_update", {
        shift_payload: {
          ...basePayload,
          vaginal_delivery_count: shiftStatusNumberValue(normalizedForm.vaginalDeliveryCount)
        }
      });

      if (saveError) {
        submissionInFlightRef.current = false;
        setSaving(false);
        setError("Unable to save shift update.");
        return;
      }

      setCleanFormSignature(formSignature(normalizedForm));
      rememberSessionRvu({
        departmentId: authContext.departmentId,
        shiftDate: form.shiftDate,
        shiftType: form.shiftType,
        rtsNeeded: calculatedRtsNeeded,
        rvuCount: Number(form.rvuCount)
      });
      router.replace("/command-center?shiftUpdate=saved");
      router.refresh();
    } catch (saveException) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Shift update submission failed", saveException);
      }
      submissionInFlightRef.current = false;
      setSaving(false);
      setError("Unable to save shift update.");
    }
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Lead Command Board</p>
          <h1 className="mt-2 text-2xl font-black text-hospital-ink">Shift Update</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Update current shift staffing and equipment numbers.
          </p>
          <Link
            href="/command-center"
            onClick={(event) => {
              if (dirty && !window.confirm("Discard unsaved Shift Update changes and return to the Command Center?")) {
                event.preventDefault();
              }
            }}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
          >
            Back to Command Center
          </Link>
        </section>

        <form onSubmit={saveShiftUpdate} className="space-y-4">
          <section className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Shift</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              Select the clinical shift record to update. Workspace defaults change at 04:00 and 16:00.
            </p>
            <div className={twoColumnGridClass}>
              <label className="block">
                <span className={labelClass}>Date</span>
                <input
                  type="date"
                  value={form.shiftDate}
                  disabled
                  className={`${controlClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600`}
                />
              </label>
              <fieldset disabled={loadingSelection || saving}>
                <legend className={labelClass}>Shift</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(["day", "night"] as const).map((shiftType) => (
                    <button
                      key={shiftType}
                      type="button"
                      aria-pressed={form.shiftType === shiftType}
                      onClick={() => selectShiftType(shiftType)}
                      className={`min-h-11 rounded-2xl border px-2 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 ${
                        form.shiftType === shiftType
                          ? "border-cyan-700 bg-cyan-700 text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {shiftTypeLabel(shiftType)}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            {loadingSelection && <p className="mt-3 text-xs font-bold text-cyan-700">Loading selected shift…</p>}
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Current Counts</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">Staffing and equipment for this shift</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <CountInputCard
                icon={<Users size={18} />}
                label="RTs On Shift"
                value={form.rtsOn}
                helperText={lastKnownHelper(lastKnownUpdate, lastKnownUpdate?.rts_on, timezone)}
                onChange={(value) => setForm((current) => ({ ...current, rtsOn: value }))}
              />
              <CountInputCard
                icon={<User size={18} />}
                label="RTs Needed"
                value={editingRvus
                  ? form.rvuCount
                  : calculatedRtsNeeded?.toFixed(1) ?? ""}
                step="any"
                inputMode="decimal"
                placeholder="Enter RVUs"
                helperText={lastKnownHelper(lastKnownUpdate, lastKnownUpdate?.rts_required, timezone)}
                onBlur={() => setEditingRvus(false)}
                onChange={(value) => setForm((current) => ({ ...current, rvuCount: value }))}
                onFocus={() => setEditingRvus(true)}
              />
              <CountInputCard
                icon={<Wind size={18} />}
                label="Vents"
                value={form.ventCount}
                helperText={lastKnownHelper(lastKnownUpdate, lastKnownUpdate?.vent_count, timezone)}
                onChange={(value) => setForm((current) => ({ ...current, ventCount: value }))}
              />
              <CountInputCard
                icon={<Activity size={18} />}
                label="BiPAPs"
                value={form.bipapCount}
                helperText={lastKnownHelper(lastKnownUpdate, lastKnownUpdate?.bipap_count, timezone)}
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
                helperText={lastKnownHelper(lastKnownUpdate, lastKnownUpdate?.c_section_count, timezone)}
                onChange={(value) => setForm((current) => ({ ...current, cSectionCount: value }))}
              />
              <ProcedureInputTile
                icon={<Baby size={18} />}
                label="Vaginal Deliveries"
                value={form.vaginalDeliveryCount}
                helperText={lastKnownHelper(lastKnownUpdate, lastKnownUpdate?.vaginal_delivery_count, timezone)}
                onChange={(value) => setForm((current) => ({ ...current, vaginalDeliveryCount: value }))}
              />
              <ProcedureInputTile
                icon={<Heart size={18} />}
                label="CABG"
                value={form.cabgCount}
                helperText={lastKnownHelper(lastKnownUpdate, lastKnownUpdate?.cabg_count, timezone)}
                onChange={(value) => setForm((current) => ({ ...current, cabgCount: value }))}
              />
              <ProcedureInputTile
                icon={<Stethoscope size={18} />}
                label="Bronchs"
                value={form.bronchCount}
                helperText={lastKnownHelper(lastKnownUpdate, lastKnownUpdate?.bronch_count, timezone)}
                onChange={(value) => setForm((current) => ({ ...current, bronchCount: value }))}
              />
              <ProcedureInputTile
                icon={<Droplet size={18} />}
                label="Sputum Inductions"
                value={form.sputumInductionCount}
                helperText={lastKnownHelper(lastKnownUpdate, lastKnownUpdate?.sputum_induction_count, timezone)}
                onChange={(value) => setForm((current) => ({ ...current, sputumInductionCount: value }))}
              />
              <ProcedureInputTile
                icon={<Bone size={18} />}
                label="MRI"
                value={form.otherProcedureCount}
                helperText={lastKnownHelper(lastKnownUpdate, lastKnownUpdate?.other_procedure_count, timezone)}
                onChange={(value) => setForm((current) => ({ ...current, otherProcedureCount: value }))}
              />
            </div>
            <label className="mt-3 block">
              <span className={labelClass}>Other Procedures</span>
              <input
                value={form.otherProcedureNote}
                onChange={(event) => setForm((current) => ({ ...current, otherProcedureNote: event.target.value.slice(0, 100) }))}
                maxLength={100}
                placeholder="Enter procedure type"
                className={`${controlClass} placeholder:text-slate-400`}
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
                <option value={notListedLeadValue}>Not Listed</option>
              </select>
            </label>
            {staffOptions.length === 0 && (
              <p className="mt-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                No lead or admin users found. Please update access first.
              </p>
            )}
            {isNotListedLead && (
              <label className="mt-3 block">
                <span className={labelClass}>Enter your name</span>
                <input
                  value={form.updatedByName}
                  onChange={(event) => setForm((current) => ({ ...current, updatedByName: event.target.value.slice(0, 120) }))}
                  required
                  placeholder="Enter your name"
                  className={cyanControlClass}
                />
                {form.updatedByName && !manualUpdatedByName && (
                  <span className="mt-1 block text-xs font-bold text-amber-700">
                    Enter a lead name, not the shared Command Center account.
                  </span>
                )}
              </label>
            )}
            <label className="mt-3 block border-t border-cyan-100 pt-3">
              <span className={labelClass}>Shift Notes</span>
              <textarea
                value={form.shiftNote}
                onChange={(event) => setForm((current) => ({ ...current, shiftNote: event.target.value.slice(0, 500) }))}
                maxLength={500}
                rows={4}
                placeholder="Add an optional note about this shift"
                className="mt-1 w-full resize-y rounded-2xl border border-cyan-200 bg-white px-3 py-3 text-sm font-bold leading-5 text-hospital-ink outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
              <span className="mt-1 block text-xs font-bold text-slate-500">No patient information.</span>
            </label>
          </section>

          {error && <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
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
