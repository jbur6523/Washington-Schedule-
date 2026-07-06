"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ClipboardCopy, LogOut, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusShiftType, ShiftStatusUpdate } from "@/lib/shift-status/types";
import {
  formatShiftStatusNumber,
  formatShiftStatusTime,
  latestShiftStatus,
  shiftTypeLabel,
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

function previousDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function zonedDateParts(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");

  return {
    dateValue: `${year}-${month}-${day}`,
    hour
  };
}

function currentDirectorShiftWindow(timezone: string) {
  const { dateValue, hour } = zonedDateParts(timezone);

  if (hour >= 8 && hour < 20) {
    return {
      shiftDate: dateValue,
      shiftType: "day" as ShiftStatusShiftType
    };
  }

  if (hour >= 20) {
    return {
      shiftDate: dateValue,
      shiftType: "night" as ShiftStatusShiftType
    };
  }

  return {
    shiftDate: previousDate(dateValue),
    shiftType: "night" as ShiftStatusShiftType
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

function freshnessLabel(update: ShiftStatusUpdate | null) {
  if (!update) {
    return {
      label: "Waiting for update",
      className: "border-slate-200 bg-slate-50 text-slate-600"
    };
  }

  const minutes = minutesSince(update.updated_at);
  if (minutes >= 240) {
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

function titleStatus(update: ShiftStatusUpdate | null) {
  if (!update) {
    return "No Update";
  }

  return update.rts_on >= update.rts_required ? "Staffed" : "Short";
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
  tone
}: {
  title: string;
  value: string | number;
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
    <div className={`rounded-2xl border px-3 py-3 shadow-sm ${toneClass}`}>
      <p className="text-xs font-extrabold uppercase tracking-wide opacity-80">{title}</p>
      <p className="mt-2 text-2xl font-black leading-none text-hospital-ink">{value}</p>
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
  const [currentWindow, setCurrentWindow] = useState(() => currentDirectorShiftWindow(timezone));
  const [updates, setUpdates] = useState<ShiftStatusUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const loadShiftStatus = async () => {
    setLoading(true);
    setError("");
    setCopyMessage("");
    const nextWindow = currentDirectorShiftWindow(timezone);
    setCurrentWindow(nextWindow);

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("shift_status_updates")
      .select(shiftStatusSelect)
      .eq("department_id", authContext.departmentId)
      .eq("shift_date", nextWindow.shiftDate)
      .eq("shift_type", nextWindow.shiftType)
      .order("updated_at", { ascending: false })
      .limit(3);

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
  }, [authContext.departmentId, timezone]);

  const latest = useMemo(() => latestShiftStatus(updates), [updates]);
  const shortBy = latest ? Math.max(0, latest.rts_required - latest.rts_on) : 0;
  const freshness = freshnessLabel(latest);
  const textReport = latest ? reportText(latest, timezone) : "";
  const statusLabel = titleStatus(latest);

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
              <h1 className="mt-2 text-2xl font-black leading-tight text-hospital-ink">
                Current Shift Status · {statusLabel}
              </h1>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                {shiftTypeLabel(currentWindow.shiftType)} · {formatDateLabel(currentWindow.shiftDate, timezone)}
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

          {loading && <p className="mt-4 text-sm font-bold text-slate-500">Loading shift status...</p>}

          {error && (
            <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          {!loading && !latest && !error && (
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
              <p className="text-sm font-black text-hospital-ink">
                No update has been submitted for the current shift yet.
              </p>
            </div>
          )}

          {latest && (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2">
              <StatCard
                title="RTs Scheduled"
                value={formatShiftStatusNumber(latest.rts_on)}
                tone={shortBy > 0 ? "amber" : "green"}
              />
              <StatCard title="RTs Needed" value={formatShiftStatusNumber(latest.rts_required)} tone="cyan" />
              <StatCard title="Vents" value={latest.vent_count} tone="slate" />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                <p>Last updated: {formatShiftStatusTime(latest.updated_at, timezone)}</p>
                <span aria-hidden="true">·</span>
                <p>Updated by: {updatedByName(latest)}</p>
                <span className={`rounded-full border px-2 py-1 font-black ${freshness.className}`}>
                  {freshness.label}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReportOpen((current) => !current);
                  setCopyMessage("");
                }}
                className="mt-4 min-h-11 w-full rounded-2xl border border-cyan-100 bg-white px-4 text-sm font-black text-cyan-700"
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
            </>
          )}
        </section>

        <p className="flex items-center justify-center gap-2 text-center text-xs font-bold text-slate-500">
          <Activity size={14} />
          Read-only dashboard. Updates come from the Command Center.
        </p>
      </div>
    </main>
  );
}
