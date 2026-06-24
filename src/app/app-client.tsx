"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, LogOut, Plus, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import { BottomNavigation, type TabId } from "@/components/BottomNavigation";
import { DayScheduleCard, type ScheduleShiftFilter } from "@/components/DayScheduleCard";
import { ShiftPostCard } from "@/components/ShiftPostCard";
import { StaffDirectory } from "@/components/StaffDirectory";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import {
  adaptActiveSchedule,
  dayNameFromDate,
  displayStaffType,
  firstStaffProfile,
  formatShiftTime,
  shiftTypeLabels,
  type ActiveSchedule,
  type ScheduleEntryRow,
  type ScheduleVersionRow,
  type ShiftRequestRow,
  type ShiftRequestType,
  type ShiftShortageRow,
  type ShiftShortageSeverity,
  type ShiftType,
  type UserScheduleOverrideRow
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

type AddShiftForm = {
  mode: "add" | "move";
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

const emptyAddShiftForm: AddShiftForm = {
  mode: "add",
  shift_date: "",
  shift_type: "day_shift",
  shift_start: "07:00",
  shift_end: "19:00",
  note: ""
};

const emptyShortShiftForm: ShortShiftForm = {
  shift_date: "",
  shift_type: "day_shift",
  shift_start: "07:00",
  shift_end: "19:00",
  severity: "short",
  message: ""
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

  return (
    <div className="mb-3 space-y-2">
      <section className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-xs font-extrabold uppercase leading-5 tracking-wide text-cyan-900">
        Not the official hospital schedule. Staff-managed coordination view only.
      </section>
      {!authContext.hasLinkedStaffProfile && (
        <section className="rounded-2xl border border-cyan-100 bg-white/90 px-4 py-3 text-sm font-bold leading-6 text-cyan-900">
          Your account is assigned to this department, but your staff profile has not been linked yet. Some staff-specific actions may be limited.
        </section>
      )}
    </div>
  );
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
            <StatusChip status="Self-added" />
            <StatusChip status="Short Shift" />
            <StatusChip status="Short Shift" intensity="critical" />
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            Switch Requested and Coverage Requested are employee request chips. Self-added is a staff-managed app change.
            Yellow Short Shift means short. Red Short Shift means urgent.
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
  const coverageRequests = day.shiftPosts.filter(
    (post) => matchesShift(post) && post.status === "Coverage Requested"
  ).length;
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

function shiftNoteKey(staffName: string, day: string, shiftTime: string) {
  return `${staffName}-${day}-${shiftTime}`;
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
  const shiftNotes = useMemo(() => {
    const notes: Record<string, string> = {};
    schedule?.overrides
      .filter((override) => override.is_active && override.override_type === "add_self" && override.note)
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
            shiftNotes={shiftNotes}
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
  return requestType === "switch_requested" ? "Switch Requested" : "Coverage Requested";
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
      setActionError("Create a Switch Requested or Coverage Requested first, then add a note.");
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

  const undoOverride = async (overrideId: string) => {
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

    setSuccess("Schedule change undone.");
    await onChanged();
  };

  const saveAddedShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authContext.staffProfileId) {
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();
    const operations = [];

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
        override_type: "add_self",
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
      setActionError("Unable to save your self-managed schedule change.");
      return;
    }

    setAddFormOpen(false);
    setAddForm(emptyAddShiftForm);
    setSuccess(addForm.mode === "move" ? "Shift moved in your app schedule." : "Shift added to your app schedule.");
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
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-2xl font-black text-hospital-ink">My Schedule</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">Active baseline: {schedule.version.label}</p>
        <p className="mt-3 rounded-2xl bg-cyan-50 px-3 py-2 text-xs font-bold leading-5 text-cyan-900">
          Not the official hospital schedule. Staff-managed coordination view only.
        </p>
        <button
          type="button"
          onClick={() => {
            setAddFormOpen((current) => !current);
            setAddForm(emptyAddShiftForm);
          }}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white"
        >
          <Plus size={16} />
          Add Myself to Another Shift
        </button>
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

      {addFormOpen && (
        <form onSubmit={saveAddedShift} className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">
            {addForm.mode === "move" ? "Move Myself to Another Shift" : "Add Myself to Another Shift"}
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
                onChange={(event) => setAddForm({ ...addForm, shift_type: event.target.value as ShiftType })}
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
              className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Shift"}
            </button>
          </div>
        </form>
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
          const targetKey = `${entry.id}-${entry.shift_date}-${entry.shift_start}`;
          const activeNote = switchRequest?.note ?? coverageRequest?.note ?? "";
          const selfAdded = entry.id.startsWith("override-");

          return (
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
                    Source: {selfAdded ? "Self-added" : "Published schedule"}
                  </p>
                </div>
                <StaffTypeBadge staffType={displayStaffType(entry.staff_profiles)} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {switchRequest && <StatusChip status="Switch Requested" compact />}
                {coverageRequest && <StatusChip status="Coverage Requested" compact />}
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

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => void saveRequest(entry, "switch_requested", switchRequest)}
                  disabled={saving}
                  className={`rounded-2xl border px-3 py-3 text-sm font-extrabold ${
                    switchRequest
                      ? "border-fuchsia-200 bg-white text-fuchsia-700"
                      : "border-fuchsia-100 bg-fuchsia-50 text-fuchsia-700"
                  } disabled:opacity-60`}
                >
                  {switchRequest ? "Cancel Switch Request" : "Request Switch"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveRequest(entry, "coverage_requested", coverageRequest)}
                  disabled={saving}
                  className={`rounded-2xl border px-3 py-3 text-sm font-extrabold ${
                    coverageRequest
                      ? "border-violet-200 bg-white text-violet-700"
                      : "border-violet-100 bg-violet-50 text-violet-700"
                  } disabled:opacity-60`}
                >
                  {coverageRequest ? "Cancel Coverage Request" : "Request Coverage"}
                </button>
                <button
                  type="button"
                  onClick={() => setNoteEditor({ targetKey, note: activeNote })}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-extrabold text-slate-700"
                >
                  Add/Edit Note
                </button>
                {selfAdded ? (
                  <button
                    type="button"
                    onClick={() => void undoOverride(entry.id.replace("override-", ""))}
                    disabled={saving}
                    className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3 text-sm font-extrabold text-cyan-700 disabled:opacity-60"
                  >
                    Undo Self-added Shift
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void removeSelf(entry)}
                      disabled={saving}
                      className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-extrabold text-rose-700 disabled:opacity-60"
                    >
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
                      className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3 text-sm font-extrabold text-cyan-700"
                    >
                      Move Myself
                    </button>
                  </div>
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
                  onClick={() => void undoOverride(override.id)}
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
  const [selectedPost, setSelectedPost] = useState<ShiftPost | null>(null);
  const [offerNote, setOfferNote] = useState("");
  const [shortShiftForm, setShortShiftForm] = useState<ShortShiftForm>(emptyShortShiftForm);
  const [shortShiftOpen, setShortShiftOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const canManageShortShift = authContext.role === "admin" || authContext.role === "lead";
  const posts = developmentFallback ? allShiftPosts : schedule?.shiftPosts ?? [];

  const sendOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedPost || !authContext.staffProfileId) {
      setActionError("Your staff profile must be linked before offering help.");
      return;
    }

    setSaving(true);
    setActionError("");
    setSuccess("");

    const supabase = createClient();
    const { error: insertError } = await supabase.from("coverage_offers").insert({
      department_id: authContext.departmentId,
      shift_request_id: selectedPost.shiftRequestId ?? null,
      shift_shortage_id: selectedPost.shiftShortageId ?? null,
      offered_by_staff_profile_id: authContext.staffProfileId,
      status: "offered",
      note: offerNote.trim() || null
    });

    setSaving(false);

    if (insertError) {
      setActionError("Unable to send offer. You may already have an active offer for this post.");
      return;
    }

    setSelectedPost(null);
    setOfferNote("");
    setSuccess("Offer sent.");
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

    const supabase = createClient();
    const { error: insertError } = await supabase.from("shift_shortages").insert({
      schedule_version_id: schedule.version.id,
      department_id: authContext.departmentId,
      shift_date: shortShiftForm.shift_date,
      shift_type: shortShiftForm.shift_type,
      shift_start: shortShiftForm.shift_start,
      shift_end: shortShiftForm.shift_end,
      severity: shortShiftForm.severity,
      status: "active",
      message: shortShiftForm.message.trim() || null,
      created_by: authContext.profileId
    });

    setSaving(false);

    if (insertError) {
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
        <p className="text-sm font-bold text-slate-500">Loading Shift Board...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-100 bg-rose-50 p-4 shadow-soft">
        <h2 className="text-lg font-black text-rose-950">Unable to load Shift Board</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-rose-800">{error}</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-rose-100 bg-rose-50/80 p-4 shadow-soft">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-rose-600">
            <AlertTriangle size={21} />
          </span>
          <div>
            <h2 className="text-lg font-black text-rose-950">Shift Board</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-rose-800">
              Live staff requests and Short Shift alerts for the coordination view.
            </p>
          </div>
        </div>
        {canManageShortShift && !developmentFallback && schedule && (
          <button
            type="button"
            onClick={() => setShortShiftOpen((current) => !current)}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-rose-700 px-4 text-sm font-extrabold text-white"
          >
            Create Short Shift
          </button>
        )}
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
                onChange={(event) => setShortShiftForm({ ...shortShiftForm, shift_type: event.target.value as ShiftType })}
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

      {posts.length === 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">No active Shift Board posts.</p>
        </section>
      )}

      {posts.map((post) => (
        <ShiftPostCard
          key={post.id}
          post={post}
          onOffer={() => {
            setSelectedPost(post);
            setOfferNote("");
          }}
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
      ))}

      {selectedPost && (
        <form onSubmit={sendOffer} className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
          <h3 className="text-lg font-black text-hospital-ink">Offer help</h3>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
            {selectedPost.type} - {selectedPost.day} - {selectedPost.shiftTime}
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
                onClick={() => setSelectedPost(null)}
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
    </div>
  );
}

export default function AppClient({ authContext, developmentFallback }: AppClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("schedule");
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

    const [
      { data: entries, error: entriesError },
      { data: shortages, error: shortagesError },
      { data: overrides, error: overridesError },
      { data: requests, error: requestsError }
    ] = await Promise.all([
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
        .select("id, schedule_version_id, department_id, shift_date, shift_type, shift_start, shift_end, severity, status, message, created_by")
        .eq("schedule_version_id", activeVersionId)
        .eq("status", "active")
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true }),
      supabase
        .from("user_schedule_overrides")
        .select(
          "id, department_id, staff_profile_id, base_schedule_entry_id, override_type, shift_date, shift_type, shift_start, shift_end, note, is_active, created_at, updated_at, staff_profiles(id, display_name, employment_type, home_assignment, is_active)"
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
    ]);

    if (entriesError || shortagesError || overridesError || requestsError) {
      setScheduleState({
        loading: false,
        error: "Schedule coordination data could not be loaded. Confirm Phase 5 migrations are applied.",
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
        (shortages ?? []) as ShiftShortageRow[],
        (overrides ?? []) as UserScheduleOverrideRow[],
        (requests ?? []) as ShiftRequestRow[]
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
          {activeTab === "staff" && (
            <StaffDirectory authContext={authContext} developmentFallback={developmentFallback} />
          )}
        </div>
      </main>
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}
