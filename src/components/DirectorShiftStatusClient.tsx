"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ClipboardCopy, LogOut, RefreshCw } from "lucide-react";
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

function statStatus(update: ShiftStatusUpdate | null) {
  if (!update) {
    return "No update submitted";
  }

  const shortBy = Math.max(0, update.rts_required - update.rts_on);
  return shortBy > 0 ? `Short by ${formatShiftStatusNumber(shortBy)}` : "Fully staffed";
}

function reportText(update: ShiftStatusUpdate, timezone: string) {
  const shortBy = Math.max(0, update.rts_required - update.rts_on);

  return [
    `RT Shift Status - ${shiftTypeLabel(update.shift_type)} ${formatReportDate(update.shift_date, timezone)}`,
    "",
    `RTs scheduled: ${formatShiftStatusNumber(update.rts_on)}`,
    `RTs needed: ${formatShiftStatusNumber(update.rts_required)}`,
    `Short by: ${formatShiftStatusNumber(shortBy)}`,
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

function StatCard({
  title,
  value,
  label,
  status,
  tone
}: {
  title: string;
  value: string | number;
  label: string;
  status?: string;
  tone: "cyan" | "green" | "amber" | "slate";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-100 bg-amber-50 text-amber-800"
      : tone === "green"
        ? "border-emerald-100 bg-emerald-50 text-emerald-800"
        : tone === "slate"
          ? "border-slate-100 bg-slate-50 text-slate-700"
          : "border-cyan-100 bg-cyan-50 text-cyan-800";

  return (
    <div className={`flex min-h-[9rem] flex-col items-center justify-center rounded-3xl border px-4 py-4 text-center shadow-sm ${toneClass}`}>
      <p className="text-xs font-extrabold uppercase leading-4 tracking-normal opacity-80">{title}</p>
      <p className="mt-2 text-4xl font-black leading-none text-hospital-ink">{value}</p>
      <p className="mt-2 text-xs font-extrabold uppercase leading-4 tracking-normal">{label}</p>
      {status && <p className="mt-2 text-sm font-black">{status}</p>}
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
  const [reportOpen, setReportOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const selectedChoice = shiftChoices.find((choice) => choice.id === selectedChoiceId) ?? shiftChoices[0];
  const isSelectedCurrentShift = selectedChoice.shiftDate === today && selectedChoice.shiftType === currentShift;

  const loadShiftStatus = async () => {
    setLoading(true);
    setError("");
    setCopyMessage("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("shift_status_updates")
      .select(shiftStatusSelect)
      .eq("department_id", authContext.departmentId)
      .order("updated_at", { ascending: false })
      .limit(30);

    setLoading(false);

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
  const shortBy = latest ? Math.max(0, latest.rts_required - latest.rts_on) : 0;
  const freshness = freshnessLabel(latest, isSelectedCurrentShift && !showingFallback);
  const textReport = latest ? reportText(latest, timezone) : "";

  const copyReport = async () => {
    if (!textReport) {
      return;
    }

    await navigator.clipboard.writeText(textReport);
    setCopyMessage("Report copied.");
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Director View</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-hospital-ink">Respiratory Shift Status</h1>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                Live department numbers from the Command Center
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => void loadShiftStatus()}
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 text-xs font-black text-cyan-700 disabled:opacity-50"
                aria-label="Refresh shift status"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 shadow-sm"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/80 px-3 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black text-hospital-ink">
                  {shiftTypeLabel(latest?.shift_type ?? selectedChoice.shiftType)} -{" "}
                  {formatDateLabel(latest?.shift_date ?? selectedChoice.shiftDate, timezone)}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-600">
                  {latest
                    ? `Last updated ${formatReportTime(latest.updated_at, timezone)} by ${updatedByName(latest)}`
                    : "Select another shift or refresh after Command Center update."}
                </p>
                <p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-black ${freshness.className}`}>
                  {freshness.label}
                </p>
              </div>
              <label className="block sm:min-w-48">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-cyan-700">View Shift</span>
                <select
                  value={selectedChoiceId}
                  onChange={(event) => {
                    setSelectedChoiceId(event.target.value);
                    setReportOpen(false);
                    setCopyMessage("");
                  }}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-cyan-100 bg-white px-3 text-sm font-black text-hospital-ink shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                >
                  {shiftChoices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {showingFallback && (
              <p className="mt-2 text-xs font-bold text-amber-700">
                No update was submitted for the selected shift. Showing the most recent Command Center update.
              </p>
            )}
          </div>
        </section>

        {loading && (
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <p className="text-sm font-bold text-slate-500">Loading shift status...</p>
          </section>
        )}

        {error && (
          <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}

        {!loading && !latest && !error && (
          <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
            <h2 className="text-xl font-black text-hospital-ink">No update submitted</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              The Command Center has not saved numbers for this shift yet.
            </p>
          </section>
        )}

        {latest && (
          <>
            <section className="grid grid-cols-1 gap-3">
              <StatCard
                title="Staffing"
                value={`${formatShiftStatusNumber(latest.rts_on)} / ${formatShiftStatusNumber(latest.rts_required)}`}
                label="RTs Scheduled / Needed"
                status={statStatus(latest)}
                tone={shortBy > 0 ? "amber" : "green"}
              />
              <div className="grid grid-cols-2 gap-3">
                <StatCard title="Vents" value={latest.vent_count} label="Vent Count" tone="cyan" />
                <StatCard title="BiPAPs" value={latest.bipap_count} label="BiPAP Count" tone="slate" />
              </div>
            </section>

            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <h2 className="text-xl font-black text-hospital-ink">Scheduled Procedures</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[
                  ["C-Sections", latest.c_section_count],
                  ["CABG", latest.cabg_count],
                  ["Bronchs", latest.bronch_count],
                  ["Sputum Inductions", latest.sputum_induction_count],
                  ["Other", latest.other_procedure_count]
                ].map(([label, count]) => (
                  <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-black text-hospital-ink">{count}</p>
                  </div>
                ))}
              </div>
              {latest.other_procedure_note && (
                <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  Other note: {latest.other_procedure_note}
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <button
                type="button"
                onClick={() => {
                  setReportOpen((current) => !current);
                  setCopyMessage("");
                }}
                className="min-h-11 w-full rounded-2xl border border-cyan-100 bg-white px-4 text-sm font-black text-cyan-700"
              >
                {reportOpen ? "Hide Text Report" : "View Text Report"}
              </button>

              {reportOpen && (
                <div className="mt-3 space-y-3">
                  <pre className="whitespace-pre-wrap rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-700">
                    {textReport}
                  </pre>
                  <button
                    type="button"
                    onClick={() => void copyReport()}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20"
                  >
                    <ClipboardCopy size={16} />
                    Copy Report
                  </button>
                  {copyMessage && (
                    <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                      {copyMessage}
                    </p>
                  )}
                </div>
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
