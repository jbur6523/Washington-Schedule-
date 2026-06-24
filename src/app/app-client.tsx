"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { BottomNavigation, type TabId } from "@/components/BottomNavigation";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { DayScheduleCard, type ScheduleShiftFilter } from "@/components/DayScheduleCard";
import { ShiftPostCard } from "@/components/ShiftPostCard";
import { StaffDirectory } from "@/components/StaffDirectory";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import {
  adaptActiveSchedule,
  displayStaffType,
  formatShiftTime,
  shiftTypeLabels,
  type ActiveSchedule,
  type ScheduleEntryRow,
  type ScheduleVersionRow,
  type ShiftShortageRow
} from "@/lib/schedule/supabase-schedule";
import { allShiftPosts, demoSchedule, type DemoDay, type ShiftPost } from "@/data/mockSchedule";

const scheduleFilterOptions: Array<{ id: ScheduleShiftFilter; label: string }> = [
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
  { id: "all", label: "All" }
];

type AppClientProps = {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
};

type ScheduleLoadState = {
  loading: boolean;
  error: string;
  activeSchedule: ActiveSchedule | null;
  checked: boolean;
};

function Header({
  authContext,
  developmentFallback
}: {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
}) {
  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 px-4 pb-4 pt-5 backdrop-blur-xl sm:px-5">
      <div className="mx-auto max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-normal text-hospital-ink sm:text-3xl">
                Washington Schedule
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-extrabold text-cyan-700">
                <Sparkles size={13} />
                {developmentFallback ? "Demo Mode" : "Pilot"}
              </span>
            </div>
            <p className="mt-1 text-sm font-bold text-hospital-muted">
              Respiratory Department Staffing
            </p>
            <p className="mt-2 text-xs font-extrabold uppercase tracking-wide text-slate-400">
              {authContext.displayName} - {authContext.departmentName} - {authContext.role}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {authContext.role === "admin" && (
              <Link
                href="/admin"
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-3 text-xs font-extrabold text-cyan-700"
              >
                <ShieldCheck size={14} />
                Admin
              </Link>
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
        Supabase environment variables are not configured, so local development is showing demo schedule data.
      </section>
    );
  }

  if (!authContext.hasLinkedStaffProfile) {
    return (
      <section className="mb-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-bold leading-6 text-cyan-900">
        Your account is assigned to this department, but your staff profile has not been linked yet. Some staff-specific actions may be limited.
      </section>
    );
  }

  return null;
}

function Legend() {
  return (
    <details className="rounded-2xl border border-white bg-white/90 p-3 shadow-soft">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-black text-hospital-ink">
          <CalendarClock size={17} className="text-cyan-700" />
          Color legend
        </span>
        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Tap to view</span>
      </summary>
      <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Staff type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StaffTypeBadge staffType="Full-time" />
            <StaffTypeBadge staffType="Per diem" />
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            FT means full-time. PD means per diem.
          </p>
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Card meaning</p>
          <div className="mt-2 grid gap-2">
            <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">
              Light blue card = Scheduled
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
              Light green card = Available
            </div>
          </div>
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Status chips</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusChip status="Switch Requested" />
            <StatusChip status="Coverage Requested" />
            <StatusChip status="Short Shift" />
            <StatusChip status="Short Shift" intensity="critical" />
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            Switch Requested and Coverage Requested are employee request chips. Yellow Short Shift means short.
            Red Short Shift means urgently short.
          </p>
        </div>
      </div>
    </details>
  );
}

function getShiftCategory(item: { shiftTime: string; shiftCategory?: "day" | "night" }) {
  if (item.shiftCategory) {
    return item.shiftCategory;
  }

  return item.shiftTime.includes("7P") ? "night" : "day";
}

function getShiftMatches(filter: ScheduleShiftFilter) {
  return (item: { shiftTime: string; shiftCategory?: "day" | "night" }) => {
    if (filter === "all") {
      return true;
    }

    return getShiftCategory(item) === filter;
  };
}

function ScheduleSummary({
  schedule,
  selectedDay,
  shiftFilter
}: {
  schedule: DemoDay[];
  selectedDay: string;
  shiftFilter: ScheduleShiftFilter;
}) {
  const day = schedule.find((scheduleDay) => scheduleDay.day === selectedDay) ?? schedule[0];
  const matchesShift = getShiftMatches(shiftFilter);
  const scheduled = day.scheduled.filter(matchesShift).length;
  const available = day.available.filter(matchesShift).length;
  const coverageRequests = day.coverageRequests.filter(matchesShift).length;
  const shortShiftPosts = day.shiftPosts.filter(
    (post) => matchesShift(post) && post.status === "Short Shift"
  ).length;
  const switchRequests = day.shiftPosts.filter(
    (post) => matchesShift(post) && post.status === "Switch Requested"
  ).length;
  const shiftLabel =
    shiftFilter === "all" ? "All Shifts" : shiftFilter === "day" ? "Day Shift" : "Night Shift";

  return (
    <section className="rounded-2xl border border-white bg-white/95 p-3.5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-lg font-black text-hospital-ink">
          {day.day} {shiftLabel} Summary
        </h2>
        {shortShiftPosts > 0 && <StatusChip status="Short Shift" compact />}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5 text-center">
        {[
          ["Scheduled", scheduled],
          ["Available", available],
          ["Coverage", coverageRequests],
          ["Short shifts", shortShiftPosts],
          ["Switch requests", switchRequests]
        ].map(([labelText, value]) => (
          <div key={labelText} className="rounded-xl bg-slate-50 px-1.5 py-2">
            <p className="text-base font-black leading-none text-hospital-ink">{value}</p>
            <p className="mt-1 text-[9px] font-extrabold uppercase leading-3 text-slate-400">{labelText}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScheduleFilterTabs({
  shiftFilter,
  onChange
}: {
  shiftFilter: ScheduleShiftFilter;
  onChange: (filter: ScheduleShiftFilter) => void;
}) {
  return (
    <section className="rounded-3xl border border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-fuchsia-50 p-3 shadow-soft">
      <p className="px-1 pb-2 text-sm font-black uppercase tracking-wide text-hospital-ink">
        View Schedule
      </p>
      <div className="grid grid-cols-3 rounded-full border border-cyan-200 bg-white/95 p-1 shadow-sm">
        {scheduleFilterOptions.map((option) => {
          const active = option.id === shiftFilter;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`min-h-12 rounded-full px-3 text-base font-black transition ${
                active
                  ? "bg-cyan-700 text-white shadow-md shadow-cyan-900/20"
                  : "text-slate-600 hover:bg-fuchsia-50 hover:text-fuchsia-700"
              }`}
              aria-pressed={active}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ScheduleScreen({
  authContext,
  loading,
  error,
  schedule,
  developmentFallback
}: {
  authContext: AuthenticatedUserContext;
  loading: boolean;
  error: string;
  schedule: ActiveSchedule | null;
  developmentFallback?: boolean;
}) {
  const days = useMemo(
    () => (developmentFallback ? demoSchedule : schedule?.days ?? []),
    [developmentFallback, schedule]
  );
  const [shiftFilter, setShiftFilter] = useState<ScheduleShiftFilter>("day");
  const [selectedDay, setSelectedDay] = useState("");
  const [expandedDay, setExpandedDay] = useState("");
  const effectiveSelectedDay =
    days.some((day) => day.day === selectedDay) ? selectedDay : days[0]?.day ?? "";

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
          An admin needs to create and publish a schedule version before staff can view the live schedule.
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

  if (days.length === 0) {
    return (
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-xl font-black text-hospital-ink">No schedule entries.</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          The active schedule version exists, but no schedule rows have been added yet.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <ScheduleFilterTabs
        shiftFilter={shiftFilter}
        onChange={(filter) => {
          setShiftFilter(filter);
          setExpandedDay("");
        }}
      />
      <ScheduleSummary schedule={days} selectedDay={effectiveSelectedDay} shiftFilter={shiftFilter} />
      <Legend />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
            {developmentFallback ? "Demo schedule" : schedule?.version.label}
          </p>
          {authContext.role === "admin" && !developmentFallback && (
            <Link href="/admin/schedule-versions" className="text-xs font-extrabold text-cyan-700">
              Manage versions
            </Link>
          )}
        </div>
        {days.map((day) => (
          <DayScheduleCard
            key={day.day}
            day={day}
            expanded={expandedDay === day.day}
            shiftFilter={shiftFilter}
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

function ManageScheduleScreen({
  authContext,
  loading,
  error,
  schedule,
  developmentFallback
}: {
  authContext: AuthenticatedUserContext;
  loading: boolean;
  error: string;
  schedule: ActiveSchedule | null;
  developmentFallback?: boolean;
}) {
  const scheduledEntries = useMemo(() => {
    if (!schedule || !authContext.staffProfileId) {
      return [];
    }

    return schedule.entries.filter(
      (entry) => entry.staff_profile_id === authContext.staffProfileId && entry.entry_status === "scheduled"
    );
  }, [authContext.staffProfileId, schedule]);

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
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-2xl font-black text-hospital-ink">My Schedule</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">Active version: {schedule.version.label}</p>
        <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
          Switch Requested and Coverage Requested actions will connect to Supabase in the next phase.
        </p>
      </section>

      {scheduledEntries.length === 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">No scheduled shifts found for your staff profile.</p>
        </section>
      )}

      <div className="space-y-3">
        {scheduledEntries.map((entry) => (
          <article key={entry.id} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
                  {entry.day_of_week} - {entry.shift_date}
                </p>
                <h2 className="mt-1 text-xl font-black text-hospital-ink">
                  {shiftTypeLabels[entry.shift_type]}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {formatShiftTime(entry.shift_start, entry.shift_end)}
                </p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Current status: Scheduled
                </p>
              </div>
              <StaffTypeBadge staffType={displayStaffType(entry.staff_profiles)} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ShiftBoardScreen({ posts, onDemoAction }: { posts: ShiftPost[]; onDemoAction: () => void }) {
  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-rose-100 bg-rose-50/80 p-4 shadow-soft">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-rose-600">
            <AlertTriangle size={21} />
          </span>
          <div>
            <h2 className="text-lg font-black text-rose-950">Coverage board</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-rose-800">
              Active board posts will expand when staff requests are connected in the next phase.
            </p>
          </div>
        </div>
      </section>
      {posts.length === 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">No active Shift Board posts.</p>
        </section>
      )}
      {posts.map((post) => (
        <ShiftPostCard key={post.id} post={post} onDemoAction={onDemoAction} />
      ))}
    </div>
  );
}

export default function AppClient({ authContext, developmentFallback }: AppClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("schedule");
  const [modalOpen, setModalOpen] = useState(false);
  const [scheduleState, setScheduleState] = useState<ScheduleLoadState>({
    loading: !developmentFallback,
    error: "",
    activeSchedule: null,
    checked: Boolean(developmentFallback)
  });

  const loadActiveSchedule = useCallback(async () => {
    if (developmentFallback) {
      return;
    }

    setScheduleState((current) => ({ ...current, loading: true, error: "" }));

    const supabase = createClient();
    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .select("active_schedule_version_id")
      .eq("id", authContext.departmentId)
      .maybeSingle();

    if (departmentError) {
      setScheduleState({
        loading: false,
        error: "Permission denied or department schedule settings could not be loaded.",
        activeSchedule: null,
        checked: true
      });
      return;
    }

    const activeVersionId = department?.active_schedule_version_id as string | null | undefined;

    if (!activeVersionId) {
      setScheduleState({ loading: false, error: "", activeSchedule: null, checked: true });
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
        checked: true
      });
      return;
    }

    const [{ data: entries, error: entriesError }, { data: shortages, error: shortagesError }] = await Promise.all([
      supabase
        .from("schedule_entries")
        .select(
          "id, schedule_version_id, department_id, staff_profile_id, shift_date, day_of_week, shift_type, shift_start, shift_end, entry_status, staff_profiles(id, display_name, employment_type, home_assignment, is_active)"
        )
        .eq("schedule_version_id", activeVersionId)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true }),
      supabase
        .from("shift_shortages")
        .select("*")
        .eq("schedule_version_id", activeVersionId)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true })
    ]);

    if (entriesError || shortagesError) {
      setScheduleState({
        loading: false,
        error: "Schedule rows could not be loaded.",
        activeSchedule: null,
        checked: true
      });
      return;
    }

    setScheduleState({
      loading: false,
      error: "",
      activeSchedule: adaptActiveSchedule(
        version as ScheduleVersionRow,
        (entries ?? []) as ScheduleEntryRow[],
        (shortages ?? []) as ShiftShortageRow[]
      ),
      checked: true
    });
  }, [authContext.departmentId, developmentFallback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadActiveSchedule();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadActiveSchedule]);

  const shiftBoardPosts = developmentFallback
    ? allShiftPosts
    : scheduleState.activeSchedule?.shiftPosts ?? [];

  return (
    <>
      <main className="min-h-screen pb-28">
        <Header authContext={authContext} developmentFallback={developmentFallback} />
        <div className="mx-auto max-w-xl px-4 pb-5 pt-3 sm:px-5">
          <AuthNotice authContext={authContext} developmentFallback={developmentFallback} />
          {activeTab === "schedule" && (
            <ScheduleScreen
              authContext={authContext}
              loading={scheduleState.loading}
              error={scheduleState.error}
              schedule={scheduleState.activeSchedule}
              developmentFallback={developmentFallback}
            />
          )}
          {activeTab === "manage-schedule" && (
            <ManageScheduleScreen
              authContext={authContext}
              loading={scheduleState.loading}
              error={scheduleState.error}
              schedule={scheduleState.activeSchedule}
              developmentFallback={developmentFallback}
            />
          )}
          {activeTab === "shift-board" && (
            <ShiftBoardScreen posts={shiftBoardPosts} onDemoAction={() => setModalOpen(true)} />
          )}
          {activeTab === "staff" && (
            <StaffDirectory authContext={authContext} developmentFallback={developmentFallback} />
          )}
        </div>
      </main>
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <ConfirmationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
