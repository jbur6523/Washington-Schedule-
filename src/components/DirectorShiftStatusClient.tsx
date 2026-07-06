"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Crown,
  ClipboardCopy,
  ClipboardList,
  Clock3,
  FileText,
  LogOut,
  Moon,
  MoreHorizontal,
  Phone,
  Search,
  Stethoscope,
  Sun,
  User,
  Users,
  Wind
} from "lucide-react";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ScheduleEntry } from "@/data/mockSchedule";
import {
  adaptActiveSchedule,
  type ActiveSchedule,
  type ScheduleEntryRow,
  type ScheduleVersionRow,
  type UserScheduleOverrideRow
} from "@/lib/schedule/supabase-schedule";
import type { ShiftStatusShiftType, ShiftStatusUpdate } from "@/lib/shift-status/types";
import {
  currentShiftStatusWindow,
  formatShiftStatusNumber,
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

const activeRentalStatuses = ["active", "delivered"];
const scheduleEntrySelect =
  "id, schedule_version_id, department_id, staff_profile_id, shift_date, day_of_week, shift_type, shift_start, shift_end, entry_status, is_shift_lead, staff_profiles(id, display_name, employment_type, home_assignment, operations_role, is_active, status_message, status_updated_at)";
const scheduleOverrideSelect =
  "id, department_id, staff_profile_id, base_schedule_entry_id, override_type, shift_date, shift_type, shift_start, shift_end, note, is_active, created_at, updated_at, staff_profiles(id, display_name, employment_type, home_assignment, operations_role, is_active, status_message, status_updated_at)";

function previousDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(dateValue: string, timezone: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatReportDate(dateValue: string, timezone: string) {
  return formatDateLabel(dateValue, timezone);
}

function formatReportTime(value: string | null | undefined, timezone: string) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).format(new Date(value));
}

function minutesSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function freshnessLabel(update: ShiftStatusUpdate | null, isSelectedCurrentShift: boolean) {
  if (!update) {
    return {
      label: "Waiting for update",
      className: "border-slate-200 bg-slate-50 text-slate-600"
    };
  }

  const minutes = minutesSince(update.updated_at);
  if (isSelectedCurrentShift && minutes >= 240) {
    return {
      label: "Needs update",
      className: "border-amber-200 bg-amber-50 text-amber-800"
    };
  }

  if (minutes < 1) {
    return {
      label: "Updated just now",
      className: "border-emerald-100 bg-emerald-50 text-emerald-700"
    };
  }

  if (minutes < 60) {
    return {
      label: `Updated ${minutes} minutes ago`,
      className: "border-emerald-100 bg-emerald-50 text-emerald-700"
    };
  }

  const hours = Math.floor(minutes / 60);
  return {
    label: `Updated ${hours} ${hours === 1 ? "hour" : "hours"} ago`,
    className: "border-emerald-100 bg-emerald-50 text-emerald-700"
  };
}

function reportText(update: ShiftStatusUpdate, timezone: string) {
  const shortBy = Math.max(0, update.rts_required - update.rts_on);

  return [
    `RT Shift Status - ${shiftTypeLabel(update.shift_type)} ${formatReportDate(update.shift_date, timezone)}`,
    "",
    `RTs scheduled: ${formatShiftStatusNumber(update.rts_on)}`,
    `RTs needed: ${formatShiftStatusNumber(update.rts_required)}`,
    `Staffing status: ${shortBy > 0 ? `Short by ${formatShiftStatusNumber(shortBy)}` : "Staffed"}`,
    "",
    `Vents: ${update.vent_count}`,
    `BiPAPs: ${update.bipap_count}`,
    "",
    "Scheduled procedures:",
    `C-Sections: ${update.c_section_count}`,
    `Vaginal Delivery: ${update.vaginal_delivery_count}`,
    `CABG: ${update.cabg_count}`,
    `Bronchs: ${update.bronch_count}`,
    `Sputum Inductions: ${update.sputum_induction_count}`,
    `Other: ${update.other_procedure_count}`,
    "",
    `Updated by: ${updatedByName(update)}`,
    `Updated at: ${formatReportTime(update.updated_at, timezone)}`
  ].join("\n");
}

function displayInitials(name: string) {
  if (!name || name === "Unknown") {
    return name || "Unknown";
  }

  const trimmed = name.trim();
  if (/^[A-Z]{2,5}$/.test(trimmed)) {
    return trimmed;
  }

  if (!trimmed.includes(" ") && trimmed.length <= 4) {
    return trimmed.toUpperCase();
  }

  const parts = name
    .replace(/[^a-zA-Z\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return name;
  }

  return parts.map((part) => part[0]?.toUpperCase()).join("");
}

function directorStatus(update: ShiftStatusUpdate | null) {
  if (!update) {
    return {
      label: "No Update",
      className: "border-slate-200 bg-slate-100 text-slate-600",
      icon: null
    };
  }

  if (update.rts_on >= update.rts_required) {
    return {
      label: "Staffed",
      className: "border-emerald-100 bg-emerald-50 text-emerald-700",
      icon: <CheckCircle2 size={15} />
    };
  }

  return {
    label: "Short",
    className: "border-rose-100 bg-rose-50 text-rose-700",
    icon: <Activity size={15} />
  };
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex min-h-[7.6rem] flex-col items-center justify-center rounded-3xl border border-slate-100 bg-slate-50/80 px-2.5 py-3 text-center shadow-sm">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
        {icon}
      </span>
      <p className="mt-3 text-[12px] font-extrabold leading-tight text-slate-600">{label}</p>
      <p className="mt-2 text-4xl font-black leading-none text-hospital-ink">{value}</p>
    </div>
  );
}

function SnapshotCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex min-h-[6.2rem] flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/80 px-2.5 py-3 text-center shadow-sm">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
        {icon}
      </span>
      <p className="mt-2 text-xs font-extrabold leading-tight text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-black leading-none text-hospital-ink">{value}</p>
    </div>
  );
}

function ProcedureCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex min-h-[4.8rem] items-center gap-2.5 rounded-2xl border border-slate-100 bg-slate-50/80 px-2.5 py-3 shadow-sm">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold leading-tight text-slate-600">{label}</p>
        <p className="mt-0.5 text-2xl font-black leading-none text-hospital-ink">{value}</p>
      </div>
    </div>
  );
}

function shortScheduleDateLabel(dateValue: string, timezone: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatShiftDateSubtitle(shiftType: ShiftStatusShiftType, dateValue: string, timezone: string) {
  return `${shiftTypeLabel(shiftType)} · ${formatDateLabel(dateValue, timezone)}`;
}

function formatPhoneHref(phoneNumber: string) {
  const dialable = phoneNumber.replace(/[^\d+]/g, "");
  return dialable ? `tel:${dialable}` : undefined;
}

function zonedDateTimeParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const dateValue = `${value("year")}-${value("month")}-${value("day")}`;

  return {
    dateValue,
    minutes: Number(value("hour") || "0") * 60 + Number(value("minute") || "0")
  };
}

function directorViewShiftDefaultShift(timezone: string): "day" | "night" {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");

  return hour >= 7 && hour < 19 ? "day" : "night";
}

function previousShiftDate(currentDate: string, currentShift: "day" | "night") {
  return currentShift === "day" ? previousDate(currentDate) : currentDate;
}

function visibleScheduleDropdownDates(uploadedDates: string[], currentDate: string, currentShift: "day" | "night") {
  const previousDateValue = previousShiftDate(currentDate, currentShift);
  const visibleDates = new Set<string>();

  if (uploadedDates.includes(previousDateValue)) {
    visibleDates.add(previousDateValue);
  }

  if (uploadedDates.includes(currentDate)) {
    visibleDates.add(currentDate);
  }

  uploadedDates
    .filter((dateValue) => dateValue > currentDate)
    .forEach((dateValue) => visibleDates.add(dateValue));

  return Array.from(visibleDates).sort();
}

function chooseDefaultScheduleDate(uploadedDates: string[], currentDate: string, currentShift: "day" | "night") {
  if (uploadedDates.includes(currentDate)) {
    return currentDate;
  }

  const closestFutureDate = uploadedDates.find((dateValue) => dateValue > currentDate);
  if (closestFutureDate) {
    return closestFutureDate;
  }

  const previousDateValue = previousShiftDate(currentDate, currentShift);
  return uploadedDates.includes(previousDateValue) ? previousDateValue : "";
}

function parseManualScheduleDate(value: string) {
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

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function currentProcedureWindow(timezone: string) {
  const now = new Date();
  const { dateValue, minutes } = zonedDateTimeParts(now, timezone);
  const dayReset = 7 * 60 + 30;
  const nightReset = 19 * 60 + 30;

  if (minutes >= nightReset) {
    return {
      shiftDate: dateValue,
      shiftType: "night" as ShiftStatusShiftType,
      resetDate: dateValue,
      resetMinutes: nightReset
    };
  }

  if (minutes >= dayReset) {
    return {
      shiftDate: dateValue,
      shiftType: "day" as ShiftStatusShiftType,
      resetDate: dateValue,
      resetMinutes: dayReset
    };
  }

  const previous = previousDate(dateValue);
  return {
    shiftDate: previous,
    shiftType: "night" as ShiftStatusShiftType,
    resetDate: previous,
    resetMinutes: nightReset
  };
}

function updateIsAfterProcedureReset(update: ShiftStatusUpdate, timezone: string, window: ReturnType<typeof currentProcedureWindow>) {
  if (update.shift_date !== window.shiftDate || update.shift_type !== window.shiftType) {
    return false;
  }

  const updated = zonedDateTimeParts(new Date(update.updated_at), timezone);
  if (updated.dateValue > window.resetDate) {
    return true;
  }
  if (updated.dateValue < window.resetDate) {
    return false;
  }

  return updated.minutes >= window.resetMinutes;
}

function procedureCounts(update: ShiftStatusUpdate | null) {
  return {
    cSections: update?.c_section_count ?? 0,
    vaginalDelivery: update?.vaginal_delivery_count ?? 0,
    cabg: update?.cabg_count ?? 0,
    bronchs: update?.bronch_count ?? 0,
    sputumInductions: update?.sputum_induction_count ?? 0,
    other: update?.other_procedure_count ?? 0,
    note: update?.other_procedure_note ?? null
  };
}

type DirectoryStaffProfile = {
  id: string;
  display_name: string;
  phone_number: string | null;
  is_active: boolean;
};

function DirectoryStaffRow({ profile }: { profile: DirectoryStaffProfile }) {
  const phoneHref = profile.phone_number ? formatPhoneHref(profile.phone_number) : undefined;

  return (
    <article className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black leading-5 text-hospital-ink">{profile.display_name}</p>
          <p className={`mt-1 text-[11px] font-extrabold uppercase ${profile.is_active ? "text-emerald-700" : "text-slate-400"}`}>
            {profile.is_active ? "Active" : "Inactive"}
          </p>
        </div>
        {profile.phone_number && phoneHref ? (
          <a
            href={phoneHref}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-2xl border border-cyan-100 bg-white px-3 text-xs font-black text-cyan-700"
          >
            <Phone size={14} />
            {profile.phone_number}
          </a>
        ) : (
          <span className="shrink-0 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs font-bold text-slate-500">
            No phone listed
          </span>
        )}
      </div>
    </article>
  );
}

function DirectorScheduleRow({ entry }: { entry: ScheduleEntry }) {
  const isAide = entry.operationsRole === "aide";

  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${isAide ? "border-pink-100 bg-pink-50/90" : "border-slate-100 bg-slate-50/90"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-black leading-5 text-hospital-ink">
            {entry.isShiftLead && (
              <span
                title="Shift Lead"
                aria-label="Shift Lead"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 text-amber-700 shadow-sm"
              >
                <Crown size={12} />
              </span>
            )}
            <span>{entry.staffName}</span>
          </p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">{entry.shiftTime}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {entry.isShiftLead && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">
              Lead
            </span>
          )}
          <StaffTypeBadge staffType={entry.staffType} compact isAide={isAide} />
        </div>
      </div>
    </div>
  );
}

export function DirectorShiftStatusClient({
  authContext,
  timezone
}: {
  authContext: AuthenticatedUserContext;
  timezone: string;
}) {
  const currentWindow = useMemo(() => currentShiftStatusWindow(timezone), [timezone]);
  const selectedChoice = useMemo(
    () => ({
      shiftDate: currentWindow.shiftDate,
      shiftType: currentWindow.shiftType
    }),
    [currentWindow.shiftDate, currentWindow.shiftType]
  );
  const [updates, setUpdates] = useState<ShiftStatusUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeRentalCount, setActiveRentalCount] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryProfiles, setDirectoryProfiles] = useState<DirectoryStaffProfile[]>([]);
  const [shiftPreviewOpen, setShiftPreviewOpen] = useState(false);
  const [schedulePreview, setSchedulePreview] = useState<ActiveSchedule | null>(null);
  const [schedulePreviewLoading, setSchedulePreviewLoading] = useState(false);
  const [schedulePreviewError, setSchedulePreviewError] = useState("");
  const [selectedScheduleDate, setSelectedScheduleDate] = useState("");
  const [selectedScheduleShift, setSelectedScheduleShift] = useState<"day" | "night">(() => directorViewShiftDefaultShift(timezone));
  const [manualScheduleDate, setManualScheduleDate] = useState("");
  const [manualScheduleError, setManualScheduleError] = useState("");
  const isSelectedCurrentShift = true;

  const loadShiftStatus = async () => {
    setLoading(true);
    setError("");
    setCopyMessage("");

    const supabase = createClient();
    const [{ data, error: loadError }, { count: rentalCount, error: rentalCountError }] = await Promise.all([
      supabase
        .from("shift_status_updates")
        .select(shiftStatusSelect)
        .eq("department_id", authContext.departmentId)
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase
        .from("rental_records")
        .select("id", { count: "exact", head: true })
        .eq("department_id", authContext.departmentId)
        .in("status", activeRentalStatuses)
    ]);

    setLoading(false);
    setActiveRentalCount(rentalCountError ? null : rentalCount ?? 0);

    if (loadError) {
      setError("Unable to load shift status.");
      setUpdates([]);
      return;
    }

    setUpdates((data ?? []) as unknown as ShiftStatusUpdate[]);
  };

  const loadSchedulePreview = async () => {
    setSchedulePreviewLoading(true);
    setSchedulePreviewError("");

    const supabase = createClient();
    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .select("active_schedule_version_id")
      .eq("id", authContext.departmentId)
      .maybeSingle();

    if (departmentError) {
      setSchedulePreviewLoading(false);
      setSchedulePreview(null);
      setSchedulePreviewError("Could not load shift schedule. Please try again.");
      return;
    }

    const activeVersionId = department?.active_schedule_version_id as string | null | undefined;

    if (!activeVersionId) {
      setSchedulePreviewLoading(false);
      setSchedulePreview(null);
      return;
    }

    const { data: version, error: versionError } = await supabase
      .from("schedule_versions")
      .select("*")
      .eq("id", activeVersionId)
      .eq("status", "published")
      .maybeSingle();

    if (versionError || !version) {
      setSchedulePreviewLoading(false);
      setSchedulePreview(null);
      setSchedulePreviewError("Could not load shift schedule. Please try again.");
      return;
    }

    const [{ data: entries, error: entriesError }, { data: overrides, error: overridesError }] = await Promise.all([
      supabase
        .from("schedule_entries")
        .select(scheduleEntrySelect)
        .eq("schedule_version_id", activeVersionId)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true }),
      supabase
        .from("user_schedule_overrides")
        .select(scheduleOverrideSelect)
        .eq("department_id", authContext.departmentId)
        .eq("is_active", true)
        .order("shift_date", { ascending: true })
    ]);

    if (entriesError || overridesError) {
      setSchedulePreviewLoading(false);
      setSchedulePreview(null);
      setSchedulePreviewError("Could not load shift schedule. Please try again.");
      return;
    }

    const nextSchedule = adaptActiveSchedule(
      version as ScheduleVersionRow,
      (entries ?? []) as ScheduleEntryRow[],
      [],
      (overrides ?? []) as UserScheduleOverrideRow[]
    );

    setSchedulePreview(nextSchedule);
    setSchedulePreviewLoading(false);

    const uploadedDates = Array.from(new Set(((entries ?? []) as ScheduleEntryRow[]).map((entry) => entry.shift_date))).sort();
    const currentPacificDate = todayInTimezone(timezone);
    const nextSelectedDate = chooseDefaultScheduleDate(
      uploadedDates,
      currentPacificDate,
      directorViewShiftDefaultShift(timezone)
    );

    setSelectedScheduleDate(nextSelectedDate);
  };

  const loadDirectory = async () => {
    setDirectoryLoading(true);
    setDirectoryError("");

    const supabase = createClient();
    const { data, error: directoryLoadError } = await supabase
      .from("staff_profiles")
      .select("id, display_name, phone_number, is_active")
      .eq("department_id", authContext.departmentId)
      .order("display_name", { ascending: true });

    setDirectoryLoading(false);

    if (directoryLoadError) {
      setDirectoryProfiles([]);
      setDirectoryError("Could not load respiratory directory.");
      return;
    }

    setDirectoryProfiles((data ?? []) as DirectoryStaffProfile[]);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadShiftStatus();
    }, 0);

    return () => window.clearTimeout(timer);
    // loadShiftStatus intentionally reads current auth context only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authContext.departmentId]);

  useEffect(() => {
    if (!shiftPreviewOpen && !directoryOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [directoryOpen, shiftPreviewOpen]);

  useEffect(() => {
    if (!directoryOpen || directoryProfiles.length > 0 || directoryLoading) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadDirectory();
    }, 0);

    return () => window.clearTimeout(timer);
    // loadDirectory intentionally reads current auth context only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryLoading, directoryOpen, directoryProfiles.length]);

  const selectedUpdates = useMemo(
    () =>
      updates.filter(
        (update) => update.shift_date === selectedChoice.shiftDate && update.shift_type === selectedChoice.shiftType
      ),
    [selectedChoice.shiftDate, selectedChoice.shiftType, updates]
  );
  const selectedLatest = useMemo(() => latestShiftStatus(selectedUpdates), [selectedUpdates]);
  const fallbackLatest = useMemo(() => latestShiftStatus(updates), [updates]);
  const latest = selectedLatest ?? (isSelectedCurrentShift ? fallbackLatest : null);
  const showingFallback = !selectedLatest && Boolean(latest);
  const snapshotLatest = fallbackLatest;
  const procedureWindow = useMemo(() => currentProcedureWindow(timezone), [timezone]);
  const procedureLatest = useMemo(
    () => latestShiftStatus(updates.filter((update) => updateIsAfterProcedureReset(update, timezone, procedureWindow))),
    [procedureWindow, timezone, updates]
  );
  const currentProcedureCounts = procedureCounts(procedureLatest);
  const procedureTotal =
    currentProcedureCounts.cSections +
    currentProcedureCounts.vaginalDelivery +
    currentProcedureCounts.cabg +
    currentProcedureCounts.bronchs +
    currentProcedureCounts.sputumInductions +
    currentProcedureCounts.other;
  const status = directorStatus(latest);
  const freshness = freshnessLabel(latest, isSelectedCurrentShift && !showingFallback);
  const textReport = latest ? reportText(latest, timezone) : "";
  const updatedBy = latest ? displayInitials(updatedByName(latest)) : "";
  const selectedShiftLabel = shiftTypeLabel(latest?.shift_type ?? selectedChoice.shiftType);
  const selectedShiftDate = formatDateLabel(latest?.shift_date ?? selectedChoice.shiftDate, timezone);
  const ShiftIcon = (latest?.shift_type ?? selectedChoice.shiftType) === "night" ? Moon : Sun;
  const snapshotShiftSubtitle = snapshotLatest
    ? formatShiftDateSubtitle(snapshotLatest.shift_type, snapshotLatest.shift_date, timezone)
    : formatShiftDateSubtitle(selectedChoice.shiftType, selectedChoice.shiftDate, timezone);
  const procedureShiftSubtitle = formatShiftDateSubtitle(procedureWindow.shiftType, procedureWindow.shiftDate, timezone);
  const snapshotUpdatedBy = snapshotLatest ? displayInitials(updatedByName(snapshotLatest)) : "";
  const filteredDirectoryProfiles = useMemo(() => {
    const query = directorySearch.trim().toLowerCase();
    if (!query) {
      return directoryProfiles;
    }

    return directoryProfiles.filter(
      (profile) =>
        profile.display_name.toLowerCase().includes(query) ||
        (profile.phone_number ?? "").toLowerCase().includes(query)
    );
  }, [directoryProfiles, directorySearch]);
  const scheduleDateOptions = useMemo(
    () => Array.from(new Set((schedulePreview?.entries ?? []).map((entry) => entry.shift_date))).sort(),
    [schedulePreview?.entries]
  );
  const defaultScheduleDateOptions = useMemo(() => {
    const todayDate = todayInTimezone(timezone);
    return visibleScheduleDropdownDates(scheduleDateOptions, todayDate, directorViewShiftDefaultShift(timezone));
  }, [scheduleDateOptions, timezone]);
  const selectedScheduleDay = useMemo(
    () => schedulePreview?.days.find((day) => day.dateValue === selectedScheduleDate) ?? null,
    [schedulePreview?.days, selectedScheduleDate]
  );
  const selectedScheduleEntries = useMemo(
    () =>
      (selectedScheduleDay?.scheduled ?? [])
        .filter((entry) => entry.shiftCategory === selectedScheduleShift)
        .sort((left, right) => (left.shiftStart ?? "").localeCompare(right.shiftStart ?? "")),
    [selectedScheduleDay?.scheduled, selectedScheduleShift]
  );

  const openShiftPreview = () => {
    const currentPacificDate = todayInTimezone(timezone);
    const availableDates = Array.from(new Set((schedulePreview?.entries ?? []).map((entry) => entry.shift_date))).sort();
    const defaultShift = directorViewShiftDefaultShift(timezone);
    setSelectedScheduleShift(defaultShift);
    setSelectedScheduleDate(chooseDefaultScheduleDate(availableDates, currentPacificDate, defaultShift));
    setManualScheduleDate("");
    setManualScheduleError("");
    setShiftPreviewOpen(true);
    if (!schedulePreview) {
      void loadSchedulePreview();
    }
  };

  const applyManualScheduleDate = (value: string) => {
    const cleanValue = value.replace(/\D/g, "").slice(0, 6);
    setManualScheduleDate(cleanValue);

    if (cleanValue.length === 0) {
      setManualScheduleError("");
      return;
    }

    if (cleanValue.length < 6) {
      setManualScheduleError("");
      return;
    }

    const parsedDate = parseManualScheduleDate(cleanValue);
    if (!parsedDate) {
      setManualScheduleError("Enter a valid date as MMDDYY.");
      return;
    }

    if (!scheduleDateOptions.includes(parsedDate)) {
      setManualScheduleError("No uploaded schedule found for this date.");
      return;
    }

    setSelectedScheduleDate(parsedDate);
    setManualScheduleError("");
  };

  const copyReport = async () => {
    if (!textReport) {
      return;
    }

    try {
      await navigator.clipboard.writeText(textReport);
      setCopyMessage("Summary copied.");
      return;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = textReport;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);

      setCopyMessage(copied ? "Summary copied." : "Copy unavailable. Open the text report and copy manually.");
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-[2rem] border border-white/80 bg-white/95 p-4 shadow-soft">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Director View</p>
                <h1 className="mt-1 text-3xl font-black leading-tight text-hospital-ink">
                  Respiratory Shift Status
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold leading-5 text-slate-500">
                  <span>Live department numbers from the Command Center</span>
                  {latest && (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                      <span className="font-black text-slate-600">Live</span>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>

            <button
              type="button"
              onClick={() => setDirectoryOpen(true)}
              className="flex min-h-16 w-full items-center gap-3 rounded-3xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-left shadow-sm"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
                <Phone size={20} />
              </span>
              <span>
                <span className="block text-sm font-black text-hospital-ink">Respiratory Directory</span>
                <span className="mt-0.5 block text-xs font-bold text-slate-500">View RT staff phone numbers.</span>
              </span>
            </button>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/80 bg-white/95 p-4 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-black leading-tight text-hospital-ink">Current Shift Status</h2>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black ${status.className}`}>
              {status.icon}
              {status.label}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <p className="flex items-center gap-2 text-sm font-black text-cyan-700">
              <ShiftIcon size={18} />
              {selectedShiftLabel} <span className="text-slate-300">·</span> {selectedShiftDate}
            </p>
            {latest && (
              <p className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <Clock3 size={17} />
                {freshness.label} by {updatedBy}
              </p>
            )}
          </div>

          {showingFallback && (
            <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              No update was submitted for the current shift. Showing the most recent Command Center update.
            </p>
          )}

          {loading && (
            <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">
              Loading shift status...
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          {!loading && !latest && !error && (
            <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold leading-6 text-slate-500">
              No update has been submitted for this shift yet.
            </p>
          )}

          {latest && (
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <MetricCard icon={<Users size={22} />} label="Scheduled" value={formatShiftStatusNumber(latest.rts_on)} />
              <MetricCard icon={<User size={22} />} label="RTs Needed" value={formatShiftStatusNumber(latest.rts_required)} />
            </div>
          )}

          <button
            type="button"
            onClick={openShiftPreview}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-700 bg-white px-4 text-sm font-black text-cyan-700 shadow-sm"
          >
            <CalendarCheck size={17} />
            View Shift
          </button>
        </section>

        {snapshotLatest && (
          <section className="rounded-[2rem] border border-white/80 bg-white/95 p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <Building2 size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black leading-tight text-hospital-ink">Department Snapshot</h2>
                <p className="mt-0.5 text-left text-sm font-black text-cyan-700">{snapshotShiftSubtitle}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <SnapshotCard icon={<Wind size={20} />} label="Vents" value={snapshotLatest.vent_count} />
              <SnapshotCard icon={<Activity size={20} />} label="BiPAPs" value={snapshotLatest.bipap_count} />
              <SnapshotCard icon={<CalendarCheck size={20} />} label="Scheduled Procedures" value={procedureTotal} />
              <SnapshotCard icon={<Building2 size={20} />} label="Active Rentals" value={activeRentalCount ?? "None"} />
            </div>
            <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-center text-xs font-bold leading-5 text-slate-500">
              <p>Last updated: {formatShiftStatusTime(snapshotLatest.updated_at, timezone)}</p>
              <p>Updated by: {snapshotUpdatedBy}</p>
            </div>
          </section>
        )}

        {snapshotLatest && (
          <section className="rounded-[2rem] border border-white/80 bg-white/95 p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <ClipboardList size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black leading-tight text-hospital-ink">Scheduled Procedures</h2>
                <p className="mt-0.5 text-left text-sm font-black text-cyan-700">{procedureShiftSubtitle}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5 min-[440px]:grid-cols-3">
              <ProcedureCard icon={<User size={18} />} label="C-Sections" value={currentProcedureCounts.cSections} />
              <ProcedureCard icon={<Users size={18} />} label="Vaginal Delivery" value={currentProcedureCounts.vaginalDelivery} />
              <ProcedureCard icon={<Activity size={18} />} label="CABG" value={currentProcedureCounts.cabg} />
              <ProcedureCard icon={<Stethoscope size={18} />} label="Bronchs" value={currentProcedureCounts.bronchs} />
              <ProcedureCard icon={<Wind size={18} />} label="Sputum Inductions" value={currentProcedureCounts.sputumInductions} />
              <ProcedureCard icon={<MoreHorizontal size={18} />} label="Other" value={currentProcedureCounts.other} />
            </div>
            {currentProcedureCounts.note && (
              <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                Other note: {currentProcedureCounts.note}
              </p>
            )}
          </section>
        )}

        {latest && (
          <>
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setReportOpen((current) => !current);
                  setCopyMessage("");
                }}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20"
              >
                <FileText size={18} />
                {reportOpen ? "Hide Text Report" : "View Text Report"}
              </button>
              <button
                type="button"
                onClick={() => void copyReport()}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-700 bg-white px-4 text-sm font-black text-cyan-700 shadow-sm"
              >
                <ClipboardCopy size={18} />
                Copy Summary
              </button>

              {copyMessage && (
                <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                  {copyMessage}
                </p>
              )}

              {reportOpen && (
                <pre className="whitespace-pre-wrap rounded-3xl border border-slate-100 bg-white/95 p-4 text-xs font-bold leading-5 text-slate-700 shadow-soft">
                  {textReport}
                </pre>
              )}
            </section>
          </>
        )}

        {directoryOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="respiratory-directory-title"
              className="max-h-[88vh] w-full max-w-xl overflow-hidden rounded-[2rem] border border-white bg-white shadow-2xl"
            >
              <div className="border-b border-slate-100 px-4 py-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Director View</p>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <div>
                    <h2 id="respiratory-directory-title" className="text-2xl font-black text-hospital-ink">
                      Respiratory Directory
                    </h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">RT staff contact list</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDirectoryOpen(false)}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
                  >
                    Close
                  </button>
                </div>

                <label className="mt-4 block">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Search staff</span>
                  <span className="mt-1 flex min-h-11 items-center gap-2 rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 shadow-sm">
                    <Search size={16} className="text-cyan-700" />
                    <input
                      value={directorySearch}
                      onChange={(event) => setDirectorySearch(event.target.value)}
                      placeholder="Search staff"
                      className="min-w-0 flex-1 bg-transparent text-sm font-bold text-hospital-ink outline-none placeholder:text-slate-400"
                    />
                  </span>
                </label>
              </div>

              <div className="max-h-[58vh] overflow-y-auto px-4 py-4 pb-5">
                {directoryLoading && (
                  <p className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                    Loading respiratory directory...
                  </p>
                )}

                {directoryError && (
                  <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-4 text-center text-sm font-bold text-rose-700">
                    {directoryError}
                  </p>
                )}

                {!directoryLoading && !directoryError && filteredDirectoryProfiles.length === 0 && (
                  <p className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                    No staff found.
                  </p>
                )}

                {!directoryLoading && !directoryError && filteredDirectoryProfiles.length > 0 && (
                  <div className="space-y-2">
                    {filteredDirectoryProfiles.map((profile) => (
                      <DirectoryStaffRow key={profile.id} profile={profile} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {shiftPreviewOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="director-view-shift-title"
              className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] border border-white bg-white shadow-2xl"
            >
              <div className="border-b border-slate-100 px-4 py-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Director View</p>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <div>
                    <h2 id="director-view-shift-title" className="text-2xl font-black text-hospital-ink">
                      View Shift
                    </h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">Read-only schedule preview</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShiftPreviewOpen(false)}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="block">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Date</span>
                    <select
                      value={selectedScheduleDate || ""}
                      onChange={(event) => {
                        setSelectedScheduleDate(event.target.value);
                        setManualScheduleDate("");
                        setManualScheduleError("");
                      }}
                      disabled={defaultScheduleDateOptions.length === 0}
                      className="mt-1 min-h-11 w-full rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 text-sm font-black text-hospital-ink shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {defaultScheduleDateOptions.length === 0 && <option value="">Select date</option>}
                      {selectedScheduleDate && !defaultScheduleDateOptions.includes(selectedScheduleDate) && (
                        <option value={selectedScheduleDate}>
                          Manual: {shortScheduleDateLabel(selectedScheduleDate, timezone)}
                        </option>
                      )}
                      {defaultScheduleDateOptions.map((dateValue) => (
                        <option key={dateValue} value={dateValue}>
                          {shortScheduleDateLabel(dateValue, timezone)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Enter Date</span>
                    <input
                      value={manualScheduleDate}
                      onChange={(event) => applyManualScheduleDate(event.target.value)}
                      inputMode="numeric"
                      placeholder="MMDDYY"
                      className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-hospital-ink shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                    />
                    <span className="mt-1 block text-xs font-bold text-slate-500">MMDDYY</span>
                    {manualScheduleError && (
                      <span className="mt-1 block text-xs font-bold text-rose-700">{manualScheduleError}</span>
                    )}
                  </label>

                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-1">
                    {(["day", "night"] as const).map((shift) => (
                      <button
                        key={shift}
                        type="button"
                        onClick={() => setSelectedScheduleShift(shift)}
                        className={`min-h-10 rounded-xl px-3 text-xs font-black ${
                          selectedScheduleShift === shift
                            ? "bg-cyan-700 text-white shadow-sm"
                            : "bg-white text-slate-600"
                        }`}
                      >
                        {shift === "day" ? "Day Shift" : "Night Shift"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
                {schedulePreviewLoading && (
                  <p className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                    Loading shift schedule...
                  </p>
                )}

                {schedulePreviewError && (
                  <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-4 text-center text-sm font-bold text-rose-700">
                    {schedulePreviewError}
                  </p>
                )}

                {!schedulePreviewLoading && !schedulePreviewError && scheduleDateOptions.length === 0 && (
                  <p className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                    No uploaded schedule dates found.
                  </p>
                )}

                {!schedulePreviewLoading && !schedulePreviewError && scheduleDateOptions.length > 0 && !selectedScheduleDate && (
                  <p className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                    No uploaded schedule found for this date.
                  </p>
                )}

                {!schedulePreviewLoading && !schedulePreviewError && scheduleDateOptions.length > 0 && selectedScheduleDate && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-hospital-ink">
                        Scheduled: {selectedScheduleEntries.length}
                      </p>
                      <p className="text-xs font-bold text-slate-500">
                        {selectedScheduleDate ? formatDateLabel(selectedScheduleDate, timezone) : ""}
                      </p>
                    </div>

                    {selectedScheduleEntries.length === 0 ? (
                      <p className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                        No scheduled staff found for this date and shift.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedScheduleEntries.map((entry) => (
                          <DirectorScheduleRow key={entry.id ?? `${entry.staffName}-${entry.shiftTime}`} entry={entry} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        <p className="flex items-center justify-center gap-2 text-center text-xs font-bold text-slate-500">
          <Activity size={14} />
          Read-only dashboard. Updates come from the Command Center.
        </p>
      </div>
    </main>
  );
}
