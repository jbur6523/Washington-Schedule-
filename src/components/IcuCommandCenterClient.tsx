"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Bed, ClipboardList, History, LogOut, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { signOutAndRedirect } from "@/lib/auth/client-session";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type {
  IcuDeviceType,
  IcuPatientEventRecord,
  IcuPatientRecord,
  IcuVentMode,
  VentilatorOutcome
} from "@/lib/icu-command-center/types";
import {
  airwayLocationOptions,
  airwaySizeOptions,
  formatIcuAirway,
  formatIcuDeviceSummary,
  formatIcuLastUpdated,
  formatIcuSettings,
  getIcuSnapshotCounts,
  icuAirwayLocationLabels,
  icuBedOptions,
  icuDeviceLabels,
  icuVentModeLabels,
  ventilatorOutcomeLabels,
  ventilatorOutcomeOptions,
  ventModeOptions
} from "@/lib/icu-command-center/utils";
import { createClient } from "@/lib/supabase/client";

type IcuCommandCenterClientProps = {
  authContext: AuthenticatedUserContext;
};

type IcuPatientForm = {
  bed: string;
  device_type: IcuDeviceType | "";
  airway_size: string;
  airway_at: string;
  airway_location: string;
  vent_mode: IcuVentMode | "";
  rate: string;
  tidal_volume: string;
  peep: string;
  fio2: string;
  ps: string;
  t_high: string;
  t_low: string;
  p_high: string;
  p_low: string;
  percent_min_vol: string;
  ipap: string;
  epap: string;
  cpap: string;
  flow: string;
  is_critical_vent: boolean;
};

const emptyForm: IcuPatientForm = {
  bed: "",
  device_type: "",
  airway_size: "",
  airway_at: "",
  airway_location: "",
  vent_mode: "",
  rate: "",
  tidal_volume: "",
  peep: "",
  fio2: "",
  ps: "",
  t_high: "",
  t_low: "",
  p_high: "",
  p_low: "",
  percent_min_vol: "",
  ipap: "",
  epap: "",
  cpap: "",
  flow: "",
  is_critical_vent: false
};

const icuPatientSelect = [
  "id",
  "department_id",
  "bed",
  "device_type",
  "airway_size",
  "airway_at",
  "airway_location",
  "vent_mode",
  "rate",
  "tidal_volume",
  "peep",
  "fio2",
  "ps",
  "t_high",
  "t_low",
  "p_high",
  "p_low",
  "percent_min_vol",
  "ipap",
  "epap",
  "cpap",
  "flow",
  "is_critical_vent",
  "ventilator_outcome",
  "discontinued_at",
  "discontinued_by_staff_profile_id",
  "is_active",
  "created_by_staff_profile_id",
  "updated_by_staff_profile_id",
  "created_at",
  "updated_at"
].join(", ");

const icuPatientEventSelect = [
  "id",
  "department_id",
  "icu_patient_id",
  "event_type",
  "event_time",
  "event_summary",
  "event_data",
  "created_by_staff_profile_id",
  "created_by_name",
  "created_at"
].join(", ");

const icuTimezone = "America/Los_Angeles";

function numericOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function formFromRecord(record: IcuPatientRecord): IcuPatientForm {
  return {
    bed: record.bed,
    device_type: record.device_type,
    airway_size: record.airway_size ?? "",
    airway_at: record.airway_at ?? "",
    airway_location: record.airway_location ?? "",
    vent_mode: record.vent_mode ?? "",
    rate: record.rate?.toString() ?? "",
    tidal_volume: record.tidal_volume?.toString() ?? "",
    peep: record.peep?.toString() ?? "",
    fio2: record.fio2?.toString() ?? "",
    ps: record.ps?.toString() ?? "",
    t_high: record.t_high?.toString() ?? "",
    t_low: record.t_low?.toString() ?? "",
    p_high: record.p_high?.toString() ?? "",
    p_low: record.p_low?.toString() ?? "",
    percent_min_vol: record.percent_min_vol?.toString() ?? "",
    ipap: record.ipap?.toString() ?? "",
    epap: record.epap?.toString() ?? "",
    cpap: record.cpap?.toString() ?? "",
    flow: record.flow?.toString() ?? "",
    is_critical_vent: record.is_critical_vent
  };
}

function cleanPayload(form: IcuPatientForm, authContext: AuthenticatedUserContext) {
  const deviceType = form.device_type;

  return {
    department_id: authContext.departmentId,
    bed: form.bed,
    device_type: deviceType,
    airway_size: deviceType === "vent" ? form.airway_size || null : null,
    airway_at: deviceType === "vent" ? form.airway_at.trim() || null : null,
    airway_location: deviceType === "vent" ? form.airway_location || null : null,
    vent_mode: deviceType === "vent" ? form.vent_mode || null : null,
    rate: deviceType === "vent" || deviceType === "bipap" ? numericOrNull(form.rate) : null,
    tidal_volume: deviceType === "vent" ? numericOrNull(form.tidal_volume) : null,
    peep: deviceType === "vent" ? numericOrNull(form.peep) : null,
    fio2: deviceType === "vent" || deviceType === "bipap" || deviceType === "hfnc" ? numericOrNull(form.fio2) : null,
    ps: deviceType === "vent" ? numericOrNull(form.ps) : null,
    t_high: deviceType === "vent" ? numericOrNull(form.t_high) : null,
    t_low: deviceType === "vent" ? numericOrNull(form.t_low) : null,
    p_high: deviceType === "vent" ? numericOrNull(form.p_high) : null,
    p_low: deviceType === "vent" ? numericOrNull(form.p_low) : null,
    percent_min_vol: deviceType === "vent" ? numericOrNull(form.percent_min_vol) : null,
    ipap: deviceType === "bipap" ? numericOrNull(form.ipap) : null,
    epap: deviceType === "bipap" ? numericOrNull(form.epap) : null,
    cpap: deviceType === "cpap" ? numericOrNull(form.cpap) : null,
    flow: deviceType === "hfnc" ? numericOrNull(form.flow) : null,
    is_critical_vent: deviceType === "vent" ? form.is_critical_vent : false,
    ventilator_outcome: null,
    updated_by_staff_profile_id: authContext.staffProfileId
  };
}

function eventDataFromRecord(record: IcuPatientRecord, extra: Record<string, unknown> = {}) {
  return {
    bed: record.bed,
    device: formatIcuDeviceSummary(record),
    airway: formatIcuAirway(record) || null,
    settings: formatIcuSettings(record),
    criticalVent: record.is_critical_vent,
    ...extra
  };
}

function timeZoneParts(date: Date, timeZone = icuTimezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second"))
  };
}

function timezoneOffsetMs(date: Date, timeZone = icuTimezone) {
  const parts = timeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function wallTimeToIso(dateValue: string, timeValue: string, timeZone = icuTimezone) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);

  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    return "";
  }

  const initial = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const firstPass = new Date(initial.getTime() - timezoneOffsetMs(initial, timeZone));
  const secondPass = new Date(initial.getTime() - timezoneOffsetMs(firstPass, timeZone));

  return secondPass.toISOString();
}

function defaultIcuDateTime() {
  const parts = timeZoneParts(new Date(), icuTimezone);

  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
  };
}

function formatIcuActivityTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: icuTimezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).format(new Date(value));
}

function formatIcuActivityDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: icuTimezone,
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function todayIcuDateRange() {
  const { date } = defaultIcuDateTime();

  return {
    startIso: wallTimeToIso(date, "00:00"),
    endIso: wallTimeToIso(date, "23:59"),
    label: formatIcuActivityDate(wallTimeToIso(date, "12:00"))
  };
}

async function createIcuPatientEvent(
  supabase: ReturnType<typeof createClient>,
  authContext: AuthenticatedUserContext,
  record: IcuPatientRecord,
  eventType: IcuPatientEventRecord["event_type"],
  eventSummary: string,
  eventData: Record<string, unknown> = {},
  eventTime?: string
) {
  return supabase.from("icu_patient_events").insert({
    department_id: authContext.departmentId,
    icu_patient_id: record.id,
    event_type: eventType,
    event_time: eventTime ?? new Date().toISOString(),
    event_summary: eventSummary,
    event_data: eventDataFromRecord(record, eventData),
    created_by_staff_profile_id: authContext.staffProfileId,
    created_by_name: authContext.displayName
  });
}

function historyEventLabel(eventType: IcuPatientEventRecord["event_type"]) {
  switch (eventType) {
    case "added":
      return "Added";
    case "updated":
      return "Updated settings";
    case "critical_status_updated":
      return "Critical status updated";
    case "discontinued":
      return "Discontinued";
    default:
      return "ICU update";
  }
}

function eventDataText(event: IcuPatientEventRecord, key: string) {
  const value = event.event_data?.[key];
  return typeof value === "string" && value.trim() ? value : "";
}

function eventDataBoolean(event: IcuPatientEventRecord, key: string) {
  const value = event.event_data?.[key];
  return typeof value === "boolean" ? value : null;
}

function historyDetailLines(event: IcuPatientEventRecord) {
  const lines: string[] = [];
  const device = eventDataText(event, "device");
  const airway = eventDataText(event, "airway");
  const settings = eventDataText(event, "settings");
  const outcome = eventDataText(event, "ventilatorOutcome");
  const criticalVent = eventDataBoolean(event, "criticalVent");

  if (device) {
    lines.push(`Device: ${device}`);
  }
  if (airway) {
    lines.push(`Airway: ${airway}`);
  }
  if (settings) {
    lines.push(`Settings: ${settings}`);
  }
  if (criticalVent !== null) {
    lines.push(`Critical Vent: ${criticalVent ? "Yes" : "No"}`);
  }
  if (outcome) {
    lines.push(`Outcome: ${outcome}`);
  }

  return lines;
}

function parsePreviousDateInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 6) {
    return null;
  }

  const month = Number(digits.slice(0, 2));
  const day = Number(digits.slice(2, 4));
  const year = 2000 + Number(digits.slice(4, 6));
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  const dateValue = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(date);

  return {
    startIso: wallTimeToIso(dateValue, "00:00"),
    endIso: wallTimeToIso(dateValue, "23:59"),
    label
  };
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/80 px-3 py-3 text-center shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-cyan-700">{label}</p>
      <p className="mt-1 text-3xl font-black leading-none text-hospital-ink">{value}</p>
    </div>
  );
}

function IcuNumberInput({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
      />
    </label>
  );
}

function IcuPatientCard({
  record,
  onUpdate,
  onDiscontinue,
  onHistory,
  onToggleCritical
}: {
  record: IcuPatientRecord;
  onUpdate: () => void;
  onDiscontinue: () => void;
  onHistory: () => void;
  onToggleCritical: () => void;
}) {
  const airway = formatIcuAirway(record);

  return (
    <article className="rounded-3xl border border-white bg-white/95 p-4 text-left shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">{record.bed}</p>
          <h3 className="mt-1 text-xl font-black text-hospital-ink">{formatIcuDeviceSummary(record)}</h3>
          {airway && <p className="mt-1 text-sm font-black text-slate-700">{airway}</p>}
          <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{formatIcuSettings(record)}</p>
          <p className="mt-2 text-xs font-bold text-slate-400">Updated {formatIcuLastUpdated(record.updated_at)}</p>
        </div>
        {record.device_type === "vent" && (
          <button
            type="button"
            onClick={onToggleCritical}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${
              record.is_critical_vent
                ? "border-rose-100 bg-rose-50 text-rose-700"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <AlertTriangle size={13} />
            {record.is_critical_vent ? "Critical" : "Not Critical"}
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onUpdate}
          className="min-h-11 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20"
        >
          Update
        </button>
        <button
          type="button"
          onClick={onHistory}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
        >
          <History size={16} />
          History
        </button>
        <button
          type="button"
          onClick={onDiscontinue}
          className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 text-sm font-black text-rose-700"
        >
          <Trash2 size={16} />
          Discontinue
        </button>
      </div>
    </article>
  );
}

function IcuActivityCard({ eventRecord }: { eventRecord: IcuPatientEventRecord }) {
  const bed = eventDataText(eventRecord, "bed") || "ICU";
  const device = eventDataText(eventRecord, "device") || "Device";
  const settings = eventDataText(eventRecord, "settings");
  const outcome = eventDataText(eventRecord, "ventilatorOutcome");
  const action = historyEventLabel(eventRecord.event_type);

  return (
    <article className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
          <ClipboardList size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black leading-5 text-hospital-ink">
            {formatIcuActivityTime(eventRecord.event_time)} - {bed} {device} {action.toLowerCase()} by{" "}
            {eventRecord.created_by_name || "Unknown"}
          </p>
          {eventRecord.event_summary && (
            <p className="mt-1 text-sm font-bold leading-6 text-slate-700">{eventRecord.event_summary}</p>
          )}
          {outcome && <p className="mt-1 text-xs font-black leading-5 text-rose-700">Outcome: {outcome}</p>}
          {settings && <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{settings}</p>}
        </div>
      </div>
    </article>
  );
}

export function IcuCommandCenterClient({ authContext }: IcuCommandCenterClientProps) {
  const [records, setRecords] = useState<IcuPatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<IcuPatientRecord | null>(null);
  const [form, setForm] = useState<IcuPatientForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [discontinueTarget, setDiscontinueTarget] = useState<IcuPatientRecord | null>(null);
  const [discontinueError, setDiscontinueError] = useState("");
  const [ventilatorOutcome, setVentilatorOutcome] = useState<VentilatorOutcome | "">("");
  const [discontinuedDate, setDiscontinuedDate] = useState("");
  const [discontinuedTime, setDiscontinuedTime] = useState("");
  const [historyTarget, setHistoryTarget] = useState<IcuPatientRecord | null>(null);
  const [historyEvents, setHistoryEvents] = useState<IcuPatientEventRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [previousDateOpen, setPreviousDateOpen] = useState(false);
  const [previousDateInput, setPreviousDateInput] = useState("");
  const [previousDateLabel, setPreviousDateLabel] = useState("");
  const [previousDateResults, setPreviousDateResults] = useState<IcuPatientEventRecord[]>([]);
  const [previousDateLoading, setPreviousDateLoading] = useState(false);
  const [previousDateError, setPreviousDateError] = useState("");
  const [todayActivity, setTodayActivity] = useState<IcuPatientEventRecord[]>([]);
  const [todayActivityLoading, setTodayActivityLoading] = useState(true);
  const [todayActivityError, setTodayActivityError] = useState("");

  const counts = useMemo(() => getIcuSnapshotCounts(records), [records]);

  const signOut = async () => {
    await signOutAndRedirect();
  };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("icu_patients")
      .select(icuPatientSelect)
      .eq("department_id", authContext.departmentId)
      .eq("is_active", true)
      .order("bed", { ascending: true });

    setLoading(false);

    if (loadError) {
      setRecords([]);
      setError("Could not load ICU Command Center.");
      return;
    }

    setRecords((data ?? []) as unknown as IcuPatientRecord[]);
  }, [authContext.departmentId]);

  const loadTodayActivity = useCallback(async () => {
    setTodayActivityLoading(true);
    setTodayActivityError("");
    const range = todayIcuDateRange();

    const supabase = createClient();
    const { data, error: activityLoadError } = await supabase
      .from("icu_patient_events")
      .select(icuPatientEventSelect)
      .eq("department_id", authContext.departmentId)
      .gte("event_time", range.startIso)
      .lte("event_time", range.endIso)
      .in("event_type", ["added", "updated", "critical_status_updated", "discontinued"])
      .order("event_time", { ascending: false });

    setTodayActivityLoading(false);

    if (activityLoadError) {
      setTodayActivity([]);
      setTodayActivityError("Could not load today's ICU activity.");
      return;
    }

    setTodayActivity((data ?? []) as unknown as IcuPatientEventRecord[]);
  }, [authContext.departmentId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadRecords();
      void loadTodayActivity();
    });
  }, [loadRecords, loadTodayActivity]);

  const openAdd = () => {
    setEditingRecord(null);
    setForm(emptyForm);
    setFormOpen(true);
    setMessage("");
    setError("");
    setFormError("");
  };

  const openEdit = (record: IcuPatientRecord) => {
    setEditingRecord(record);
    setForm(formFromRecord(record));
    setFormOpen(true);
    setMessage("");
    setError("");
    setFormError("");
  };

  const savePatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setFormError("");

    if (!form.bed || !form.device_type) {
      setFormError("Bed and device are required.");
      return;
    }

    if (form.device_type === "vent" && !form.vent_mode) {
      setFormError("Vent Mode is required for Vent patients.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = cleanPayload(form, authContext);
    const result = editingRecord
      ? await supabase
          .from("icu_patients")
          .update(payload)
          .eq("id", editingRecord.id)
          .eq("department_id", authContext.departmentId)
          .select(icuPatientSelect)
          .maybeSingle()
      : await supabase.from("icu_patients").insert({
          ...payload,
          created_by_staff_profile_id: authContext.staffProfileId
        })
          .select(icuPatientSelect)
          .maybeSingle();

    setSaving(false);

    if (result.error) {
      setFormError(
        result.error.code === "23505"
          ? "That ICU bed already has an active record."
          : "Could not save ICU patient. Please try again."
      );
      return;
    }

    const savedRecord = result.data as unknown as IcuPatientRecord | null;
    if (savedRecord) {
      const eventResult = await createIcuPatientEvent(
        supabase,
        authContext,
        savedRecord,
        editingRecord ? "updated" : "added",
        editingRecord ? "ICU device settings updated." : "ICU device added.",
        {
          action: editingRecord ? "updated" : "added"
        }
      );

      if (eventResult.error) {
        setMessage("ICU patient saved, but history could not be recorded.");
      } else {
        setMessage(editingRecord ? "ICU patient updated." : "ICU patient added.");
      }
    } else {
      setMessage(editingRecord ? "ICU patient updated." : "ICU patient added.");
    }

    setFormOpen(false);
    setEditingRecord(null);
    setForm(emptyForm);
    await loadRecords();
    await loadTodayActivity();
  };

  const openDiscontinue = (record: IcuPatientRecord) => {
    const defaults = defaultIcuDateTime();
    setDiscontinueTarget(record);
    setVentilatorOutcome("");
    setDiscontinuedDate(defaults.date);
    setDiscontinuedTime(defaults.time);
    setDiscontinueError("");
    setMessage("");
    setError("");
  };

  const confirmDiscontinue = async () => {
    if (!discontinueTarget) {
      return;
    }

    if (discontinueTarget.device_type === "vent" && !ventilatorOutcome) {
      setDiscontinueError("Select a ventilator outcome before discontinuing this ventilator.");
      return;
    }

    if (!discontinuedDate || !discontinuedTime) {
      setDiscontinueError("Discontinued Date and Discontinued Time are required.");
      return;
    }

    const discontinuedAt = wallTimeToIso(discontinuedDate, discontinuedTime);
    if (!discontinuedAt) {
      setDiscontinueError("Enter a valid discontinued date and time.");
      return;
    }

    setActionSaving(true);
    setMessage("");
    setError("");
    setDiscontinueError("");
    const supabase = createClient();
    const outcome: VentilatorOutcome | null =
      discontinueTarget.device_type === "vent" ? (ventilatorOutcome as VentilatorOutcome) : null;
    const { data, error: discontinueUpdateError } = await supabase
      .from("icu_patients")
      .update({
        is_active: false,
        discontinued_at: discontinuedAt,
        discontinued_by_staff_profile_id: authContext.staffProfileId,
        ventilator_outcome: outcome,
        updated_by_staff_profile_id: authContext.staffProfileId
      })
      .eq("id", discontinueTarget.id)
      .eq("department_id", authContext.departmentId)
      .select(icuPatientSelect)
      .maybeSingle();

    setActionSaving(false);

    if (discontinueUpdateError) {
      setDiscontinueError("Could not discontinue ICU device. Please try again.");
      return;
    }

    const discontinuedRecord = (data as unknown as IcuPatientRecord | null) ?? {
      ...discontinueTarget,
      is_active: false,
      discontinued_at: discontinuedAt,
      discontinued_by_staff_profile_id: authContext.staffProfileId,
      ventilator_outcome: outcome
    };
    const eventResult = await createIcuPatientEvent(
      supabase,
      authContext,
      discontinuedRecord,
      "discontinued",
      outcome ? `Discontinued. Outcome: ${ventilatorOutcomeLabels[outcome]}.` : "Device discontinued.",
      {
        ventilatorOutcome: outcome ? ventilatorOutcomeLabels[outcome] : null,
        discontinuedAt
      },
      discontinuedAt
    );

    setDiscontinueTarget(null);
    setVentilatorOutcome("");
    setDiscontinuedDate("");
    setDiscontinuedTime("");
    setMessage(
      eventResult.error
        ? `${discontinuedRecord.bed} discontinued, but history could not be recorded.`
        : "Device discontinued."
    );
    await loadRecords();
    await loadTodayActivity();
  };

  const toggleCriticalStatus = async (record: IcuPatientRecord) => {
    if (record.device_type !== "vent") {
      return;
    }

    setActionSaving(true);
    setMessage("");
    setError("");
    const nextCritical = !record.is_critical_vent;
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("icu_patients")
      .update({
        is_critical_vent: nextCritical,
        updated_by_staff_profile_id: authContext.staffProfileId
      })
      .eq("id", record.id)
      .eq("department_id", authContext.departmentId)
      .select(icuPatientSelect)
      .maybeSingle();

    setActionSaving(false);

    if (updateError) {
      setError("Could not update critical status. Please try again.");
      return;
    }

    const updatedRecord = (data as unknown as IcuPatientRecord | null) ?? {
      ...record,
      is_critical_vent: nextCritical
    };
    const eventResult = await createIcuPatientEvent(
      supabase,
      authContext,
      updatedRecord,
      "critical_status_updated",
      `Critical Vent: ${nextCritical ? "Yes" : "No"}.`,
      {
        criticalVent: nextCritical
      }
    );

    setMessage(eventResult.error ? "Critical status updated, but history could not be recorded." : "Critical status updated.");
    await loadRecords();
    await loadTodayActivity();
  };

  const openHistory = async (record: IcuPatientRecord) => {
    setHistoryTarget(record);
    setHistoryEvents([]);
    setHistoryError("");
    setHistoryLoading(true);

    const supabase = createClient();
    const { data, error: historyLoadError } = await supabase
      .from("icu_patient_events")
      .select(icuPatientEventSelect)
      .eq("department_id", authContext.departmentId)
      .eq("icu_patient_id", record.id)
      .order("event_time", { ascending: false });

    setHistoryLoading(false);

    if (historyLoadError) {
      setHistoryEvents([]);
      setHistoryError("Could not load ICU history.");
      return;
    }

    setHistoryEvents((data ?? []) as unknown as IcuPatientEventRecord[]);
  };

  const searchPreviousDate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parsePreviousDateInput(previousDateInput);
    setPreviousDateError("");
    setPreviousDateResults([]);
    setPreviousDateLabel("");

    if (!parsed) {
      setPreviousDateError("Enter date as MMDDYY.");
      return;
    }

    setPreviousDateLoading(true);
    const supabase = createClient();
    const { data, error: searchError } = await supabase
      .from("icu_patient_events")
      .select(icuPatientEventSelect)
      .eq("department_id", authContext.departmentId)
      .gte("event_time", parsed.startIso)
      .lte("event_time", parsed.endIso)
      .in("event_type", ["added", "updated", "critical_status_updated", "discontinued"])
      .order("event_time", { ascending: false });

    setPreviousDateLoading(false);

    if (searchError) {
      setPreviousDateError("Could not search ICU history. Please try again.");
      return;
    }

    setPreviousDateLabel(parsed.label);
    setPreviousDateResults((data ?? []) as unknown as IcuPatientEventRecord[]);
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
          <h1 className="mt-2 text-3xl font-black text-hospital-ink">ICU Command Center</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Track ICU respiratory devices and settings.</p>
          <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">
            Use bed/room only. Do not enter patient names, MRNs, DOBs, diagnoses, or clinical notes.
          </p>
        </section>

        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">ICU Snapshot</p>
              <h2 className="mt-1 text-xl font-black text-hospital-ink">Active Devices</h2>
            </div>
            <button
              type="button"
              onClick={() => void loadRecords()}
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <StatCard label="Vents" value={counts.vents} />
            <StatCard label="HFNC" value={counts.hfnc} />
            <StatCard label="BiPAP" value={counts.bipap} />
            <StatCard label="Critical Vents" value={counts.criticalVents} />
          </div>
        </section>

        <button
          type="button"
          onClick={openAdd}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-base font-black text-white shadow-md shadow-cyan-900/20"
        >
          <Plus size={18} />
          Add Patient
        </button>

        {message && (
          <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Bed size={18} className="text-cyan-700" />
            <h2 className="text-2xl font-black text-hospital-ink">Active ICU Patients</h2>
          </div>
          {loading && (
            <p className="rounded-3xl border border-slate-100 bg-white/95 px-4 py-5 text-center text-sm font-bold text-slate-500 shadow-soft">
              Loading ICU patients...
            </p>
          )}
          {!loading && records.length === 0 && (
            <p className="rounded-3xl border border-slate-100 bg-white/95 px-4 py-5 text-center text-sm font-bold text-slate-500 shadow-soft">
              No active ICU respiratory devices.
            </p>
          )}
          {!loading &&
            records.map((record) => (
              <IcuPatientCard
                key={record.id}
                record={record}
                onUpdate={() => openEdit(record)}
                onDiscontinue={() => openDiscontinue(record)}
                onHistory={() => void openHistory(record)}
                onToggleCritical={() => void toggleCriticalStatus(record)}
              />
            ))}
        </section>

        <button
          type="button"
          onClick={() => {
            setPreviousDateOpen(true);
            setPreviousDateError("");
          }}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-700 bg-white px-4 text-sm font-black text-cyan-700 shadow-sm"
        >
          <Search size={16} />
          Search Previous Date
        </button>

        <section className="space-y-3 rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-hospital-ink">Today&apos;s ICU Activity</h2>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">Updates and discontinued devices for today.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadTodayActivity()}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>

          {todayActivityLoading && (
            <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
              Loading ICU activity...
            </p>
          )}
          {todayActivityError && (
            <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
              {todayActivityError}
            </p>
          )}
          {!todayActivityLoading && !todayActivityError && todayActivity.length === 0 && (
            <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
              No ICU updates or discontinued devices recorded today.
            </p>
          )}
          {!todayActivityLoading &&
            !todayActivityError &&
            todayActivity.map((eventRecord) => <IcuActivityCard key={eventRecord.id} eventRecord={eventRecord} />)}
        </section>

        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="icu-form-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white bg-white p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">ICU Command Center</p>
                <h2 id="icu-form-title" className="mt-1 text-2xl font-black text-hospital-ink">
                  {editingRecord ? "Update Patient" : "Add Patient"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormError("");
                  setFormOpen(false);
                }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
              >
                Close
              </button>
            </div>

            {formError && (
              <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
                {formError}
              </p>
            )}

            <form onSubmit={savePatient} className="mt-4 space-y-4">
              <div className="grid gap-3">
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Bed</span>
                  <select
                    value={form.bed}
                    onChange={(event) => setForm({ ...form, bed: event.target.value })}
                    required
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  >
                    <option value="">Select bed</option>
                    {icuBedOptions.map((bedOption) => (
                      <option key={bedOption} value={bedOption}>
                        {bedOption}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Device</span>
                  <select
                    value={form.device_type}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        device_type: event.target.value as IcuDeviceType | "",
                        is_critical_vent: event.target.value === "vent" ? form.is_critical_vent : false
                      })
                    }
                    required
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  >
                    <option value="">Select device</option>
                    {(["vent", "bipap", "cpap", "hfnc"] as IcuDeviceType[]).map((device) => (
                      <option key={device} value={device}>
                        {icuDeviceLabels[device]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {form.device_type === "vent" && (
                <>
                  <section className="rounded-3xl border border-cyan-100 bg-cyan-50/60 p-3">
                    <h3 className="text-sm font-black text-hospital-ink">Airway</h3>
                    <div className="mt-3 grid gap-3">
                      <label className="block">
                        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Airway size</span>
                        <select
                          value={form.airway_size}
                          onChange={(event) => setForm({ ...form, airway_size: event.target.value })}
                          className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                        >
                          <option value="">Select size</option>
                          {airwaySizeOptions.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </label>
                      <IcuNumberInput
                        label="At"
                        value={form.airway_at}
                        onChange={(value) => setForm({ ...form, airway_at: value })}
                        placeholder="Example: 23"
                      />
                      <label className="block">
                        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Location</span>
                        <select
                          value={form.airway_location}
                          onChange={(event) => setForm({ ...form, airway_location: event.target.value })}
                          className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                        >
                          <option value="">Select location</option>
                          {airwayLocationOptions.map((location) => (
                            <option key={location} value={location}>
                              {icuAirwayLocationLabels[location]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-3">
                    <h3 className="text-sm font-black text-hospital-ink">Vent Settings</h3>
                    <label className="mt-3 block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Vent Mode</span>
                      <select
                        value={form.vent_mode}
                        onChange={(event) => setForm({ ...form, vent_mode: event.target.value as IcuVentMode | "" })}
                        required
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                      >
                        <option value="">Select mode</option>
                        {ventModeOptions.map((mode) => (
                          <option key={mode} value={mode}>
                            {icuVentModeLabels[mode]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {["apvcmv", "scmv", "pcmv"].includes(form.vent_mode) && (
                        <>
                          <IcuNumberInput label="Rate" value={form.rate} onChange={(value) => setForm({ ...form, rate: value })} />
                          <IcuNumberInput label="Tidal Volume" value={form.tidal_volume} onChange={(value) => setForm({ ...form, tidal_volume: value })} />
                          <IcuNumberInput label="PEEP" value={form.peep} onChange={(value) => setForm({ ...form, peep: value })} />
                          <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                        </>
                      )}
                      {form.vent_mode === "spont" && (
                        <>
                          <IcuNumberInput label="PS" value={form.ps} onChange={(value) => setForm({ ...form, ps: value })} />
                          <IcuNumberInput label="PEEP" value={form.peep} onChange={(value) => setForm({ ...form, peep: value })} />
                          <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                        </>
                      )}
                      {form.vent_mode === "aprv" && (
                        <>
                          <IcuNumberInput label="Rate" value={form.rate} onChange={(value) => setForm({ ...form, rate: value })} />
                          <IcuNumberInput label="T-High" value={form.t_high} onChange={(value) => setForm({ ...form, t_high: value })} />
                          <IcuNumberInput label="T-Low" value={form.t_low} onChange={(value) => setForm({ ...form, t_low: value })} />
                          <IcuNumberInput label="P-High" value={form.p_high} onChange={(value) => setForm({ ...form, p_high: value })} />
                          <IcuNumberInput label="P-Low" value={form.p_low} onChange={(value) => setForm({ ...form, p_low: value })} />
                          <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                        </>
                      )}
                      {form.vent_mode === "asv" && (
                        <>
                          <IcuNumberInput label="% Min Vol" value={form.percent_min_vol} onChange={(value) => setForm({ ...form, percent_min_vol: value })} />
                          <IcuNumberInput label="PEEP" value={form.peep} onChange={(value) => setForm({ ...form, peep: value })} />
                          <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                        </>
                      )}
                    </div>
                    <label className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-100 bg-white px-3 py-3 text-sm font-black text-hospital-ink">
                      <input
                        type="checkbox"
                        checked={form.is_critical_vent}
                        onChange={(event) => setForm({ ...form, is_critical_vent: event.target.checked })}
                        className="h-5 w-5 accent-rose-600"
                      />
                      Critical Vent
                    </label>
                  </section>
                </>
              )}

              {form.device_type === "bipap" && (
                <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-3">
                  <h3 className="text-sm font-black text-hospital-ink">BiPAP Settings</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <IcuNumberInput label="Rate" value={form.rate} onChange={(value) => setForm({ ...form, rate: value })} />
                    <IcuNumberInput label="IPAP" value={form.ipap} onChange={(value) => setForm({ ...form, ipap: value })} />
                    <IcuNumberInput label="EPAP" value={form.epap} onChange={(value) => setForm({ ...form, epap: value })} />
                    <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                  </div>
                </section>
              )}

              {form.device_type === "cpap" && (
                <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-3">
                  <h3 className="text-sm font-black text-hospital-ink">CPAP Settings</h3>
                  <div className="mt-3">
                    <IcuNumberInput label="CPAP" value={form.cpap} onChange={(value) => setForm({ ...form, cpap: value })} />
                  </div>
                </section>
              )}

              {form.device_type === "hfnc" && (
                <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-3">
                  <h3 className="text-sm font-black text-hospital-ink">HFNC Settings</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                    <IcuNumberInput label="Flow" value={form.flow} onChange={(value) => setForm({ ...form, flow: value })} />
                  </div>
                </section>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormError("");
                    setFormOpen(false);
                  }}
                  className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} />
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {discontinueTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="icu-discontinue-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white bg-white p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">ICU Command Center</p>
                <h2 id="icu-discontinue-title" className="mt-1 text-2xl font-black text-hospital-ink">
                  {discontinueTarget.device_type === "vent" ? "Ventilator Outcome" : "Discontinue Device?"}
                </h2>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                  {discontinueTarget.device_type === "vent"
                    ? "Select the outcome before discontinuing this ventilator."
                    : "This will remove this device from the active ICU list."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDiscontinueTarget(null);
                  setDiscontinueError("");
                  setDiscontinuedDate("");
                  setDiscontinuedTime("");
                }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
              >
                <X size={16} />
                Close
              </button>
            </div>

            {discontinueError && (
              <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
                {discontinueError}
              </p>
            )}

            <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">{discontinueTarget.bed}</p>
              <h3 className="mt-1 text-xl font-black text-hospital-ink">{formatIcuDeviceSummary(discontinueTarget)}</h3>
              {formatIcuAirway(discontinueTarget) && (
                <p className="mt-1 text-sm font-black text-slate-700">{formatIcuAirway(discontinueTarget)}</p>
              )}
              <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{formatIcuSettings(discontinueTarget)}</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Discontinued Date</span>
                <input
                  type="date"
                  value={discontinuedDate}
                  onChange={(event) => {
                    setDiscontinuedDate(event.target.value);
                    setDiscontinueError("");
                  }}
                  required
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Discontinued Time</span>
                <input
                  type="time"
                  value={discontinuedTime}
                  onChange={(event) => {
                    setDiscontinuedTime(event.target.value);
                    setDiscontinueError("");
                  }}
                  required
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
            </div>

            {discontinueTarget.device_type === "vent" && (
              <div className="mt-4 space-y-2">
                {ventilatorOutcomeOptions.map((outcome) => (
                  <label
                    key={outcome}
                    className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-hospital-ink"
                  >
                    <input
                      type="radio"
                      name="ventilator-outcome"
                      value={outcome}
                      checked={ventilatorOutcome === outcome}
                      onChange={() => {
                        setVentilatorOutcome(outcome);
                        setDiscontinueError("");
                      }}
                      className="h-5 w-5 accent-cyan-700"
                    />
                    {ventilatorOutcomeLabels[outcome]}
                  </label>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDiscontinueTarget(null);
                  setDiscontinueError("");
                  setDiscontinuedDate("");
                  setDiscontinuedTime("");
                }}
                className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionSaving}
                onClick={() => void confirmDiscontinue()}
                className="min-h-12 rounded-2xl bg-rose-600 px-4 text-sm font-black text-white shadow-md shadow-rose-900/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionSaving ? "Discontinuing..." : discontinueTarget.device_type === "vent" ? "Discontinue Vent" : "Discontinue"}
              </button>
            </div>
          </section>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="icu-history-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white bg-slate-50 p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">{historyTarget.bed}</p>
                <h2 id="icu-history-title" className="mt-1 text-2xl font-black text-hospital-ink">
                  ICU History
                </h2>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">{formatIcuDeviceSummary(historyTarget)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistoryTarget(null);
                  setHistoryError("");
                }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
              >
                <X size={16} />
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {historyLoading && (
                <p className="rounded-2xl bg-white px-3 py-4 text-sm font-bold text-slate-500">Loading ICU history...</p>
              )}
              {historyError && (
                <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
                  {historyError}
                </p>
              )}
              {!historyLoading && !historyError && historyEvents.length === 0 && (
                <p className="rounded-2xl bg-white px-3 py-4 text-center text-sm font-bold text-slate-500">
                  No history events recorded yet.
                </p>
              )}
              {!historyLoading &&
                historyEvents.map((eventRecord) => (
                  <article key={eventRecord.id} className="rounded-3xl border border-white bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                        <ClipboardList size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-hospital-ink">
                          {formatIcuLastUpdated(eventRecord.event_time)} - {historyEventLabel(eventRecord.event_type)}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          By {eventRecord.created_by_name || "Unknown"}
                        </p>
                        {eventRecord.event_summary && (
                          <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{eventRecord.event_summary}</p>
                        )}
                        {historyDetailLines(eventRecord).map((line) => (
                          <p key={line} className="mt-1 text-xs font-bold leading-5 text-slate-500">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
            </div>
          </section>
        </div>
      )}

      {previousDateOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="icu-date-search-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white bg-slate-50 p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Search Previous Date</p>
                <h2 id="icu-date-search-title" className="mt-1 text-2xl font-black text-hospital-ink">
                  ICU Activity
                </h2>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Enter a date as MMDDYY.</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviousDateOpen(false)}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
              >
                <X size={16} />
                Close
              </button>
            </div>

            <form onSubmit={searchPreviousDate} className="mt-4 grid gap-2">
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Date</span>
                <input
                  value={previousDateInput}
                  onChange={(event) => setPreviousDateInput(event.target.value)}
                  inputMode="numeric"
                  placeholder="070626"
                  className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-base font-black text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
              <button
                type="submit"
                disabled={previousDateLoading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search size={16} />
                {previousDateLoading ? "Searching..." : "Search"}
              </button>
            </form>

            {previousDateError && (
              <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
                {previousDateError}
              </p>
            )}

            <div className="mt-4 space-y-3">
              {previousDateLabel && (
                <p className="text-sm font-black text-hospital-ink">ICU Activity · {previousDateLabel}</p>
              )}
              {previousDateLabel && previousDateResults.length === 0 && (
                <p className="rounded-2xl bg-white px-3 py-4 text-center text-sm font-bold text-slate-500">
                  No ICU activity found for this date.
                </p>
              )}
              {previousDateResults.map((eventRecord) => (
                <IcuActivityCard key={eventRecord.id} eventRecord={eventRecord} />
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
