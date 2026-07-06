"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardCopy,
  ClipboardList,
  Clock3,
  FileText,
  LogOut,
  Moon,
  MoreHorizontal,
  RefreshCw,
  Stethoscope,
  Sun,
  User,
  Users,
  Wind
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusShiftType, ShiftStatusUpdate } from "@/lib/shift-status/types";
import {
  currentShiftType,
  formatShiftStatusNumber,
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

const activeRentalStatuses = ["active", "delivered"];

type ShiftChoice = {
  id: string;
  label: string;
  shiftDate: string;
  shiftType: ShiftStatusShiftType;
};

function previousDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function nextDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function previousShiftChoice(today: string, currentShift: ShiftStatusShiftType): ShiftChoice {
  if (currentShift === "day") {
    return {
      id: "previous",
      label: "Previous Shift",
      shiftDate: previousDate(today),
      shiftType: "night"
    };
  }

  return {
    id: "previous",
    label: "Previous Shift",
    shiftDate: today,
    shiftType: "day"
  };
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

export function DirectorShiftStatusClient({
  authContext,
  timezone
}: {
  authContext: AuthenticatedUserContext;
  timezone: string;
}) {
  const today = useMemo(() => todayInTimezone(timezone), [timezone]);
  const tomorrow = useMemo(() => nextDate(today), [today]);
  const currentShift = useMemo(() => currentShiftType(), []);
  const shiftChoices = useMemo<ShiftChoice[]>(
    () => [
      { id: "today-day", label: "Today Day Shift", shiftDate: today, shiftType: "day" },
      { id: "today-night", label: "Today Night Shift", shiftDate: today, shiftType: "night" },
      { id: "tomorrow-day", label: "Tomorrow Day Shift", shiftDate: tomorrow, shiftType: "day" },
      { id: "tomorrow-night", label: "Tomorrow Night Shift", shiftDate: tomorrow, shiftType: "night" },
      previousShiftChoice(today, currentShift)
    ],
    [currentShift, today, tomorrow]
  );
  const [selectedChoiceId, setSelectedChoiceId] = useState(() => (currentShift === "day" ? "today-day" : "today-night"));
  const [updates, setUpdates] = useState<ShiftStatusUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeRentalCount, setActiveRentalCount] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const selectedChoice = shiftChoices.find((choice) => choice.id === selectedChoiceId) ?? shiftChoices[0];
  const isSelectedCurrentShift = selectedChoice.shiftDate === today && selectedChoice.shiftType === currentShift;

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadShiftStatus();
    }, 0);

    return () => window.clearTimeout(timer);
    // loadShiftStatus intentionally reads current auth context only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authContext.departmentId]);

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
  const status = directorStatus(latest);
  const freshness = freshnessLabel(latest, isSelectedCurrentShift && !showingFallback);
  const textReport = latest ? reportText(latest, timezone) : "";
  const procedureTotal = latest
    ? latest.c_section_count +
      latest.cabg_count +
      latest.bronch_count +
      latest.sputum_induction_count +
      latest.other_procedure_count
    : 0;
  const updatedBy = latest ? displayInitials(updatedByName(latest)) : "";
  const selectedShiftLabel = shiftTypeLabel(latest?.shift_type ?? selectedChoice.shiftType);
  const selectedShiftDate = formatDateLabel(latest?.shift_date ?? selectedChoice.shiftDate, timezone);
  const ShiftIcon = (latest?.shift_type ?? selectedChoice.shiftType) === "night" ? Moon : Sun;

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
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadShiftStatus()}
                disabled={loading}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-2xl border border-cyan-100 bg-white px-3 text-xs font-black text-cyan-700 shadow-sm disabled:opacity-50"
                aria-label="Refresh shift status"
              >
                <RefreshCw size={15} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>

            <label className="block">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-cyan-700">View Shift</span>
              <select
                value={selectedChoiceId}
                onChange={(event) => {
                  setSelectedChoiceId(event.target.value);
                  setReportOpen(false);
                  setCopyMessage("");
                }}
                className="mt-1 min-h-10 w-full rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 text-sm font-black text-hospital-ink shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
              >
                {shiftChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
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
              No update was submitted for the selected shift. Showing the most recent Command Center update.
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
        </section>

        {latest && (
          <>
            <section className="rounded-[2rem] border border-white/80 bg-white/95 p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                  <Building2 size={22} />
                </span>
                <h2 className="text-xl font-black text-hospital-ink">Department Snapshot</h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <SnapshotCard icon={<Wind size={20} />} label="Vents" value={latest.vent_count} />
                <SnapshotCard icon={<Activity size={20} />} label="BiPAPs" value={latest.bipap_count} />
                <SnapshotCard icon={<CalendarCheck size={20} />} label="Scheduled Procedures" value={procedureTotal} />
                <SnapshotCard icon={<Building2 size={20} />} label="Active Rentals" value={activeRentalCount ?? "—"} />
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/80 bg-white/95 p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                  <ClipboardList size={22} />
                </span>
                <h2 className="text-xl font-black text-hospital-ink">Scheduled Procedures</h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2.5 min-[440px]:grid-cols-3">
                <ProcedureCard icon={<User size={18} />} label="C-Sections" value={latest.c_section_count} />
                <ProcedureCard icon={<Activity size={18} />} label="CABG" value={latest.cabg_count} />
                <ProcedureCard icon={<Stethoscope size={18} />} label="Bronchs" value={latest.bronch_count} />
                <ProcedureCard icon={<Wind size={18} />} label="Sputum Inductions" value={latest.sputum_induction_count} />
                <ProcedureCard icon={<MoreHorizontal size={18} />} label="Other" value={latest.other_procedure_count} />
              </div>
              {latest.other_procedure_note && (
                <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  Other note: {latest.other_procedure_note}
                </p>
              )}
            </section>

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

        <p className="flex items-center justify-center gap-2 text-center text-xs font-bold text-slate-500">
          <Activity size={14} />
          Read-only dashboard. Updates come from the Command Center.
        </p>
      </div>
    </main>
  );
}
