"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Ban,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  LogOut,
  MoveRight,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Undo2,
  UserMinus,
  Users
} from "lucide-react";
import { BottomNavigation, type TabId } from "@/components/BottomNavigation";
import { CurrentShiftStatusSummary } from "@/components/CurrentShiftStatusSummary";
import { DayScheduleCard, type AvailabilityTarget, type ScheduleShiftFilter } from "@/components/DayScheduleCard";
import { GossipBoard } from "@/components/GossipBoard";
import { MySettings } from "@/components/MySettings";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ShiftPostCard } from "@/components/ShiftPostCard";
import { StaffDirectory } from "@/components/StaffDirectory";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import { hasOperationsDashboardAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import {
  adaptActiveSchedule,
  dayNameFromDate,
  displayStaffType,
  firstStaffProfile,
  firstRelatedRow,
  formatShiftTime,
  standardTimesForShiftType,
  shiftTypeLabels,
  type ActiveSchedule,
  type CoworkerTitleRow,
  type ScheduleEntryRow,
  type ScheduleVersionRow,
  type ShiftRequestRow,
  type ShiftRequestOfferRow,
  type ShiftRequestType,
  type ShiftShortageRow,
  type ShiftShortageSeverity,
  type ShiftType,
  type UserScheduleOverrideRow
} from "@/lib/schedule/supabase-schedule";
import { allShiftPosts, fallbackSchedule, type ShiftPost } from "@/data/mockSchedule";

const scheduleFilterOptions: Array<{ id: ScheduleShiftFilter; label: string }> = [
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
  { id: "all", label: "All" }
];
const emptyShiftPosts: ShiftPost[] = [];

type AppClientProps = {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
};

type ScheduleLoadState = {
  loading: boolean;
  error: string;
  activeSchedule: ActiveSchedule | null;
  timezone: string;
  checked: boolean;
};

type AddShiftForm = {
  mode: "add" | "move" | "available";
  baseEntryId?: string;
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  note: string;
};

type NoteEditorState = {
  targetKey: string;
  note: string;
};

type ShortShiftForm = {
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  severity: ShiftShortageSeverity;
  message: string;
};

type CoverageBoardAction =
  | { kind: "coverage"; post: ShiftPost }
  | { kind: "switch"; post: ShiftPost };

type ManualSwitchForm = {
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  note: string;
};

type CoverSwitchRequestChoice = "coverage" | "switch" | "both";

type CoverSwitchPostForm = {
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  note: string;
};

const emptyAddShiftForm: AddShiftForm = {
  mode: "add",
  shift_date: "",
  shift_type: "day_shift",
  shift_start: "06:30",
  shift_end: "19:00",
  note: ""
};

const emptyShortShiftForm: ShortShiftForm = {
  shift_date: "",
  shift_type: "day_shift",
  shift_start: "06:30",
  shift_end: "19:00",
  severity: "short",
  message: ""
};

const emptyManualSwitchForm: ManualSwitchForm = {
  shift_date: "",
  shift_type: "day_shift",
  shift_start: "06:30",
  shift_end: "19:00",
  note: ""
};

const emptyCoverSwitchPostForm: CoverSwitchPostForm = {
  shift_date: "",
  shift_type: "day_shift",
  shift_start: "06:30",
  shift_end: "19:00",
  note: ""
};

function applyStandardShiftTimes<T extends { shift_type: ShiftType; shift_start: string; shift_end: string }>(
  form: T,
  shiftType: ShiftType
): T {
  const standardTimes = standardTimesForShiftType(shiftType);

  return {
    ...form,
    shift_type: shiftType,
    ...(standardTimes ?? {})
  };
}

function dateOnly(value: string) {
  return new Date(`${value}T12:00:00`);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayInTimezone(timezone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function getWeekRange(dateValue: string) {
  const date = dateOnly(dateValue);
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { start: isoDate(start), end: isoDate(end) };
}

function isWithinWeek(dateValue: string, weekStart: string, weekEnd: string) {
  return dateValue >= weekStart && dateValue <= weekEnd;
}

function formatDateShort(dateValue: string) {
  const date = dateOnly(dateValue);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "numeric", day: "numeric" }).format(date);
}

function formatManageShiftDate(dateValue: string) {
  const date = dateOnly(dateValue);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(date);
}

function formatDateNumeric(dateValue: string) {
  const date = dateOnly(dateValue);
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(date);
}

function Header({
  authContext,
  developmentFallback,
  onNavigate,
  onOpenSettings
}: {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
  onNavigate: (tab: TabId) => void;
  onOpenSettings: () => void;
}) {
  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };
  const hasOperationsDashboard = hasOperationsDashboardAccess(authContext);
  const dashboardLabel =
    authContext.role === "admin"
      ? "Admin"
      : authContext.role === "lead"
        ? "Lead"
        : authContext.operationsRole === "aide"
          ? "Aide"
          : "";

  return (
    <header className="border-b border-white/70 bg-white/85 px-4 pb-4 pt-5 sm:px-5">
      <div className="mx-auto max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-normal text-hospital-ink sm:text-3xl">
                WHHS RT Schedule
              </h1>
            </div>
            <p className="mt-1 text-sm font-bold text-hospital-muted">
              Respiratory Department Staffing
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              Not the official hospital schedule.
            </p>
            <p className="mt-2 text-xs font-extrabold uppercase tracking-wide text-slate-400">
              {authContext.displayName} - {authContext.departmentName} - {authContext.role}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <NotificationCenter
              authContext={authContext}
              developmentFallback={developmentFallback}
              onNavigate={onNavigate}
            />
            {!developmentFallback && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600"
              >
                <Settings size={14} />
                My Settings
              </button>
            )}
            {!developmentFallback && (
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600"
              >
                <LogOut size={14} />
                Sign out
              </button>
            )}
            {hasOperationsDashboard && (
              <Link
                href="/operations"
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-3 text-xs font-extrabold text-cyan-700"
              >
                <ShieldCheck size={14} />
                {dashboardLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function AuthNotice({
  authContext,
  developmentFallback
}: {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
}) {
  if (developmentFallback) {
    return (
      <section className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-900">
        Schedule data is unavailable because the app configuration is incomplete.
      </section>
    );
  }

  if (authContext.hasLinkedStaffProfile) {
    return null;
  }

  return (
    <section className="mb-3 rounded-2xl border border-cyan-100 bg-white/90 px-4 py-3 text-sm font-bold leading-6 text-cyan-900">
      Your account is assigned to this department, but your staff profile has not been linked yet. Some staff-specific actions may be limited.
    </section>
  );
}

function ScheduleViewSummaryCard({
  shiftFilter,
  onChange
}: {
  shiftFilter: ScheduleShiftFilter;
  onChange: (filter: ScheduleShiftFilter) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_0_22px_rgba(139,92,246,0.28),0_18px_40px_rgba(15,23,42,0.18)] ring-1 ring-white">
      <div className="rounded-[1.35rem] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-2 shadow-[0_0_18px_rgba(139,92,246,0.2)]">
        <p className="px-1 pb-2 text-sm font-black uppercase tracking-wide text-violet-800">
          Shift View
        </p>
        <div className="grid grid-cols-3 rounded-full border-2 border-violet-300 bg-white/90 p-1.5 shadow-[0_0_16px_rgba(139,92,246,0.25)]">
          {scheduleFilterOptions.map((option) => {
            const active = option.id === shiftFilter;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange(option.id)}
                className={`min-h-11 rounded-full border px-3 text-base font-black transition active:scale-[0.98] ${
                  active
                    ? "border-violet-900 bg-violet-700 text-white shadow-lg shadow-violet-900/35 ring-2 ring-violet-200"
                    : "border-transparent bg-white text-slate-700 shadow-sm hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800"
                }`}
                aria-pressed={active}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MyStatusCard({
  authContext,
  developmentFallback,
  onSaved,
  onStatusChange
}: {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
  onSaved: () => Promise<void>;
  onStatusChange: (statusMessage: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [initialStatusMessage, setInitialStatusMessage] = useState("");
  const [loading, setLoading] = useState(!developmentFallback && Boolean(authContext.staffProfileId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    if (developmentFallback || !authContext.staffProfileId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("staff_profiles")
      .select("status_message")
      .eq("id", authContext.staffProfileId)
      .eq("department_id", authContext.departmentId)
      .maybeSingle();

    if (loadError) {
      setError("Unable to load your status.");
    } else {
      const nextStatus = ((data?.status_message as string | null) ?? "").slice(0, 100);
      setStatusMessage(nextStatus);
      setInitialStatusMessage(nextStatus);
      onStatusChange(nextStatus);
    }

    setLoading(false);
  }, [authContext.departmentId, authContext.staffProfileId, developmentFallback, onStatusChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStatus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  const saveStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (developmentFallback) {
      setError("Status updates are unavailable until the app configuration is complete.");
      return;
    }

    if (!authContext.staffProfileId) {
      setError("Your account is not linked to a staff profile yet.");
      return;
    }

    const trimmed = statusMessage.trim();

    if (trimmed.length > 100) {
      setError("Status must be 100 characters or fewer.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    const response = await fetch("/api/settings/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusMessage: trimmed })
    });
    const result = await response.json().catch(() => null);

    setSaving(false);

    if (!response.ok) {
      setError(result?.message ?? "Unable to save status.");
      return;
    }

    setStatusMessage(trimmed);
    setInitialStatusMessage(trimmed);
    onStatusChange(trimmed);
    setMessage(trimmed ? "Status updated." : "Status cleared.");
    setExpanded(false);
    await onSaved();
  };

  const clearStatus = async () => {
    setStatusMessage("");
    setMessage("");
    setError("");

    if (!initialStatusMessage) {
      return;
    }

    setSaving(true);

    const response = await fetch("/api/settings/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusMessage: "" })
    });
    const result = await response.json().catch(() => null);

    setSaving(false);

    if (!response.ok) {
      setError(result?.message ?? "Unable to clear status.");
      return;
    }

    setInitialStatusMessage("");
    onStatusChange("");
    setMessage("Status cleared.");
    setExpanded(false);
    await onSaved();
  };

  const preview = initialStatusMessage || "Add status";

  return (
    <section className="rounded-2xl border border-white bg-white/95 shadow-soft">
      <button
        type="button"
        onClick={() => {
          setExpanded((current) => !current);
          setMessage("");
          setError("");
        }}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-black text-hospital-ink">My Status</h2>
          <p
            className={`mt-0.5 truncate text-sm font-bold ${
              initialStatusMessage ? "text-slate-600" : "text-cyan-700"
            }`}
          >
            {loading ? "Loading status..." : preview}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-cyan-700">
          {initialStatusMessage ? <Pencil size={16} /> : <ChevronDown size={17} />}
        </span>
      </button>

      {message && !expanded && (
        <p role="status" className="mx-3.5 mb-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          {message}
        </p>
      )}
      {error && !expanded && (
        <p role="alert" className="mx-3.5 mb-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {error}
        </p>
      )}

      {expanded && (
        <form onSubmit={saveStatus} className="grid gap-2 border-t border-slate-100 px-3.5 pb-3.5 pt-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-bold leading-5 text-slate-500">
              Optional. Shows under your name on the schedule until you change it.
            </p>
            <span className="shrink-0 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-extrabold text-cyan-700">
              {statusMessage.length}/100
            </span>
          </div>
          <textarea
            value={statusMessage}
            onChange={(event) => {
              setStatusMessage(event.target.value.slice(0, 100));
              setMessage("");
              setError("");
            }}
            maxLength={100}
            rows={2}
            disabled={loading || saving || developmentFallback || !authContext.staffProfileId}
            placeholder="Literally dying in the IMC"
            className="min-h-16 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold leading-5 text-hospital-ink outline-none focus:border-cyan-300 disabled:opacity-60"
          />
          <p className="text-xs font-bold leading-5 text-slate-500">
            Do not include patient information.
          </p>
          {error && (
            <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="submit"
              disabled={loading || saving || developmentFallback || !authContext.staffProfileId}
              className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white shadow-sm disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => void clearStatus()}
              disabled={loading || saving || developmentFallback || !authContext.staffProfileId || (!statusMessage && !initialStatusMessage)}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600 disabled:opacity-60"
            >
              Clear
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function shiftNoteKey(staffName: string, day: string, shiftTime: string) {
  return `${staffName}-${day}-${shiftTime}`;
}

function ScheduleScreen({
  authContext,
  loading,
  error,
  schedule,
  timezone,
  developmentFallback,
  onChanged
}: {
  authContext: AuthenticatedUserContext;
  loading: boolean;
  error: string;
  schedule: ActiveSchedule | null;
  timezone: string;
  developmentFallback?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [currentUserStatusMessage, setCurrentUserStatusMessage] = useState<string | null>(null);
  const [showPastDays, setShowPastDays] = useState(false);
  const [todayValue, setTodayValue] = useState(() => todayInTimezone(timezone));
  const days = useMemo(
    () => (developmentFallback ? fallbackSchedule : schedule?.days ?? []),
    [developmentFallback, schedule]
  );
  const visibleDays = useMemo(() => {
    if (showPastDays) {
      return days;
    }

    const upcoming = days.filter((day) => !day.dateValue || day.dateValue >= todayValue);

    if (upcoming.length > 0) {
      return upcoming;
    }

    return days.length > 0 ? [days[days.length - 1]] : [];
  }, [days, showPastDays, todayValue]);
  const defaultDay = useMemo(() => {
    const today = days.find((day) => day.dateValue === todayValue);

    if (today && (showPastDays || visibleDays.some((day) => day.day === today.day))) {
      return today.day;
    }

    const upcoming = days.find((day) => day.dateValue && day.dateValue > todayValue);

    if (upcoming && visibleDays.some((day) => day.day === upcoming.day)) {
      return upcoming.day;
    }

    return visibleDays[0]?.day ?? days.at(-1)?.day ?? "";
  }, [days, showPastDays, todayValue, visibleDays]);
  const shiftNotes = useMemo(() => {
    const notes: Record<string, string> = {};
    schedule?.overrides
      .filter(
        (override) =>
          override.is_active &&
          (override.override_type === "add_self" || override.override_type === "add_available") &&
          override.note
      )
      .forEach((override) => {
        const staffProfile = firstStaffProfile(override.staff_profiles);
        const day = `${dayNameFromDate(override.shift_date)} ${new Date(`${override.shift_date}T12:00:00`).toLocaleDateString("en-US", {
          month: "numeric",
          day: "numeric"
        })}`;
        notes[shiftNoteKey(staffProfile?.display_name ?? "", day, formatShiftTime(override.shift_start, override.shift_end))] =
          override.note ?? "";
      });
    return notes;
  }, [schedule]);
  const availabilityByShift = useMemo(() => {
    const availability: Record<string, string> = {};

    if (!schedule || !authContext.staffProfileId) {
      return availability;
    }

    schedule.overrides
      .filter(
        (override) =>
          override.is_active &&
          override.override_type === "add_available" &&
          override.staff_profile_id === authContext.staffProfileId
      )
      .forEach((override) => {
        availability[
          `${override.shift_date}|${override.shift_type}|${override.shift_start.slice(0, 5)}|${override.shift_end.slice(0, 5)}`
        ] = override.id;
      });

    return availability;
  }, [authContext.staffProfileId, schedule]);
  const [shiftFilter, setShiftFilter] = useState<ScheduleShiftFilter>("day");
  const [selectedDay, setSelectedDay] = useState("");
  const [expandedDay, setExpandedDay] = useState("");
  const handleStatusChange = useCallback((nextStatusMessage: string) => {
    setCurrentUserStatusMessage(nextStatusMessage);
  }, []);
  useEffect(() => {
    const updateToday = () => setTodayValue(todayInTimezone(timezone));
    updateToday();
    const interval = window.setInterval(updateToday, 60 * 1000);

    return () => window.clearInterval(interval);
  }, [timezone]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!defaultDay) {
        setSelectedDay("");
        setExpandedDay("");
        return;
      }

      const selectedVisible = visibleDays.some((day) => day.day === selectedDay);
      const selectedDate = days.find((day) => day.day === selectedDay)?.dateValue;

      if (!selectedVisible || (!showPastDays && selectedDate && selectedDate < todayValue)) {
        setSelectedDay(defaultDay);
        setExpandedDay(defaultDay);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [days, defaultDay, selectedDay, showPastDays, todayValue, visibleDays]);
  if (loading) {
    return (
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <p className="text-sm font-bold text-slate-500">Loading schedule...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-100 bg-rose-50 p-4 shadow-soft">
        <h2 className="text-lg font-black text-rose-950">Failed to load schedule</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-rose-800">{error}</p>
      </section>
    );
  }

  if (!developmentFallback && !schedule) {
    return (
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-xl font-black text-hospital-ink">No published schedule is active yet.</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          An admin needs to create and publish a schedule version before staff can view the baseline schedule.
        </p>
        {authContext.role === "admin" && (
          <Link
            href="/admin/schedule-versions"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white"
          >
            Create Schedule Version
          </Link>
        )}
      </section>
    );
  }

  if (visibleDays.length === 0) {
    return (
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-xl font-black text-hospital-ink">No schedule entries.</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          The active schedule version exists, but no schedule rows have been added yet.
        </p>
      </section>
    );
  }

  const toggleAvailability = async (target: AvailabilityTarget, activeOverrideId?: string) => {
    if (developmentFallback) {
      setAvailabilityError("Live availability changes are unavailable until the app configuration is complete.");
      return;
    }

    if (!authContext.staffProfileId) {
      setAvailabilityError("Your account is not linked to a staff profile yet.");
      return;
    }

    if (!authContext.departmentId) {
      setAvailabilityError("Your department could not be loaded. Please sign out and back in.");
      return;
    }

    setAvailabilitySaving(true);
    setAvailabilityError("");
    setAvailabilityMessage("");

    const supabase = createClient();

    if (activeOverrideId) {
      const { error: updateError } = await supabase
        .from("user_schedule_overrides")
        .update({ is_active: false })
        .eq("id", activeOverrideId);

      setAvailabilitySaving(false);

      if (updateError) {
        setAvailabilityError("Unable to remove your availability.");
        return;
      }

      setAvailabilityMessage("Your availability was removed.");
      await onChanged();
      return;
    }

    const { error: insertError } = await supabase.from("user_schedule_overrides").insert({
      department_id: authContext.departmentId,
      staff_profile_id: authContext.staffProfileId,
      base_schedule_entry_id: null,
      override_type: "add_available",
      shift_date: target.shift_date,
      shift_type: target.shift_type,
      shift_start: target.shift_start,
      shift_end: target.shift_end,
      note: null,
      is_active: true
    });

    setAvailabilitySaving(false);

    if (insertError) {
      setAvailabilityError(
        insertError.message.includes("add_available")
          ? "Unable to add availability. The self-reported availability migration may need to be applied."
          : "Unable to add your availability. You may already be available for this shift."
      );
      return;
    }

    setAvailabilityMessage("You're marked available for this shift.");
    await onChanged();
  };

  return (
    <div className="space-y-3">
      <ScheduleViewSummaryCard
        shiftFilter={shiftFilter}
        onChange={(filter) => {
          setShiftFilter(filter);
          setExpandedDay("");
        }}
      />
      {!developmentFallback && (
        <CurrentShiftStatusSummary authContext={authContext} timezone={timezone} shiftFilter={shiftFilter} />
      )}
      <MyStatusCard
        authContext={authContext}
        developmentFallback={developmentFallback}
        onSaved={onChanged}
        onStatusChange={handleStatusChange}
      />
      {availabilityError && (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {availabilityError}
        </p>
      )}
      {availabilityMessage && (
        <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          {availabilityMessage}
        </p>
      )}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1 text-xs font-extrabold">
          <button
            type="button"
            onClick={() => setShowPastDays((current) => !current)}
            className="text-slate-500"
          >
            {showPastDays ? "Hide past days" : "Show past days"}
          </button>
          {authContext.role === "admin" && !developmentFallback && (
            <Link href="/admin/schedule-versions" className="shrink-0 text-cyan-700">
              Manage versions
            </Link>
          )}
        </div>
        {visibleDays.map((day) => (
          <DayScheduleCard
            key={day.day}
            day={day}
            expanded={expandedDay === day.day}
            shiftFilter={shiftFilter}
            currentStaffProfileId={authContext.staffProfileId}
            currentStaffStatusMessage={currentUserStatusMessage}
            shiftNotes={shiftNotes}
            availabilityByShift={availabilityByShift}
            availabilitySaving={availabilitySaving}
            onToggleAvailability={(target, activeOverrideId) => {
              void toggleAvailability(target, activeOverrideId);
            }}
            onToggle={() => {
              setSelectedDay(day.day);
              setExpandedDay((current) => (current === day.day ? "" : day.day));
            }}
          />
        ))}
      </div>
    </div>
  );
}

function getShiftTarget(shift: ScheduleEntryRow) {
  if (shift.id.startsWith("override-")) {
    return {
      schedule_entry_id: null,
      user_schedule_override_id: shift.id.replace("override-", "")
    };
  }

  return {
    schedule_entry_id: shift.id,
    user_schedule_override_id: null
  };
}

function findActiveRequest(schedule: ActiveSchedule, shift: ScheduleEntryRow, requestType: ShiftRequestType) {
  const target = getShiftTarget(shift);
  return schedule.requests.find(
    (request) =>
      request.status === "active" &&
      request.request_type === requestType &&
      request.staff_profile_id === shift.staff_profile_id &&
      (target.schedule_entry_id
        ? request.schedule_entry_id === target.schedule_entry_id
        : request.user_schedule_override_id === target.user_schedule_override_id)
  );
}

function requestLabel(requestType: ShiftRequestType) {
  if (requestType === "switch_requested") {
    return "Switch Requested";
  }

  if (requestType === "wants_off") {
    return "Wants Off";
  }

  return "Coverage Requested";
}

function requestTypesForChoice(choice: CoverSwitchRequestChoice): ShiftRequestType[] {
  if (choice === "both") {
    return ["coverage_requested", "switch_requested"];
  }

  return [choice === "coverage" ? "coverage_requested" : "switch_requested"];
}

function getRequestShift(request: ShiftRequestRow) {
  return firstRelatedRow(request.schedule_entries) ?? firstRelatedRow(request.user_schedule_overrides);
}

function getOfferShift(offer: ShiftRequestOfferRow) {
  return firstRelatedRow(offer.schedule_entries) ?? firstRelatedRow(offer.user_schedule_overrides);
}

function getRequestForOffer(schedule: ActiveSchedule, offer: ShiftRequestOfferRow) {
  return firstRelatedRow(offer.shift_requests) ?? schedule.requests.find((request) => request.id === offer.shift_request_id) ?? null;
}

function getShiftSummary(shift: {
  shift_date: string;
  shift_type: ShiftType | string;
  shift_start: string;
  shift_end: string;
}) {
  return `${formatDateShort(shift.shift_date)} ${shiftTypeLabels[shift.shift_type as ShiftType] ?? "Shift"} ${formatShiftTime(
    shift.shift_start,
    shift.shift_end
  )}`;
}

function getOfferSummary(offer: ShiftRequestOfferRow) {
  const linkedShift = getOfferShift(offer);

  if (linkedShift) {
    return getShiftSummary(linkedShift);
  }

  if (offer.offered_date && offer.offered_shift_type && offer.offered_shift_start && offer.offered_shift_end) {
    return getShiftSummary({
      shift_date: offer.offered_date,
      shift_type: offer.offered_shift_type,
      shift_start: offer.offered_shift_start,
      shift_end: offer.offered_shift_end
    });
  }

  return "selected shift";
}

function ManageScheduleScreen({
  authContext,
  loading,
  error,
  schedule,
  developmentFallback,
  onChanged
}: {
  authContext: AuthenticatedUserContext;
  loading: boolean;
  error: string;
  schedule: ActiveSchedule | null;
  developmentFallback?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddShiftForm>(emptyAddShiftForm);
  const [noteEditor, setNoteEditor] = useState<NoteEditorState | null>(null);

  const scheduledEntries = useMemo(() => {
    if (!schedule || !authContext.staffProfileId) {
      return [];
    }

    return schedule.effectiveEntries.filter(
      (entry) => entry.staff_profile_id === authContext.staffProfileId && entry.entry_status === "scheduled"
    );
  }, [authContext.staffProfileId, schedule]);

  const availabilityOverrides = useMemo(() => {
    if (!schedule || !authContext.staffProfileId) {
      return [];
    }

    return schedule.overrides.filter(
      (override) =>
        override.is_active &&
        override.override_type === "add_available" &&
        override.staff_profile_id === authContext.staffProfileId
    );
  }, [authContext.staffProfileId, schedule]);

  const removedShifts = useMemo(() => {
    if (!schedule || !authContext.staffProfileId) {
      return [];
    }

    return schedule.overrides
      .filter(
        (override) =>
          override.is_active &&
          override.override_type === "remove_self" &&
          override.staff_profile_id === authContext.staffProfileId
      )
      .map((override) => ({
        override,
        entry: schedule.entries.find((entry) => entry.id === override.base_schedule_entry_id) ?? null
      }));
  }, [authContext.staffProfileId, schedule]);

  const receivedOffers = useMemo(() => {
    if (!schedule || !authContext.staffProfileId) {
      return [];
    }

    return schedule.offers.filter((offer) => {
      const request = getRequestForOffer(schedule, offer);
      return request?.staff_profile_id === authContext.staffProfileId && offer.status === "offered";
    });
  }, [authContext.staffProfileId, schedule]);

  const sentResolvedOffers = useMemo(() => {
    if (!schedule || !authContext.staffProfileId) {
      return [];
    }

    return schedule.offers.filter(
      (offer) =>
        offer.offered_by_staff_profile_id === authContext.staffProfileId &&
        (offer.status === "accepted" || offer.status === "declined")
    );
  }, [authContext.staffProfileId, schedule]);

  const sentPendingOffers = useMemo(() => {
    if (!schedule || !authContext.staffProfileId) {
      return [];
    }

    return schedule.offers.filter(
      (offer) => offer.offered_by_staff_profile_id === authContext.staffProfileId && offer.status === "offered"
    );
  }, [authContext.staffProfileId, schedule]);

  const saveRequest = async (shift: ScheduleEntryRow, requestType: ShiftRequestType, activeRequest?: ShiftRequestRow) => {
    if (!schedule || !authContext.staffProfileId) {
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();

    if (activeRequest) {
      const { error: updateError } = await supabase
        .from("shift_requests")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", activeRequest.id);

      setSaving(false);

      if (updateError) {
        setActionError(`Unable to cancel ${requestLabel(requestType)}.`);
        return;
      }

      setSuccess(`${requestLabel(requestType)} cancelled.`);
      await onChanged();
      return;
    }

    const target = getShiftTarget(shift);
    const { error: insertError } = await supabase.from("shift_requests").insert({
      department_id: authContext.departmentId,
      staff_profile_id: authContext.staffProfileId,
      request_type: requestType,
      status: "active",
      created_by: authContext.profileId,
      ...target
    });

    setSaving(false);

    if (insertError) {
      setActionError(`Unable to save ${requestLabel(requestType)}.`);
      return;
    }

    setSuccess(`${requestLabel(requestType)} saved.`);
    await onChanged();
  };

  const respondToOffer = async (offer: ShiftRequestOfferRow, status: "accepted" | "declined") => {
    if (!schedule) {
      return;
    }

    const request = getRequestForOffer(schedule, offer);

    if (!request || request.staff_profile_id !== authContext.staffProfileId) {
      setActionError("Only the request owner can respond to this offer.");
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();
    const { error: offerError } = await supabase
      .from("shift_request_offers")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", offer.id);

    if (offerError) {
      setSaving(false);
      setActionError("Unable to update this offer.");
      return;
    }

    if (status === "accepted") {
      const { error: requestError } = await supabase
        .from("shift_requests")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", offer.shift_request_id);

      if (requestError) {
        setSaving(false);
        setActionError("Offer accepted, but the request could not be resolved.");
        return;
      }
    }

    await fetch("/api/notifications/offer-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        offer_id: offer.id,
        event_type: status === "accepted" ? "offer_accepted" : "offer_declined"
      })
    });

    setSaving(false);
    setSuccess(status === "accepted" ? "Offer accepted." : "Offer declined.");
    await onChanged();
  };

  const saveNote = async (shift: ScheduleEntryRow) => {
    if (!schedule || !noteEditor) {
      return;
    }

    const activeRequests = schedule.requests.filter((request) => {
      const target = getShiftTarget(shift);
      return (
        request.status === "active" &&
        request.staff_profile_id === shift.staff_profile_id &&
        (target.schedule_entry_id
          ? request.schedule_entry_id === target.schedule_entry_id
          : request.user_schedule_override_id === target.user_schedule_override_id)
      );
    });

    if (activeRequests.length === 0) {
      setActionError("Create a Switch Requested, Coverage Requested, or Wants Off first, then add a note.");
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("shift_requests")
      .update({ note: noteEditor.note.trim() || null })
      .in(
        "id",
        activeRequests.map((request) => request.id)
      );

    setSaving(false);

    if (updateError) {
      setActionError("Unable to save request note.");
      return;
    }

    setNoteEditor(null);
    setSuccess("Request note saved.");
    await onChanged();
  };

  const removeSelf = async (entry: ScheduleEntryRow) => {
    if (!authContext.staffProfileId) {
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();
    const { error: insertError } = await supabase.from("user_schedule_overrides").insert({
      department_id: authContext.departmentId,
      staff_profile_id: authContext.staffProfileId,
      base_schedule_entry_id: entry.id,
      override_type: "remove_self",
      shift_date: entry.shift_date,
      shift_type: entry.shift_type,
      shift_start: entry.shift_start,
      shift_end: entry.shift_end,
      is_active: true
    });

    setSaving(false);

    if (insertError) {
      setActionError("Unable to remove this shift from your app schedule.");
      return;
    }

    setSuccess("Shift removed from your app schedule.");
    await onChanged();
  };

  const undoOverride = async (overrideId: string, successMessage = "Schedule change removed.") => {
    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("user_schedule_overrides")
      .update({ is_active: false })
      .eq("id", overrideId);

    setSaving(false);

    if (updateError) {
      setActionError("Unable to undo this schedule change.");
      return;
    }

    setSuccess(successMessage);
    await onChanged();
  };

  const saveAddedShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authContext.staffProfileId) {
      setActionError("Your account is not linked to a staff profile yet.");
      return;
    }

    if (!authContext.departmentId) {
      setActionError("Your department could not be loaded. Please sign out and back in.");
      return;
    }

    if (!/^\d{2}:\d{2}$/.test(addForm.shift_start) || !/^\d{2}:\d{2}$/.test(addForm.shift_end)) {
      setActionError("Shift start and end must use HH:mm military time.");
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();
    const operations = [];

    if (addForm.mode === "available" && schedule) {
      const existingAvailability = schedule.overrides.find(
        (override) =>
          override.is_active &&
          override.override_type === "add_available" &&
          override.staff_profile_id === authContext.staffProfileId &&
          override.shift_date === addForm.shift_date &&
          override.shift_type === addForm.shift_type &&
          override.shift_start.slice(0, 5) === addForm.shift_start &&
          override.shift_end.slice(0, 5) === addForm.shift_end
      );

      if (existingAvailability) {
        setSaving(false);
        setActionError("You are already marked available for that shift.");
        return;
      }
    }

    if (addForm.mode === "move" && addForm.baseEntryId && schedule) {
      const sourceEntry = schedule.entries.find((entry) => entry.id === addForm.baseEntryId);

      if (sourceEntry) {
        operations.push(
          supabase.from("user_schedule_overrides").insert({
            department_id: authContext.departmentId,
            staff_profile_id: authContext.staffProfileId,
            base_schedule_entry_id: sourceEntry.id,
            override_type: "remove_self",
            shift_date: sourceEntry.shift_date,
            shift_type: sourceEntry.shift_type,
            shift_start: sourceEntry.shift_start,
            shift_end: sourceEntry.shift_end,
            is_active: true
          })
        );
      }
    }

    operations.push(
      supabase.from("user_schedule_overrides").insert({
        department_id: authContext.departmentId,
        staff_profile_id: authContext.staffProfileId,
        base_schedule_entry_id: null,
        override_type: addForm.mode === "available" ? "add_available" : "add_self",
        shift_date: addForm.shift_date,
        shift_type: addForm.shift_type,
        shift_start: addForm.shift_start,
        shift_end: addForm.shift_end,
        note: addForm.note.trim() || null,
        is_active: true
      })
    );

    const results = await Promise.all(operations);
    setSaving(false);

    if (results.some((result) => result.error)) {
      const failed = results.find((result) => result.error)?.error;
      setActionError(
        failed?.message.includes("add_available")
          ? "Unable to save availability. The self-reported availability migration may need to be applied."
          : "Unable to save your self-managed schedule change."
      );
      return;
    }

    setAddFormOpen(false);
    setAddForm(emptyAddShiftForm);
    setSuccess(
      addForm.mode === "move"
        ? "Shift moved in your app schedule."
        : addForm.mode === "available"
          ? "You're marked available for this shift."
          : "Shift added to your app schedule."
    );
    await onChanged();
  };

  if (developmentFallback) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-soft">
        <h2 className="text-2xl font-black text-amber-950">My Schedule</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-amber-900">
          Supabase is not configured locally, so live staff schedule entries are unavailable.
        </p>
      </section>
    );
  }

  if (!authContext.staffProfileId) {
    return (
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-2xl font-black text-hospital-ink">My Schedule</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          Your account is not linked to a staff profile yet. Ask the schedule admin to finish provisioning your profile.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <p className="text-sm font-bold text-slate-500">Loading your schedule...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-100 bg-rose-50 p-4 shadow-soft">
        <h2 className="text-lg font-black text-rose-950">Unable to load your schedule</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-rose-800">{error}</p>
      </section>
    );
  }

  if (!schedule) {
    return (
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-2xl font-black text-hospital-ink">My Schedule</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          No published schedule is active yet.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.10)]">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <CalendarDays size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-hospital-ink">My Schedule</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">Active baseline: {schedule.version.label}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setAddFormOpen((current) => !current);
              setAddForm(emptyAddShiftForm);
            }}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white shadow-lg shadow-cyan-900/15"
          >
            <Plus size={17} />
            Add Myself to Another Shift
          </button>
          <button
            type="button"
            onClick={() => {
              setAddFormOpen(true);
              setAddForm({ ...emptyAddShiftForm, mode: "available" });
            }}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 text-sm font-extrabold text-emerald-700 shadow-sm"
          >
            <Plus size={17} />
            Add Myself Available
          </button>
        </div>
        <p className="mt-3 text-xs font-bold leading-5 text-slate-500">
          Availability is self-reported.
        </p>
      </section>

      {actionError && (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {actionError}
        </p>
      )}
      {success && (
        <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          {success}
        </p>
      )}

      {receivedOffers.length > 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">Received offers</h3>
          <div className="mt-3 space-y-2">
            {receivedOffers.map((offer) => {
              const offerer = firstStaffProfile(offer.staff_profiles);
              const request = getRequestForOffer(schedule, offer);
              const requestShift = request ? getRequestShift(request) : null;
              const requestSummary = requestShift ? getShiftSummary(requestShift) : "this shift";

              return (
                <article key={offer.id} className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3">
                  <p className="text-sm font-black text-hospital-ink">
                    {offer.offer_type === "coverage"
                      ? `${offerer?.display_name ?? "A staff member"} offered to cover this shift.`
                      : `${offerer?.display_name ?? "A staff member"} offered to switch ${getOfferSummary(offer)} for your ${requestSummary}.`}
                  </p>
                  {offer.note && (
                    <p className="mt-2 rounded-xl bg-white/80 px-2.5 py-2 text-xs font-semibold leading-4 text-slate-600">
                      {offer.note}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void respondToOffer(offer, "accepted")}
                      disabled={saving}
                      className="min-h-10 rounded-2xl bg-emerald-600 px-3 text-sm font-extrabold text-white disabled:opacity-60"
                    >
                      Accept Offer
                    </button>
                    <button
                      type="button"
                      onClick={() => void respondToOffer(offer, "declined")}
                      disabled={saving}
                      className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700 disabled:opacity-60"
                    >
                      Decline Offer
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {sentResolvedOffers.length > 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">Offer status</h3>
          <div className="mt-3 space-y-2">
            {sentResolvedOffers.map((offer) => (
              <div key={offer.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                <p className="text-sm font-black text-hospital-ink">
                  Your {offer.offer_type === "coverage" ? "coverage" : "switch"} offer was {offer.status}.
                </p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  {offer.offer_type === "switch" ? getOfferSummary(offer) : "Coverage offer"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {sentPendingOffers.length > 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">Pending offers</h3>
          <div className="mt-3 space-y-2">
            {sentPendingOffers.map((offer) => (
              <div key={offer.id} className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3">
                <p className="text-sm font-black text-hospital-ink">
                  Your {offer.offer_type === "coverage" ? "coverage" : "switch"} offer is pending.
                </p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-amber-800">
                  {offer.offer_type === "switch" ? getOfferSummary(offer) : "Coverage offer"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {addFormOpen && (
        <form onSubmit={saveAddedShift} className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">
            {addForm.mode === "move"
              ? "Move Myself to Another Shift"
              : addForm.mode === "available"
                ? "Add Myself Available"
                : "Add Myself to Another Shift"}
          </h3>
          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Date</span>
              <input
                type="date"
                value={addForm.shift_date}
                onChange={(event) => setAddForm({ ...addForm, shift_date: event.target.value })}
                required
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Shift type</span>
              <select
                value={addForm.shift_type}
                onChange={(event) => setAddForm(applyStandardShiftTimes(addForm, event.target.value as ShiftType))}
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              >
                {Object.entries(shiftTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Start</span>
                <input
                  type="time"
                  value={addForm.shift_start}
                  onChange={(event) => setAddForm({ ...addForm, shift_start: event.target.value })}
                  required
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">End</span>
                <input
                  type="time"
                  value={addForm.shift_end}
                  onChange={(event) => setAddForm({ ...addForm, shift_end: event.target.value })}
                  required
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Optional note</span>
              <textarea
                value={addForm.note}
                onChange={(event) => setAddForm({ ...addForm, note: event.target.value.slice(0, 140) })}
                maxLength={140}
                className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              />
              <span className="mt-1 block text-xs font-bold text-slate-400">{addForm.note.length}/140</span>
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAddFormOpen(false)}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`min-h-11 rounded-2xl px-3 text-sm font-extrabold text-white disabled:opacity-60 ${
                addForm.mode === "available" ? "bg-emerald-600" : "bg-cyan-700"
              }`}
            >
              {saving ? "Saving..." : addForm.mode === "available" ? "Add Myself Available" : "Save Shift"}
            </button>
          </div>
        </form>
      )}

      {availabilityOverrides.length > 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">My availability</h3>
          <div className="mt-3 space-y-2">
            {availabilityOverrides.map((override) => (
              <div key={override.id} className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-hospital-ink">
                      {formatDateShort(override.shift_date)}
                    </p>
                    <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-emerald-800">
                      {shiftTypeLabels[override.shift_type]} - {formatShiftTime(override.shift_start, override.shift_end)}
                    </p>
                  </div>
                  <StatusChip status="Available" compact />
                </div>
                {override.note && (
                  <p className="mt-2 rounded-xl bg-white/70 px-2.5 py-2 text-xs font-semibold leading-4 text-slate-600">
                    {override.note}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void undoOverride(override.id, "Your availability was removed.")}
                  disabled={saving}
                  className="mt-3 min-h-10 w-full rounded-2xl border border-emerald-200 bg-white px-3 text-sm font-extrabold text-emerald-700 disabled:opacity-60"
                >
                  Remove My Availability
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {scheduledEntries.length === 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">No active shifts in your app schedule.</p>
        </section>
      )}

      <div className="space-y-3">
        {scheduledEntries.map((entry) => {
          const switchRequest = findActiveRequest(schedule, entry, "switch_requested");
          const coverageRequest = findActiveRequest(schedule, entry, "coverage_requested");
          const wantsOffRequest = findActiveRequest(schedule, entry, "wants_off");
          const targetKey = `${entry.id}-${entry.shift_date}-${entry.shift_start}`;
          const activeNote = wantsOffRequest?.note ?? switchRequest?.note ?? coverageRequest?.note ?? "";
          const selfAdded = entry.id.startsWith("override-");
          const accentClass = selfAdded
            ? "border-t-4 border-t-emerald-400"
            : entry.shift_type === "night_shift"
              ? "border-t-4 border-t-violet-500"
              : entry.shift_type === "day_shift"
                ? "border-t-4 border-t-cyan-500"
                : "border-t-4 border-t-teal-400";

          return (
            <article
              key={entry.id}
              className={`rounded-3xl border border-white bg-white/95 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.11)] ${accentClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xl font-black text-hospital-ink">
                    <CalendarDays size={18} className="shrink-0 text-cyan-700" aria-hidden="true" />
                    {formatManageShiftDate(entry.shift_date)}
                  </p>
                  <p className="mt-3 flex items-center gap-2 text-3xl font-black tracking-tight text-hospital-ink">
                    <Clock3 size={21} className="shrink-0 text-slate-400" aria-hidden="true" />
                    {formatShiftTime(entry.shift_start, entry.shift_end)}
                  </p>
                  <p className="mt-1 text-base font-extrabold text-slate-500">
                    {shiftTypeLabels[entry.shift_type]}
                  </p>
                </div>
                <StaffTypeBadge staffType={displayStaffType(entry.staff_profiles)} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {switchRequest && <StatusChip status="Switch Requested" compact />}
                {coverageRequest && <StatusChip status="Coverage Requested" compact />}
                {wantsOffRequest && <StatusChip status="Wants Off" compact />}
                {selfAdded && <StatusChip status="Self-added" compact />}
              </div>

              {activeNote && (
                <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold leading-5 text-slate-600">
                  {activeNote}
                </p>
              )}

              {noteEditor?.targetKey === targetKey && (
                <div className="mt-3">
                  <textarea
                    value={noteEditor.note}
                    onChange={(event) =>
                      setNoteEditor({ ...noteEditor, note: event.target.value.slice(0, 140) })
                    }
                    maxLength={140}
                    className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-300"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-400">{noteEditor.note.length}/140</span>
                    <button
                      type="button"
                      onClick={() => void saveNote(entry)}
                      disabled={saving}
                      className="rounded-xl bg-cyan-700 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-60"
                    >
                      Save Note
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => void saveRequest(entry, "switch_requested", switchRequest)}
                  disabled={saving}
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-extrabold shadow-sm ${
                    switchRequest
                      ? "border-fuchsia-200 bg-white text-fuchsia-700"
                      : "border-fuchsia-100 bg-fuchsia-50 text-fuchsia-700"
                  } disabled:opacity-60`}
                >
                  <ArrowLeftRight size={16} aria-hidden="true" />
                  {switchRequest ? "Cancel Switch Request" : "Request Switch"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveRequest(entry, "coverage_requested", coverageRequest)}
                  disabled={saving}
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-extrabold shadow-sm ${
                    coverageRequest
                      ? "border-violet-200 bg-white text-violet-700"
                      : "border-violet-100 bg-violet-50 text-violet-700"
                  } disabled:opacity-60`}
                >
                  <Users size={16} aria-hidden="true" />
                  {coverageRequest ? "Cancel Coverage Request" : "Request Coverage"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveRequest(entry, "wants_off", wantsOffRequest)}
                  disabled={saving}
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-extrabold shadow-sm ${
                    wantsOffRequest
                      ? "border-rose-200 bg-white text-rose-700"
                      : "border-rose-100 bg-rose-50 text-rose-700"
                  } disabled:opacity-60`}
                >
                  <Ban size={16} aria-hidden="true" />
                  {wantsOffRequest ? "Cancel Wants Off" : "Wants Off"}
                </button>
                <button
                  type="button"
                  onClick={() => setNoteEditor({ targetKey, note: activeNote })}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-extrabold text-slate-700 shadow-sm"
                >
                  <FileText size={16} aria-hidden="true" />
                  Add/Edit Note
                </button>
                {selfAdded ? (
                  <button
                    type="button"
                    onClick={() => void undoOverride(entry.id.replace("override-", ""), "Self-added shift removed.")}
                    disabled={saving}
                    className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3 text-sm font-extrabold text-cyan-700 shadow-sm disabled:opacity-60"
                  >
                    <Undo2 size={16} aria-hidden="true" />
                    Remove Self-added Shift
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void removeSelf(entry)}
                      disabled={saving}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-extrabold text-rose-700 shadow-sm disabled:opacity-60"
                    >
                      <UserMinus size={16} aria-hidden="true" />
                      Remove Myself
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddForm({
                          ...emptyAddShiftForm,
                          mode: "move",
                          baseEntryId: entry.id,
                          shift_date: entry.shift_date,
                          shift_type: entry.shift_type,
                          shift_start: entry.shift_start.slice(0, 5),
                          shift_end: entry.shift_end.slice(0, 5)
                        });
                        setAddFormOpen(true);
                      }}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3 text-sm font-extrabold text-cyan-700 shadow-sm"
                    >
                      <MoveRight size={16} aria-hidden="true" />
                      Move Myself
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {removedShifts.length > 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">Recently removed / hidden shifts</h3>
          <div className="mt-3 space-y-2">
            {removedShifts.map(({ override, entry }) => (
              <div key={override.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                <p className="text-sm font-black text-hospital-ink">
                  {entry ? `${entry.day_of_week} - ${entry.shift_date}` : override.shift_date}
                </p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  {shiftTypeLabels[override.shift_type]} - {formatShiftTime(override.shift_start, override.shift_end)}
                </p>
                <button
                  type="button"
                  onClick={() => void undoOverride(override.id, "Shift restored to your app schedule.")}
                  disabled={saving}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-100 bg-white px-3 text-sm font-extrabold text-cyan-700 disabled:opacity-60"
                >
                  <Undo2 size={15} />
                  Undo Removal
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ShiftBoardScreen({
  authContext,
  schedule,
  loading,
  error,
  developmentFallback,
  onChanged
}: {
  authContext: AuthenticatedUserContext;
  schedule: ActiveSchedule | null;
  loading: boolean;
  error: string;
  developmentFallback?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [selectedAction, setSelectedAction] = useState<CoverageBoardAction | null>(null);
  const [offerNote, setOfferNote] = useState("");
  const [manualSwitchForm, setManualSwitchForm] = useState<ManualSwitchForm>(emptyManualSwitchForm);
  const [selectedSwitchShiftId, setSelectedSwitchShiftId] = useState("");
  const [useManualSwitch, setUseManualSwitch] = useState(false);
  const [shortShiftForm, setShortShiftForm] = useState<ShortShiftForm>(emptyShortShiftForm);
  const [shortShiftOpen, setShortShiftOpen] = useState(false);
  const [postFlowOpen, setPostFlowOpen] = useState(false);
  const [selectedPostShiftId, setSelectedPostShiftId] = useState("");
  const [useManualPostDate, setUseManualPostDate] = useState(false);
  const [postRequestChoice, setPostRequestChoice] = useState<CoverSwitchRequestChoice | "">("");
  const [postForm, setPostForm] = useState<CoverSwitchPostForm>(emptyCoverSwitchPostForm);
  const [postNoteOpen, setPostNoteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const canManageShortShift = authContext.role === "admin" || authContext.role === "lead";
  const posts = developmentFallback ? allShiftPosts : schedule?.shiftPosts ?? emptyShiftPosts;
  const ownScheduledShifts = useMemo(() => {
    if (!schedule || !authContext.staffProfileId) {
      return [];
    }

    return schedule.effectiveEntries
      .filter((entry) => entry.staff_profile_id === authContext.staffProfileId && entry.entry_status === "scheduled")
      .sort((a, b) => `${a.shift_date} ${a.shift_start}`.localeCompare(`${b.shift_date} ${b.shift_start}`));
  }, [authContext.staffProfileId, schedule]);
  const visiblePosts = useMemo(
    () =>
      posts.filter((post, index) => {
        if (post.type === "Short Shift") {
          return true;
        }

        return (
          index ===
          posts.findIndex(
            (candidate) =>
              candidate.type !== "Short Shift" &&
              candidate.targetStaffProfileId === post.targetStaffProfileId &&
              candidate.day === post.day &&
              candidate.shiftTime === post.shiftTime
          )
        );
      }),
    [posts]
  );
  const selectedRequest = selectedAction?.post.shiftRequestId && schedule
    ? schedule.requests.find((request) => request.id === selectedAction.post.shiftRequestId) ?? null
    : null;
  const selectedRequestShift = selectedRequest ? getRequestShift(selectedRequest) : null;
  const selectedWeek = selectedRequestShift ? getWeekRange(selectedRequestShift.shift_date) : null;
  const selectedWeekStart = selectedWeek?.start ?? "";
  const selectedWeekEnd = selectedWeek?.end ?? "";
  const eligibleSwitchShifts =
    schedule && authContext.staffProfileId && selectedWeekStart && selectedWeekEnd
      ? schedule.effectiveEntries.filter(
          (entry) =>
            entry.staff_profile_id === authContext.staffProfileId &&
            entry.entry_status === "scheduled" &&
            isWithinWeek(entry.shift_date, selectedWeekStart, selectedWeekEnd)
        )
      : [];
  const selectedPostShift = ownScheduledShifts.find((entry) => entry.id === selectedPostShiftId) ?? null;
  const selectedPostShiftDetails = selectedPostShift
    ? {
        shift_date: selectedPostShift.shift_date,
        shift_type: selectedPostShift.shift_type,
        shift_start: selectedPostShift.shift_start,
        shift_end: selectedPostShift.shift_end
      }
    : useManualPostDate && postForm.shift_date && postForm.shift_start && postForm.shift_end
      ? {
          shift_date: postForm.shift_date,
          shift_type: postForm.shift_type,
          shift_start: postForm.shift_start,
          shift_end: postForm.shift_end
        }
      : null;
  const existingCoveragePostRequest = selectedPostShiftDetails
    ? activeRequestForShiftDetails("coverage_requested", selectedPostShiftDetails)
    : null;
  const existingSwitchPostRequest = selectedPostShiftDetails
    ? activeRequestForShiftDetails("switch_requested", selectedPostShiftDetails)
    : null;
  const canShowRequestTypeStep = Boolean(selectedPostShiftDetails);
  const canShowPostConfirmation = Boolean(selectedPostShiftDetails && postRequestChoice);
  const selectedPostRequestTypes = postRequestChoice ? requestTypesForChoice(postRequestChoice) : [];
  const missingSelectedPostRequestTypes = selectedPostRequestTypes.filter(
    (requestType) =>
      !(requestType === "coverage_requested" ? existingCoveragePostRequest : existingSwitchPostRequest)
  );
  const canConfirmPost = canShowPostConfirmation && missingSelectedPostRequestTypes.length > 0;

  const closeOfferFlow = () => {
    setSelectedAction(null);
    setOfferNote("");
    setManualSwitchForm(emptyManualSwitchForm);
    setSelectedSwitchShiftId("");
    setUseManualSwitch(false);
  };

  const resetPostFlow = () => {
    setSelectedPostShiftId("");
    setUseManualPostDate(false);
    setPostRequestChoice("");
    setPostForm(emptyCoverSwitchPostForm);
    setPostNoteOpen(false);
  };

  function activeRequestForShiftDetails(requestType: ShiftRequestType, shift: {
    shift_date: string;
    shift_type: ShiftType;
    shift_start: string;
    shift_end: string;
  }) {
    if (!schedule || !authContext.staffProfileId) {
      return null;
    }

    return (
      schedule.requests.find((request) => {
        const requestShift = getRequestShift(request);

        return (
          request.status === "active" &&
          request.request_type === requestType &&
          request.staff_profile_id === authContext.staffProfileId &&
          requestShift?.shift_date === shift.shift_date &&
          requestShift?.shift_type === shift.shift_type &&
          requestShift?.shift_start === shift.shift_start &&
          requestShift?.shift_end === shift.shift_end
        );
      }) ?? null
    );
  }

  const postCoverSwitchRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!schedule || !authContext.staffProfileId) {
      setActionError("Your staff profile must be linked before posting.");
      return;
    }

    if (!postRequestChoice) {
      setActionError("Choose coverage, switch, or both.");
      return;
    }

    const requestTypes = requestTypesForChoice(postRequestChoice);
    const selectedShift = useManualPostDate ? null : selectedPostShift;

    if (!useManualPostDate && !selectedShift) {
      setActionError("Choose one of your shifts or add a date manually.");
      return;
    }

    if (useManualPostDate && (!postForm.shift_date || !postForm.shift_start || !postForm.shift_end)) {
      setActionError("Enter a date, start time, and end time.");
      return;
    }

    const shiftDetails = selectedShift
      ? {
          shift_date: selectedShift.shift_date,
          shift_type: selectedShift.shift_type,
          shift_start: selectedShift.shift_start,
          shift_end: selectedShift.shift_end
        }
      : {
          shift_date: postForm.shift_date,
          shift_type: postForm.shift_type,
          shift_start: postForm.shift_start,
          shift_end: postForm.shift_end
        };

    const missingRequestTypes = requestTypes.filter(
      (requestType) => !activeRequestForShiftDetails(requestType, shiftDetails)
    );

    if (missingRequestTypes.length === 0) {
      setActionError("This shift is already posted to Cover/Switch.");
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();
    let target = selectedShift ? getShiftTarget(selectedShift) : { schedule_entry_id: null, user_schedule_override_id: null as string | null };

    if (useManualPostDate) {
      const { data: override, error: overrideError } = await supabase
        .from("user_schedule_overrides")
        .insert({
          department_id: authContext.departmentId,
          staff_profile_id: authContext.staffProfileId,
          base_schedule_entry_id: null,
          override_type: "add_self",
          shift_date: postForm.shift_date,
          shift_type: postForm.shift_type,
          shift_start: postForm.shift_start,
          shift_end: postForm.shift_end,
          note: postForm.note.trim() || null,
          is_active: true
        })
        .select("id")
        .single();

      if (overrideError || !override?.id) {
        setSaving(false);
        setActionError("Unable to add that manual shift.");
        return;
      }

      target = { schedule_entry_id: null, user_schedule_override_id: override.id as string };
    }

    const note = postForm.note.trim().slice(0, 140) || null;
    const requestsToInsert = [];

    for (const requestType of missingRequestTypes) {
      let reusableRequestQuery = supabase
        .from("shift_requests")
        .select("id")
        .eq("department_id", authContext.departmentId)
        .eq("staff_profile_id", authContext.staffProfileId)
        .eq("request_type", requestType)
        .neq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1);

      reusableRequestQuery = target.schedule_entry_id
        ? reusableRequestQuery.eq("schedule_entry_id", target.schedule_entry_id)
        : reusableRequestQuery.eq("user_schedule_override_id", target.user_schedule_override_id);

      const { data: reusableRequests, error: reusableError } = await reusableRequestQuery;

      if (reusableError) {
        setSaving(false);
        setActionError("Unable to check existing Cover/Switch requests.");
        return;
      }

      const reusableRequestId = reusableRequests?.[0]?.id as string | undefined;

      if (reusableRequestId) {
        const { error: updateError } = await supabase
          .from("shift_requests")
          .update({
            status: "active",
            note,
            cancelled_at: null,
            resolved_at: null
          })
          .eq("id", reusableRequestId);

        if (updateError) {
          setSaving(false);
          setActionError("Unable to reactivate this Cover/Switch request.");
          return;
        }

        continue;
      }

      requestsToInsert.push({
        department_id: authContext.departmentId,
        staff_profile_id: authContext.staffProfileId,
        request_type: requestType,
        status: "active",
        note,
        created_by: authContext.profileId,
        ...target
      });
    }

    const { error: insertError } = requestsToInsert.length > 0
      ? await supabase.from("shift_requests").insert(requestsToInsert)
      : { error: null };

    setSaving(false);

    if (insertError) {
      setActionError("Unable to post this shift. It may already be active on Cover/Switch.");
      return;
    }

    resetPostFlow();
    setPostFlowOpen(false);
    setSuccess("Posted to Cover/Switch.");
    await onChanged();
  };

  const cancelPostedRequest = async (request: ShiftRequestRow) => {
    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("shift_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", request.id);

    setSaving(false);

    if (updateError) {
      setActionError(`Unable to cancel ${requestLabel(request.request_type)}.`);
      return;
    }

    setSuccess(`${requestLabel(request.request_type)} cancelled.`);
    await onChanged();
  };

  const createRequestNotification = async (
    eventType: "coverage_offer_created" | "switch_offer_created",
    relatedEntityId: string
  ) => {
    await fetch("/api/notifications/offer-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        offer_id: relatedEntityId,
        event_type: eventType
      })
    });
  };

  const sendCoverageOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAction || !authContext.staffProfileId) {
      setActionError("Your staff profile must be linked before offering coverage.");
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();

    if (selectedAction.post.shiftShortageId) {
      const { error: shortShiftOfferError } = await supabase.from("coverage_offers").insert({
        department_id: authContext.departmentId,
        shift_request_id: null,
        shift_shortage_id: selectedAction.post.shiftShortageId,
        offered_by_staff_profile_id: authContext.staffProfileId,
        status: "offered",
        note: offerNote.trim() || null
      });

      setSaving(false);

      if (shortShiftOfferError) {
        setActionError("Unable to send offer. You may already have an active offer for this Short Shift.");
        return;
      }

      closeOfferFlow();
      setSuccess("Offer sent.");
      await onChanged();
      return;
    }

    if (!selectedRequest) {
      setSaving(false);
      setActionError("This request is no longer active.");
      return;
    }

    const { data, error: insertError } = await supabase
      .from("shift_request_offers")
      .insert({
        department_id: authContext.departmentId,
        shift_request_id: selectedRequest.id,
        offer_type: "coverage",
        offered_by_staff_profile_id: authContext.staffProfileId,
        status: "offered",
        note: offerNote.trim() || null
      })
      .select("id")
      .single();

    setSaving(false);

    if (insertError || !data?.id) {
      setActionError("Unable to send coverage offer. You may already have an active offer for this request.");
      return;
    }

    await createRequestNotification("coverage_offer_created", data.id as string);
    closeOfferFlow();
    setSuccess("Offer sent.");
    await onChanged();
  };

  const sendSwitchOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAction || !selectedRequest || !selectedRequestShift || !selectedWeek || !authContext.staffProfileId) {
      setActionError("This switch request is no longer active.");
      return;
    }

    const selectedShift = eligibleSwitchShifts.find((entry) => entry.id === selectedSwitchShiftId);

    if (!useManualSwitch && !selectedShift) {
      setActionError("Select one of your same-week shifts or use Add Date.");
      return;
    }

    if (useManualSwitch && !isWithinWeek(manualSwitchForm.shift_date, selectedWeek.start, selectedWeek.end)) {
      setActionError("Switches must be within the same week, Sunday through Saturday.");
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const offeredOverrideId = selectedShift?.id.startsWith("override-")
      ? selectedShift.id.replace("override-", "")
      : null;
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("shift_request_offers")
      .insert({
        department_id: authContext.departmentId,
        shift_request_id: selectedRequest.id,
        offer_type: "switch",
        offered_by_staff_profile_id: authContext.staffProfileId,
        offered_schedule_entry_id: !useManualSwitch && selectedShift && !selectedShift.id.startsWith("override-") ? selectedShift.id : null,
        offered_override_id: !useManualSwitch ? offeredOverrideId : null,
        offered_date: useManualSwitch ? manualSwitchForm.shift_date : null,
        offered_shift_type: useManualSwitch ? manualSwitchForm.shift_type : null,
        offered_shift_start: useManualSwitch ? manualSwitchForm.shift_start : null,
        offered_shift_end: useManualSwitch ? manualSwitchForm.shift_end : null,
        status: "offered",
        note: (useManualSwitch ? manualSwitchForm.note : offerNote).trim() || null
      })
      .select("id")
      .single();

    setSaving(false);

    if (insertError || !data?.id) {
      setActionError("Unable to send switch offer. You may already have an active offer using this shift.");
      return;
    }

    await createRequestNotification("switch_offer_created", data.id as string);
    closeOfferFlow();
    setSuccess("Switch offer sent.");
    await onChanged();
  };

  const createShortShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!schedule || !canManageShortShift) {
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const response = await fetch("/api/short-shifts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        schedule_version_id: schedule.version.id,
        shift_date: shortShiftForm.shift_date,
        shift_type: shortShiftForm.shift_type,
        shift_start: shortShiftForm.shift_start,
        shift_end: shortShiftForm.shift_end,
        severity: shortShiftForm.severity,
        message: shortShiftForm.message.trim() || null
      })
    });

    setSaving(false);

    if (!response.ok) {
      setActionError("Unable to create Short Shift alert.");
      return;
    }

    setShortShiftOpen(false);
    setShortShiftForm(emptyShortShiftForm);
    setSuccess("Short Shift alert created.");
    await onChanged();
  };

  const resolveShortShift = async (post: ShiftPost, status: "resolved" | "cancelled") => {
    if (!post.shiftShortageId || !canManageShortShift) {
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("shift_shortages")
      .update({ status })
      .eq("id", post.shiftShortageId);

    setSaving(false);

    if (updateError) {
      setActionError("Unable to update Short Shift alert.");
      return;
    }

    setSuccess(status === "resolved" ? "Short Shift resolved." : "Short Shift cancelled.");
    await onChanged();
  };

  if (loading) {
    return (
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <p className="text-sm font-bold text-slate-500">Loading Cover/Switch...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-100 bg-rose-50 p-4 shadow-soft">
        <h2 className="text-lg font-black text-rose-950">Unable to load Cover/Switch</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-rose-800">{error}</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
            <ArrowLeftRight size={21} />
          </span>
          <div>
            <h2 className="text-lg font-black text-hospital-ink">Cover/Switch</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Post a shift for coverage or switch with someone.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setPostFlowOpen((current) => {
              if (!current) {
                resetPostFlow();
              }

              return !current;
            });
            setActionError("");
            setSuccess("");
          }}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white shadow-sm"
        >
          <ArrowLeftRight size={18} />
          Offer Shift / Request Switch
        </button>
        {canManageShortShift && !developmentFallback && schedule && (
          <button
            type="button"
            onClick={() => setShortShiftOpen((current) => !current)}
            className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-2xl border border-rose-700 bg-rose-700 px-4 text-xs font-extrabold text-white shadow-sm shadow-rose-900/20"
          >
            Create Short Shift
          </button>
        )}
      </section>

      {postFlowOpen && (
        <form onSubmit={postCoverSwitchRequest} className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">Offer Shift / Request Switch</h3>

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Choose a shift</p>
              {!selectedPostShift && !useManualPostDate && ownScheduledShifts.length === 0 && (
                <p className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
                  No scheduled shifts found.
                </p>
              )}
              {!selectedPostShift && !useManualPostDate && ownScheduledShifts.length > 0 && (
                <div className="mt-2 grid gap-2">
                  {ownScheduledShifts.slice(0, 8).map((shift) => {
                    const coverageRequest = schedule ? findActiveRequest(schedule, shift, "coverage_requested") : null;
                    const switchRequest = schedule ? findActiveRequest(schedule, shift, "switch_requested") : null;
                    const selected = !useManualPostDate && selectedPostShiftId === shift.id;

                    return (
                      <button
                        key={shift.id}
                        type="button"
                        onClick={() => {
                          setSelectedPostShiftId(shift.id);
                          setUseManualPostDate(false);
                          setPostRequestChoice("");
                          setPostNoteOpen(false);
                          setPostForm({ ...emptyCoverSwitchPostForm, note: "" });
                        }}
                        className={`min-h-20 rounded-2xl border px-4 py-3 text-left shadow-[0_0_0_1px_rgba(15,23,42,0.04),0_10px_24px_rgba(15,23,42,0.10)] transition duration-150 active:scale-[1.02] ${
                          selected
                            ? "scale-[1.02] border-cyan-500 bg-cyan-50 shadow-[0_0_0_1px_rgba(8,145,178,0.18),0_0_22px_rgba(8,145,178,0.22),0_16px_30px_rgba(15,23,42,0.16)]"
                            : "border-slate-200 bg-white hover:border-cyan-300 hover:shadow-[0_0_0_1px_rgba(8,145,178,0.10),0_12px_26px_rgba(15,23,42,0.12)]"
                        }`}
                      >
                        <p className="text-sm font-black text-hospital-ink">
                          {shift.day_of_week} {formatDateNumeric(shift.shift_date)}
                        </p>
                        <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                          {shiftTypeLabels[shift.shift_type]} {formatShiftTime(shift.shift_start, shift.shift_end)}
                        </p>
                        {(coverageRequest || switchRequest) && (
                          <p className="mt-2 text-xs font-bold text-cyan-700">
                            {[
                              coverageRequest ? "Coverage already posted" : "",
                              switchRequest ? "Switch already posted" : ""
                            ].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {!selectedPostShiftDetails && (
                <button
                  type="button"
                  onClick={() => {
                    setUseManualPostDate(true);
                    setSelectedPostShiftId("");
                    setPostRequestChoice("");
                    setPostNoteOpen(false);
                  }}
                  className={`mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-2xl border px-3 text-sm font-extrabold ${
                    useManualPostDate
                      ? "border-cyan-300 bg-cyan-50 text-cyan-800"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  Add Date Manually
                </button>
              )}

              {selectedPostShiftDetails && (
                <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-hospital-ink">
                        {selectedPostShift
                          ? selectedPostShift.day_of_week
                          : dayNameFromDate(selectedPostShiftDetails.shift_date)}{" "}
                        {formatDateNumeric(selectedPostShiftDetails.shift_date)}
                      </p>
                      <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
                        {shiftTypeLabels[selectedPostShiftDetails.shift_type]}{" "}
                        {formatShiftTime(selectedPostShiftDetails.shift_start, selectedPostShiftDetails.shift_end)}
                      </p>
                      {(existingCoveragePostRequest || existingSwitchPostRequest) && (
                        <p className="mt-2 text-xs font-bold text-cyan-800">
                          {[
                            existingCoveragePostRequest ? "Coverage already posted" : "",
                            existingSwitchPostRequest ? "Switch already posted" : ""
                          ].filter(Boolean).join(" / ")}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={resetPostFlow}
                      className="shrink-0 rounded-xl border border-cyan-200 bg-white px-2 py-1 text-xs font-extrabold text-cyan-700"
                    >
                      Change
                    </button>
                  </div>
                  {(existingCoveragePostRequest || existingSwitchPostRequest) && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {existingCoveragePostRequest && (
                        <button
                          type="button"
                          onClick={() => void cancelPostedRequest(existingCoveragePostRequest)}
                          disabled={saving}
                          className="min-h-9 rounded-xl border border-cyan-200 bg-white px-2 text-xs font-extrabold text-cyan-800 disabled:opacity-60"
                        >
                          Cancel Coverage Request
                        </button>
                      )}
                      {existingSwitchPostRequest && (
                        <button
                          type="button"
                          onClick={() => void cancelPostedRequest(existingSwitchPostRequest)}
                          disabled={saving}
                          className="min-h-9 rounded-xl border border-cyan-200 bg-white px-2 text-xs font-extrabold text-cyan-800 disabled:opacity-60"
                        >
                          Cancel Switch Request
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {useManualPostDate && (
              <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Date</span>
                  <input
                    type="date"
                    value={postForm.shift_date}
                    onChange={(event) => {
                      setPostForm({ ...postForm, shift_date: event.target.value });
                      setPostRequestChoice("");
                      setPostNoteOpen(false);
                    }}
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Shift type</span>
                  <select
                    value={postForm.shift_type}
                    onChange={(event) => {
                      setPostForm(applyStandardShiftTimes(postForm, event.target.value as ShiftType));
                      setPostRequestChoice("");
                      setPostNoteOpen(false);
                    }}
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  >
                    {Object.entries(shiftTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Start</span>
                    <input
                      type="time"
                      value={postForm.shift_start}
                      onChange={(event) => {
                        setPostForm({ ...postForm, shift_start: event.target.value });
                        setPostRequestChoice("");
                        setPostNoteOpen(false);
                      }}
                      className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">End</span>
                    <input
                      type="time"
                      value={postForm.shift_end}
                      onChange={(event) => {
                        setPostForm({ ...postForm, shift_end: event.target.value });
                        setPostRequestChoice("");
                        setPostNoteOpen(false);
                      }}
                      className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    />
                  </label>
                </div>
              </div>
            )}

            {canShowRequestTypeStep && (
            <div className="rounded-2xl border border-slate-100 bg-white px-3 py-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">What would you like to do?</p>
              <div className="mt-2 grid gap-2">
                {[
                  ["coverage", "Ask for Coverage", "Coverage: someone works this shift for you."],
                  ["switch", "Ask for Switch", "Switch: trade this shift for one of theirs."],
                  ["both", "Both", "Open to coverage or a switch."]
                ].map(([value, label, helper]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setPostRequestChoice(value as CoverSwitchRequestChoice);
                      setPostNoteOpen(false);
                    }}
                    className={`min-h-20 rounded-2xl border px-4 py-3 text-left shadow-[0_0_0_1px_rgba(15,23,42,0.04),0_10px_24px_rgba(15,23,42,0.10)] transition duration-150 active:scale-[1.02] ${
                      postRequestChoice === value
                        ? "scale-[1.02] border-cyan-500 bg-cyan-50 shadow-[0_0_0_1px_rgba(8,145,178,0.18),0_0_22px_rgba(8,145,178,0.22),0_16px_30px_rgba(15,23,42,0.16)]"
                        : "border-slate-200 bg-white hover:border-cyan-300 hover:shadow-[0_0_0_1px_rgba(8,145,178,0.10),0_12px_26px_rgba(15,23,42,0.12)]"
                    }`}
                  >
                    <span className="block text-sm font-black text-hospital-ink">{label}</span>
                    <span className="mt-0.5 block text-xs font-bold text-slate-500">{helper}</span>
                  </button>
                ))}
              </div>
            </div>
            )}

            {canShowPostConfirmation && selectedPostShiftDetails && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50/90 px-3 py-3 shadow-[0_0_0_1px_rgba(124,58,237,0.08),0_0_24px_rgba(139,92,246,0.20),0_16px_34px_rgba(15,23,42,0.12)]">
                <p className="text-xs font-extrabold uppercase tracking-wide text-violet-700">Confirm</p>
                <p className="mt-2 text-sm font-black text-hospital-ink">
                  {selectedPostShift
                    ? selectedPostShift.day_of_week
                    : dayNameFromDate(selectedPostShiftDetails.shift_date)}{" "}
                  {formatDateNumeric(selectedPostShiftDetails.shift_date)}
                </p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
                  {shiftTypeLabels[selectedPostShiftDetails.shift_type]}{" "}
                  {formatShiftTime(selectedPostShiftDetails.shift_start, selectedPostShiftDetails.shift_end)}
                </p>
                <p className="mt-3 text-sm font-bold leading-6 text-violet-950">
                  {postRequestChoice === "coverage" && "You are asking for coverage for this shift."}
                  {postRequestChoice === "switch" && "You are asking to switch this shift."}
                  {postRequestChoice === "both" && "You are open to coverage or a switch for this shift."}
                </p>
                {missingSelectedPostRequestTypes.length === 0 && (
                  <p className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                    This request type is already active. Use the cancel button above if you need to remove it.
                  </p>
                )}

                {!postNoteOpen && (
                  <button
                    type="button"
                    onClick={() => setPostNoteOpen(true)}
                    className="mt-3 min-h-10 w-full rounded-2xl border border-violet-200 bg-white px-3 text-sm font-extrabold text-violet-800 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition active:scale-[0.99]"
                  >
                    Add Optional Note
                  </button>
                )}

                {postNoteOpen && (
                  <label className="mt-3 block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-violet-700">Optional note</span>
                    <textarea
                      value={postForm.note}
                      onChange={(event) => setPostForm({ ...postForm, note: event.target.value.slice(0, 140) })}
                      placeholder="Anything people should know?"
                      maxLength={140}
                      className="mt-2 min-h-20 w-full rounded-2xl border border-violet-100 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-violet-300"
                    />
                    <span className="mt-1 flex justify-between text-xs font-bold text-slate-500">
                      <span>Do not include patient information.</span>
                      <span>{postForm.note.length}/140</span>
                    </span>
                    {postForm.note && (
                      <button
                        type="button"
                        onClick={() => setPostForm({ ...postForm, note: "" })}
                        className="mt-2 text-xs font-extrabold text-violet-700"
                      >
                        Clear note
                      </button>
                    )}
                  </label>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetPostFlow();
                      setPostFlowOpen(false);
                    }}
                    className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition active:scale-[0.99]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !canConfirmPost}
                    className="min-h-12 rounded-2xl bg-violet-700 px-4 text-sm font-extrabold text-white shadow-[0_0_0_1px_rgba(124,58,237,0.18),0_0_20px_rgba(139,92,246,0.28),0_14px_28px_rgba(91,33,182,0.24)] transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {saving ? "Confirming..." : "Confirm"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      )}

      {actionError && (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {actionError}
        </p>
      )}
      {success && (
        <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          {success}
        </p>
      )}

      {shortShiftOpen && (
        <form onSubmit={createShortShift} className="rounded-3xl border border-rose-100 bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">Create Short Shift</h3>
          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Date</span>
              <input
                type="date"
                value={shortShiftForm.shift_date}
                onChange={(event) => setShortShiftForm({ ...shortShiftForm, shift_date: event.target.value })}
                required
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Shift type</span>
              <select
                value={shortShiftForm.shift_type}
                onChange={(event) =>
                  setShortShiftForm(applyStandardShiftTimes(shortShiftForm, event.target.value as ShiftType))
                }
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              >
                {Object.entries(shiftTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Start</span>
                <input
                  type="time"
                  value={shortShiftForm.shift_start}
                  onChange={(event) => setShortShiftForm({ ...shortShiftForm, shift_start: event.target.value })}
                  required
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">End</span>
                <input
                  type="time"
                  value={shortShiftForm.shift_end}
                  onChange={(event) => setShortShiftForm({ ...shortShiftForm, shift_end: event.target.value })}
                  required
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Severity</span>
              <select
                value={shortShiftForm.severity}
                onChange={(event) =>
                  setShortShiftForm({ ...shortShiftForm, severity: event.target.value as ShiftShortageSeverity })
                }
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              >
                <option value="short">Short</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Message</span>
              <textarea
                value={shortShiftForm.message}
                onChange={(event) => setShortShiftForm({ ...shortShiftForm, message: event.target.value.slice(0, 140) })}
                maxLength={140}
                className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              />
              <span className="mt-1 block text-xs font-bold text-slate-400">{shortShiftForm.message.length}/140</span>
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShortShiftOpen(false)}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-2xl bg-rose-700 px-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Create Alert"}
            </button>
          </div>
        </form>
      )}

      {visiblePosts.length === 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-black text-hospital-ink">No active Cover/Switch posts yet.</p>
          <p className="mt-1 text-sm font-bold text-slate-500">Post one of your shifts above.</p>
        </section>
      )}

      {visiblePosts.map((post) => {
        const siblingCoveragePost = posts.find(
          (candidate) =>
            candidate.type === "Coverage Requested" &&
            candidate.targetStaffProfileId === post.targetStaffProfileId &&
            candidate.day === post.day &&
            candidate.shiftTime === post.shiftTime
        );
        const siblingWantsOffPost = posts.find(
          (candidate) =>
            candidate.type === "Wants Off" &&
            candidate.targetStaffProfileId === post.targetStaffProfileId &&
            candidate.day === post.day &&
            candidate.shiftTime === post.shiftTime
        );
        const siblingSwitchPost = posts.find(
          (candidate) =>
            candidate.type === "Switch Requested" &&
            candidate.targetStaffProfileId === post.targetStaffProfileId &&
            candidate.day === post.day &&
            candidate.shiftTime === post.shiftTime
        );
        const relatedStatuses = Array.from(
          new Set(
            posts
              .filter(
                (candidate) =>
                  candidate.type !== "Short Shift" &&
                  candidate.targetStaffProfileId === post.targetStaffProfileId &&
                  candidate.day === post.day &&
                  candidate.shiftTime === post.shiftTime
              )
              .map((candidate) => candidate.status)
          )
        );
        const coverageRequestPost = siblingCoveragePost ?? siblingWantsOffPost;
        const coverageOfferSent = Boolean(
          coverageRequestPost?.shiftRequestId &&
            schedule?.offers.some(
              (offer) =>
                offer.shift_request_id === coverageRequestPost.shiftRequestId &&
                offer.offer_type === "coverage" &&
                offer.offered_by_staff_profile_id === authContext.staffProfileId &&
                offer.status === "offered"
            )
        );
        const switchOfferSent = Boolean(
          siblingSwitchPost?.shiftRequestId &&
            schedule?.offers.some(
              (offer) =>
                offer.shift_request_id === siblingSwitchPost.shiftRequestId &&
                offer.offer_type === "switch" &&
                offer.offered_by_staff_profile_id === authContext.staffProfileId &&
                offer.status === "offered"
            )
        );
        const ownRequest = post.targetStaffProfileId === authContext.staffProfileId;

        return (
          <ShiftPostCard
            key={post.id}
            post={post}
            relatedStatuses={post.type === "Short Shift" ? undefined : relatedStatuses}
            coverageActionLabel={ownRequest && post.type !== "Short Shift" ? "Your request" : coverageOfferSent ? "Offer sent" : undefined}
            switchActionLabel={ownRequest ? "Your request" : switchOfferSent ? "Offer sent" : undefined}
            coverageActionDisabled={(ownRequest && post.type !== "Short Shift") || coverageOfferSent}
            switchActionDisabled={ownRequest || switchOfferSent}
            onOfferCoverage={
              post.type === "Short Shift"
                ? () => {
                    setSelectedAction({ kind: "coverage", post });
                    setOfferNote("");
                  }
                : siblingCoveragePost
                  ? () => {
                      setSelectedAction({ kind: "coverage", post: siblingCoveragePost });
                      setOfferNote("");
                    }
                  : siblingWantsOffPost
                    ? () => {
                        setSelectedAction({ kind: "coverage", post: siblingWantsOffPost });
                        setOfferNote("");
                      }
                    : undefined
            }
            onOfferSwitch={
              siblingSwitchPost
                ? () => {
                    setSelectedAction({ kind: "switch", post: siblingSwitchPost });
                    setOfferNote("");
                    setManualSwitchForm(emptyManualSwitchForm);
                    setSelectedSwitchShiftId("");
                    setUseManualSwitch(false);
                  }
                : undefined
            }
            onResolve={
              canManageShortShift && post.shiftShortageId
                ? () => void resolveShortShift(post, "resolved")
                : undefined
            }
            onCancelShortShift={
              canManageShortShift && post.shiftShortageId
                ? () => void resolveShortShift(post, "cancelled")
                : undefined
            }
          />
        );
      })}

      {selectedAction?.kind === "coverage" && (
        <form onSubmit={sendCoverageOffer} className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">
            {selectedAction.post.shiftShortageId ? "I Can Cover" : "Offer Coverage"}
          </h3>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
            {selectedAction.post.shiftShortageId
              ? `You are offering to help with ${selectedAction.post.day} ${selectedAction.post.shiftTypeLabel ?? "Shift"}.`
              : `You are offering to cover ${selectedAction.post.postedBy}'s ${selectedAction.post.day} ${selectedAction.post.shiftTypeLabel ?? "Shift"} shift.`}
          </p>
          <textarea
            value={offerNote}
            onChange={(event) => setOfferNote(event.target.value.slice(0, 140))}
            maxLength={140}
            placeholder="Optional note"
            className="mt-3 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-400">{offerNote.length}/140</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeOfferFlow}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-cyan-700 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-60"
              >
                Send Offer
              </button>
            </div>
          </div>
        </form>
      )}

      {selectedAction?.kind === "switch" && selectedRequestShift && selectedWeek && (
        <form onSubmit={sendSwitchOffer} className="rounded-3xl border border-fuchsia-100 bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">Offer Switch</h3>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
            What shift would you like to switch with {selectedAction.post.postedBy}?
          </p>
          <p className="mt-2 rounded-2xl bg-fuchsia-50 px-3 py-2 text-xs font-bold leading-5 text-fuchsia-900">
            Same-week rule: {formatDateShort(selectedWeek.start)} through {formatDateShort(selectedWeek.end)}.
          </p>

          <div className="mt-4 space-y-2">
            {eligibleSwitchShifts.length === 0 && !useManualSwitch && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                No eligible same-week shifts found. Use Add Date if your app schedule is not current.
              </p>
            )}
            {!useManualSwitch &&
              eligibleSwitchShifts.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedSwitchShiftId(entry.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left ${
                    selectedSwitchShiftId === entry.id
                      ? "border-fuchsia-200 bg-fuchsia-50"
                      : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-black text-hospital-ink">{getShiftSummary(entry)}</p>
                  <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                    Source: {entry.id.startsWith("override-") ? "Self-added" : "Published schedule"}
                  </p>
                </button>
              ))}
          </div>

          <button
            type="button"
            onClick={() => setUseManualSwitch((current) => !current)}
            className="mt-3 min-h-10 w-full rounded-2xl border border-fuchsia-100 bg-fuchsia-50 px-3 text-sm font-extrabold text-fuchsia-700"
          >
            {useManualSwitch ? "Use My Listed Shifts" : "Add Date"}
          </button>

          {useManualSwitch && (
            <div className="mt-3 grid gap-3">
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Date</span>
                <input
                  type="date"
                  value={manualSwitchForm.shift_date}
                  onChange={(event) => setManualSwitchForm({ ...manualSwitchForm, shift_date: event.target.value })}
                  required
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
              {manualSwitchForm.shift_date &&
                !isWithinWeek(manualSwitchForm.shift_date, selectedWeek.start, selectedWeek.end) && (
                  <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                    Switches must be within the same week, Sunday through Saturday.
                  </p>
                )}
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Shift type</span>
                <select
                  value={manualSwitchForm.shift_type}
                  onChange={(event) =>
                    setManualSwitchForm(applyStandardShiftTimes(manualSwitchForm, event.target.value as ShiftType))
                  }
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                >
                  {Object.entries(shiftTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Start</span>
                  <input
                    type="time"
                    value={manualSwitchForm.shift_start}
                    onChange={(event) => setManualSwitchForm({ ...manualSwitchForm, shift_start: event.target.value })}
                    required
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">End</span>
                  <input
                    type="time"
                    value={manualSwitchForm.shift_end}
                    onChange={(event) => setManualSwitchForm({ ...manualSwitchForm, shift_end: event.target.value })}
                    required
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Optional note</span>
                <textarea
                  value={manualSwitchForm.note}
                  onChange={(event) => setManualSwitchForm({ ...manualSwitchForm, note: event.target.value.slice(0, 140) })}
                  maxLength={140}
                  className="mt-1 min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
                <span className="mt-1 block text-xs font-bold text-slate-400">{manualSwitchForm.note.length}/140</span>
              </label>
            </div>
          )}

          <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold leading-6 text-slate-600">
            {authContext.displayName} will switch{" "}
            {useManualSwitch
              ? manualSwitchForm.shift_date
                ? getShiftSummary({
                    shift_date: manualSwitchForm.shift_date,
                    shift_type: manualSwitchForm.shift_type,
                    shift_start: manualSwitchForm.shift_start,
                    shift_end: manualSwitchForm.shift_end
                  })
                : "the shift you enter"
              : eligibleSwitchShifts.find((entry) => entry.id === selectedSwitchShiftId)
                ? getShiftSummary(eligibleSwitchShifts.find((entry) => entry.id === selectedSwitchShiftId) as ScheduleEntryRow)
                : "your selected shift"}{" "}
            for {selectedAction.post.postedBy}&apos;s {getShiftSummary(selectedRequestShift)}.
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeOfferFlow}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-fuchsia-700 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-60"
            >
              Send Switch Offer
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function AppClient({ authContext, developmentFallback }: AppClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("schedule");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduleState, setScheduleState] = useState<ScheduleLoadState>({
    loading: !developmentFallback,
    error: "",
    activeSchedule: null,
    timezone: "America/Los_Angeles",
    checked: Boolean(developmentFallback)
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const tab = new URLSearchParams(window.location.search).get("tab");

      if (tab === "cover-switch" || tab === "shift-board") {
        setActiveTab("shift-board");
      } else if (tab === "gossip" || tab === "manage-schedule" || tab === "staff" || tab === "schedule") {
        setActiveTab(tab);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const loadActiveSchedule = useCallback(async () => {
    if (developmentFallback) {
      return;
    }

    setScheduleState((current) => ({ ...current, loading: true, error: "" }));

    const supabase = createClient();
    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .select("active_schedule_version_id, timezone")
      .eq("id", authContext.departmentId)
      .maybeSingle();
    const timezone = (department?.timezone as string | null | undefined) || "America/Los_Angeles";

    if (departmentError) {
      setScheduleState({
        loading: false,
        error: "Permission denied or department schedule settings could not be loaded.",
        activeSchedule: null,
        timezone,
        checked: true
      });
      return;
    }

    const activeVersionId = department?.active_schedule_version_id as string | null | undefined;

    if (!activeVersionId) {
      setScheduleState({ loading: false, error: "", activeSchedule: null, timezone, checked: true });
      return;
    }

    const { data: version, error: versionError } = await supabase
      .from("schedule_versions")
      .select("*")
      .eq("id", activeVersionId)
      .eq("status", "published")
      .maybeSingle();

    if (versionError || !version) {
      setScheduleState({
        loading: false,
        error: "The active schedule version could not be loaded.",
        activeSchedule: null,
        timezone,
        checked: true
      });
      return;
    }

    const [
      { data: entries, error: entriesError },
      { data: shortages, error: shortagesError },
      { data: overrides, error: overridesError },
      { data: requests, error: requestsError },
      { data: offers, error: offersError },
      { data: coworkerTitles, error: coworkerTitlesError }
    ] = await Promise.all([
      supabase
        .from("schedule_entries")
        .select(
          "id, schedule_version_id, department_id, staff_profile_id, shift_date, day_of_week, shift_type, shift_start, shift_end, entry_status, is_shift_lead, staff_profiles(id, display_name, employment_type, home_assignment, is_active, status_message, status_updated_at)"
        )
        .eq("schedule_version_id", activeVersionId)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true }),
      supabase
        .from("shift_shortages")
        .select("id, schedule_version_id, department_id, shift_date, shift_type, shift_start, shift_end, severity, status, message, created_by")
        .eq("schedule_version_id", activeVersionId)
        .eq("status", "active")
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true }),
      supabase
        .from("user_schedule_overrides")
        .select(
          "id, department_id, staff_profile_id, base_schedule_entry_id, override_type, shift_date, shift_type, shift_start, shift_end, note, is_active, created_at, updated_at, staff_profiles(id, display_name, employment_type, home_assignment, is_active, status_message, status_updated_at)"
        )
        .eq("department_id", authContext.departmentId)
        .eq("is_active", true)
        .order("shift_date", { ascending: true }),
      supabase
        .from("shift_requests")
        .select(
          "id, department_id, schedule_entry_id, user_schedule_override_id, staff_profile_id, request_type, status, note, created_at, updated_at, staff_profiles(id, display_name, employment_type, home_assignment, is_active), schedule_entries(id, shift_date, day_of_week, shift_type, shift_start, shift_end), user_schedule_overrides(id, shift_date, shift_type, shift_start, shift_end)"
        )
        .eq("department_id", authContext.departmentId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
      ,
      supabase
        .from("shift_request_offers")
        .select(
          "id, department_id, shift_request_id, offer_type, offered_by_staff_profile_id, offered_schedule_entry_id, offered_override_id, offered_date, offered_shift_type, offered_shift_start, offered_shift_end, note, status, created_at, updated_at, responded_at, staff_profiles(id, display_name, employment_type, home_assignment, is_active), shift_requests(id, department_id, schedule_entry_id, user_schedule_override_id, staff_profile_id, request_type, status, note, created_at, updated_at, staff_profiles(id, display_name, employment_type, home_assignment, is_active), schedule_entries(id, shift_date, day_of_week, shift_type, shift_start, shift_end), user_schedule_overrides(id, shift_date, shift_type, shift_start, shift_end)), schedule_entries(id, shift_date, day_of_week, shift_type, shift_start, shift_end), user_schedule_overrides(id, shift_date, shift_type, shift_start, shift_end)"
        )
        .eq("department_id", authContext.departmentId)
        .in("status", ["offered", "accepted", "declined"])
        .order("created_at", { ascending: false })
      ,
      authContext.staffProfileId
        ? supabase
            .from("coworker_titles")
            .select("id, department_id, owner_staff_profile_id, target_staff_profile_id, title, title_key, custom_title, custom_icon, is_custom")
            .eq("department_id", authContext.departmentId)
            .eq("owner_staff_profile_id", authContext.staffProfileId)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (entriesError || shortagesError || overridesError || requestsError || offersError || coworkerTitlesError) {
      setScheduleState({
        loading: false,
        error: "Schedule coordination data could not be loaded. Confirm required migrations are applied.",
        activeSchedule: null,
        timezone,
        checked: true
      });
      return;
    }

    setScheduleState({
      loading: false,
      error: "",
      timezone,
      activeSchedule: adaptActiveSchedule(
        version as ScheduleVersionRow,
        (entries ?? []) as ScheduleEntryRow[],
        (shortages ?? []) as ShiftShortageRow[],
        (overrides ?? []) as UserScheduleOverrideRow[],
        (requests ?? []) as ShiftRequestRow[],
        (offers ?? []) as ShiftRequestOfferRow[],
        (coworkerTitles ?? []) as CoworkerTitleRow[]
      ),
      checked: true
    });
  }, [authContext.departmentId, authContext.staffProfileId, developmentFallback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadActiveSchedule();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadActiveSchedule]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const timer = window.setTimeout(() => {
        void navigator.serviceWorker.register("/sw.js");
      }, 0);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, []);

  return (
    <>
      <main className="min-h-screen pb-28">
        <Header
          authContext={authContext}
          developmentFallback={developmentFallback}
          onNavigate={setActiveTab}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="mx-auto max-w-xl px-4 pb-5 pt-3 sm:px-5">
          <AuthNotice authContext={authContext} developmentFallback={developmentFallback} />
          {activeTab === "schedule" && (
            <ScheduleScreen
              authContext={authContext}
              loading={scheduleState.loading}
              error={scheduleState.error}
              schedule={scheduleState.activeSchedule}
              timezone={scheduleState.timezone}
              developmentFallback={developmentFallback}
              onChanged={loadActiveSchedule}
            />
          )}
          {activeTab === "manage-schedule" && (
            <ManageScheduleScreen
              authContext={authContext}
              loading={scheduleState.loading}
              error={scheduleState.error}
              schedule={scheduleState.activeSchedule}
              developmentFallback={developmentFallback}
              onChanged={loadActiveSchedule}
            />
          )}
          {activeTab === "shift-board" && (
            <ShiftBoardScreen
              authContext={authContext}
              schedule={scheduleState.activeSchedule}
              loading={scheduleState.loading}
              error={scheduleState.error}
              developmentFallback={developmentFallback}
              onChanged={loadActiveSchedule}
            />
          )}
          {activeTab === "gossip" && (
            <GossipBoard authContext={authContext} developmentFallback={developmentFallback} />
          )}
          {activeTab === "staff" && (
            <div className="space-y-4">
              <StaffDirectory authContext={authContext} developmentFallback={developmentFallback} />
            </div>
          )}
        </div>
      </main>
      {settingsOpen && (
        <MySettings
          authContext={authContext}
          developmentFallback={developmentFallback}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}
