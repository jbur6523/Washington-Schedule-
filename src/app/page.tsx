"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Sparkles } from "lucide-react";
import { BottomNavigation, type TabId } from "@/components/BottomNavigation";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { DayScheduleCard, type ScheduleShiftFilter } from "@/components/DayScheduleCard";
import { ShiftPostCard } from "@/components/ShiftPostCard";
import { StaffCard } from "@/components/StaffCard";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import {
  allShiftPosts,
  demoSchedule,
  getStaffSummary,
  staff,
  type DemoDay,
  type EmployeeRequestStatus,
  type ScheduleEntry,
  type ScheduleStatus,
  type ShiftPost,
  type StaffMember
} from "@/data/mockSchedule";

type StaffFilter = "All" | "Full-time" | "Per diem" | "Dayshift" | "Nightshift" | "Specialty / flexible";

const filterOptions: StaffFilter[] = [
  "All",
  "Full-time",
  "Per diem",
  "Dayshift",
  "Nightshift",
  "Specialty / flexible"
];

const scheduleFilterOptions: Array<{ id: ScheduleShiftFilter; label: string }> = [
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
  { id: "all", label: "All" }
];

type ScheduleDay = (typeof demoSchedule)[number]["day"];

type DemoShiftUpdate = {
  day: ScheduleDay;
  shiftTime: "7A-7P" | "7P-7A";
  staffName: string;
  staffType: "Full-time" | "Per diem";
  switchRequested?: boolean;
  coverageRequested?: boolean;
  note?: string;
};

const shiftUpdateId = (staffName: string, day: ScheduleDay, shiftTime: "7A-7P" | "7P-7A") =>
  `${staffName}-${day}-${shiftTime}`;

function getCurrentDemoStatus(member: StaffMember): ScheduleStatus {
  const summary = getStaffSummary(member.name);

  if (summary.coverageRequests > 0) {
    return "Coverage Requested";
  }

  if (summary.scheduled > 0) {
    return "Scheduled";
  }

  return "Scheduled";
}

function matchesStaffFilter(member: StaffMember, filter: StaffFilter) {
  if (filter === "All") {
    return true;
  }

  if (filter === "Full-time" || filter === "Per diem") {
    return member.staffType === filter;
  }

  if (filter === "Dayshift" || filter === "Nightshift") {
    return member.usualShift === filter;
  }

  return ["Pulm Rehab", "PFT", "Flexible"].includes(member.usualShift);
}

function Header() {
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
                Demo Mode
              </span>
            </div>
            <p className="mt-1 text-sm font-bold text-hospital-muted">
              Respiratory Department Staffing Demo
            </p>
          </div>
        </div>
      </div>
    </header>
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
            <StatusChip status="Short Shift" />
            <StatusChip status="Short Shift" intensity="critical" />
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            Switch Requested marks a requested trade. Coverage Requested marks a coverage request for that employee.
            Yellow Short Shift means short. Red Short Shift means urgently short.
          </p>
        </div>
      </div>
    </details>
  );
}

function getShiftMatches(filter: ScheduleShiftFilter) {
  return (shiftTime: "7A-7P" | "7P-7A") => {
    if (filter === "all") {
      return true;
    }

    return filter === "day" ? shiftTime === "7A-7P" : shiftTime === "7P-7A";
  };
}

function getShiftLabel(member: StaffMember | undefined, shiftTime: "7A-7P" | "7P-7A") {
  if (member?.usualShift === "PFT") {
    return "PFT";
  }

  if (member?.usualShift === "Pulm Rehab") {
    return "Pulmonary Rehab";
  }

  return shiftTime === "7A-7P" ? "Day Shift" : "Night Shift";
}

function requestPostFromUpdate(update: DemoShiftUpdate, status: EmployeeRequestStatus): ShiftPost {
  const id = `${shiftUpdateId(update.staffName, update.day, update.shiftTime)}-${status}`;

  return {
    id,
    day: update.day,
    shiftTime: update.shiftTime,
    postedBy: update.staffName,
    staffType: update.staffType,
    type: status,
    coverageIntensity: "low",
    status,
    description:
      status === "Switch Requested"
        ? "Open to switching this scheduled shift."
        : "Coverage requested for this shift.",
    targetStaffName: update.staffName,
    scope: "employee"
  };
}

function getSessionShiftPosts(updates: DemoShiftUpdate[]) {
  return updates.flatMap((update) => {
    const posts: ShiftPost[] = [];

    if (update.switchRequested) {
      posts.push(requestPostFromUpdate(update, "Switch Requested"));
    }

    if (update.coverageRequested) {
      posts.push(requestPostFromUpdate(update, "Coverage Requested"));
    }

    return posts;
  });
}

function getMergedSchedule(updates: DemoShiftUpdate[]): DemoDay[] {
  const sessionPosts = getSessionShiftPosts(updates);

  return demoSchedule.map((day) => {
    const dayUpdates = updates.filter((update) => update.day === day.day);
    const coverageKeys = new Set(
      day.coverageRequests.map((entry) => `${entry.staffName}-${entry.shiftTime}`)
    );
    const sessionCoverageRequests: ScheduleEntry[] = dayUpdates
      .filter((update) => update.coverageRequested)
      .filter((update) => {
        const key = `${update.staffName}-${update.shiftTime}`;

        if (coverageKeys.has(key)) {
          return false;
        }

        coverageKeys.add(key);
        return true;
      })
      .map((update) => ({
        staffName: update.staffName,
        shiftTime: update.shiftTime,
        staffType: update.staffType,
        status: "Scheduled"
      }));

    return {
      ...day,
      coverageRequests: [...day.coverageRequests, ...sessionCoverageRequests],
      shiftPosts: [...day.shiftPosts, ...sessionPosts.filter((post) => post.day === day.day)]
    };
  });
}

function getShiftNotes(updates: DemoShiftUpdate[]) {
  return updates.reduce<Record<string, string>>((notes, update) => {
    const note = update.note?.trim();

    if (note) {
      notes[shiftUpdateId(update.staffName, update.day, update.shiftTime)] = note;
    }

    return notes;
  }, {});
}

function ScheduleSummary({
  schedule,
  selectedDay,
  shiftFilter
}: {
  schedule: DemoDay[];
  selectedDay: ScheduleDay;
  shiftFilter: ScheduleShiftFilter;
}) {
  const day = schedule.find((scheduleDay) => scheduleDay.day === selectedDay) ?? schedule[0];
  const matchesShift = getShiftMatches(shiftFilter);
  const scheduled = day.scheduled.filter((entry) => matchesShift(entry.shiftTime)).length;
  const available = day.available.filter((entry) => matchesShift(entry.shiftTime)).length;
  const coverageRequests = day.coverageRequests.filter((entry) => matchesShift(entry.shiftTime)).length;
  const shortShiftPosts = day.shiftPosts.filter(
    (post) => matchesShift(post.shiftTime) && post.status === "Short Shift"
  ).length;
  const switchRequests = day.shiftPosts.filter(
    (post) => matchesShift(post.shiftTime) && post.status === "Switch Requested"
  ).length;
  const shiftLabel =
    shiftFilter === "all"
      ? "All Shifts"
      : shiftFilter === "day"
        ? "Day Shift"
        : "Night Shift";

  return (
    <section className="rounded-2xl border border-white bg-white/95 p-3.5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-hospital-ink">
            {day.day} {shiftLabel} Summary
          </h2>
        </div>
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

function ScheduleScreen({ schedule, updates }: { schedule: DemoDay[]; updates: DemoShiftUpdate[] }) {
  const [shiftFilter, setShiftFilter] = useState<ScheduleShiftFilter>("day");
  const [selectedDay, setSelectedDay] = useState<ScheduleDay>("Monday");
  const [expandedDay, setExpandedDay] = useState("");
  const shiftNotes = getShiftNotes(updates);

  return (
    <div className="space-y-3">
      <ScheduleFilterTabs
        shiftFilter={shiftFilter}
        onChange={(filter) => {
          setShiftFilter(filter);
          setExpandedDay("");
        }}
      />
      <ScheduleSummary schedule={schedule} selectedDay={selectedDay} shiftFilter={shiftFilter} />
      <Legend />
      <div className="space-y-3">
        <p className="px-1 text-xs font-extrabold uppercase tracking-wide text-cyan-700">
          3-day demo schedule
        </p>
        {schedule.map((day) => (
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

function ManageScheduleScreen({
  updates,
  onUpdateShift
}: {
  updates: DemoShiftUpdate[];
  onUpdateShift: (update: DemoShiftUpdate) => void;
}) {
  const [editingShiftId, setEditingShiftId] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const signedInStaffName = "Jonathan Burdick";
  const selectedStaff = staff.find((member) => member.name === signedInStaffName) ?? staff[0];
  const scheduledShifts = demoSchedule.flatMap((day) =>
    day.scheduled
      .filter((entry) => entry.staffName === signedInStaffName)
      .map((entry) => ({ day: day.day, entry, posts: day.shiftPosts, coverageRequests: day.coverageRequests }))
  );

  const getUpdate = (day: ScheduleDay, entry: ScheduleEntry) =>
    updates.find(
      (update) =>
        update.staffName === entry.staffName &&
        update.day === day &&
        update.shiftTime === entry.shiftTime
    );

  const applyUpdate = (
    day: ScheduleDay,
    entry: ScheduleEntry,
    patch: Partial<Pick<DemoShiftUpdate, "switchRequested" | "coverageRequested" | "note">>
  ) => {
    const current = getUpdate(day, entry);
    onUpdateShift({
      day,
      shiftTime: entry.shiftTime,
      staffName: entry.staffName,
      staffType: entry.staffType,
      ...current,
      ...patch
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-2xl font-black text-hospital-ink">My Schedule</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">Manage your shift requests</p>
        <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
          Demo only: requests do not change the official schedule.
        </p>
      </section>

      <div className="space-y-3">
        {scheduledShifts.length === 0 && (
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <p className="text-sm font-bold text-slate-500">No scheduled shifts in the demo schedule.</p>
          </section>
        )}

        {scheduledShifts.map(({ day, entry, posts, coverageRequests }) => {
          const shiftId = shiftUpdateId(entry.staffName, day, entry.shiftTime);
          const update = getUpdate(day, entry);
          const existingPosts = posts.filter(
            (post) => post.scope === "employee" && post.targetStaffName === entry.staffName
          );
          const hasBaseCoverage = coverageRequests.some(
            (request) => request.staffName === entry.staffName && request.shiftTime === entry.shiftTime
          );
          const hasSwitchRequest =
            Boolean(update?.switchRequested) ||
            existingPosts.some((post) => post.status === "Switch Requested");
          const hasCoverageRequest = Boolean(update?.coverageRequested) || hasBaseCoverage;
          const shiftLabel = getShiftLabel(selectedStaff, entry.shiftTime);
          const note = update?.note ?? "";
          const editing = editingShiftId === shiftId;
          const requestNote = [
            hasSwitchRequest ? "Open to switching this scheduled shift." : "",
            hasCoverageRequest ? "Coverage requested for this shift." : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <article key={shiftId} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">{day}</p>
                  <h2 className="mt-1 text-xl font-black text-hospital-ink">{shiftLabel}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{entry.shiftTime}</p>
                  <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                    Current status: Scheduled
                  </p>
                </div>
                <StaffTypeBadge staffType={entry.staffType} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {hasSwitchRequest && <StatusChip status="Switch Requested" compact />}
                {hasCoverageRequest && <StatusChip status="Coverage Requested" compact />}
              </div>
              {requestNote && (
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                  {requestNote}
                </p>
              )}

              {note && (
                <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold leading-5 text-slate-600">
                  {note}
                </p>
              )}

              {editing && (
                <div className="mt-3">
                  <textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value.slice(0, 140))}
                    className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-300"
                    maxLength={140}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-400">{noteDraft.length}/140</span>
                    <button
                      type="button"
                      onClick={() => {
                        applyUpdate(day, entry, { note: noteDraft.trim() || undefined });
                        setEditingShiftId("");
                      }}
                      className="rounded-xl bg-cyan-700 px-3 py-2 text-xs font-extrabold text-white"
                    >
                      Save Note
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => applyUpdate(day, entry, { switchRequested: !Boolean(update?.switchRequested) })}
                  className={`rounded-2xl border px-3 py-3 text-sm font-extrabold ${
                    update?.switchRequested
                      ? "border-fuchsia-200 bg-white text-fuchsia-700"
                      : "border-fuchsia-100 bg-fuchsia-50 text-fuchsia-700"
                  }`}
                >
                  {update?.switchRequested ? "Cancel Switch Request" : "Request Switch"}
                </button>
                <button
                  type="button"
                  onClick={() => applyUpdate(day, entry, { coverageRequested: !Boolean(update?.coverageRequested) })}
                  className={`rounded-2xl border px-3 py-3 text-sm font-extrabold ${
                    update?.coverageRequested
                      ? "border-violet-200 bg-white text-violet-700"
                      : "border-violet-100 bg-violet-50 text-violet-700"
                  }`}
                >
                  {update?.coverageRequested ? "Cancel Coverage Request" : "Request Coverage"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingShiftId(shiftId);
                    setNoteDraft(note);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-extrabold text-slate-700"
                >
                  Add/Edit Note
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AvailableStaffScreen() {
  return (
    <div className="space-y-4">
      {demoSchedule.map((day) => (
        <section key={day.day} className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-600">
                Available staff
              </p>
              <h2 className="mt-1 text-2xl font-black text-hospital-ink">{day.day}</h2>
            </div>
            <StatusChip status="Available" />
          </div>
          <div className="mt-4 space-y-2">
            {day.available.map((entry) => {
              const member = staff.find((person) => person.name === entry.staffName);
              const usualShift = member?.usualShift ?? "Flexible";

              return (
                <div
                  key={`${day.day}-${entry.staffName}`}
                  className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-3"
                >
                  <div>
                    <p className="text-sm font-extrabold leading-5 text-slate-800">{entry.staffName}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {usualShift} • Available {entry.shiftTime}
                    </p>
                  </div>
                  <div className="mt-2">
                    <StaffTypeBadge staffType={entry.staffType} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
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
              Demo cards show switch requests and short shift needs.
            </p>
          </div>
        </div>
      </section>
      {posts.map((post) => (
        <ShiftPostCard key={post.id} post={post} onDemoAction={onDemoAction} />
      ))}
    </div>
  );
}

function StaffScreen() {
  const [filter, setFilter] = useState<StaffFilter>("All");
  const filteredStaff = useMemo(
    () => staff.filter((member) => matchesStaffFilter(member, filter)),
    [filter]
  );

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-lg font-black text-hospital-ink">Staff directory</h2>
        <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {filterOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold ${
                filter === option
                  ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </section>
      <div className="grid gap-3">
        {filteredStaff.map((member) => (
          <StaffCard
            key={member.id}
            staff={member}
            currentStatus={getCurrentDemoStatus(member)}
            summary={getStaffSummary(member.name)}
          />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("schedule");
  const [modalOpen, setModalOpen] = useState(false);
  const [shiftUpdates, setShiftUpdates] = useState<DemoShiftUpdate[]>([]);
  const mergedSchedule = getMergedSchedule(shiftUpdates);
  const shiftBoardPosts = [...allShiftPosts, ...getSessionShiftPosts(shiftUpdates)];

  const updateShift = (nextUpdate: DemoShiftUpdate) => {
    setShiftUpdates((currentUpdates) => {
      const id = shiftUpdateId(nextUpdate.staffName, nextUpdate.day, nextUpdate.shiftTime);
      const existingIndex = currentUpdates.findIndex(
        (update) => shiftUpdateId(update.staffName, update.day, update.shiftTime) === id
      );

      if (existingIndex === -1) {
        return [...currentUpdates, nextUpdate];
      }

      return currentUpdates.map((update, index) =>
        index === existingIndex ? { ...update, ...nextUpdate } : update
      );
    });
  };

  return (
    <>
      <main className="min-h-screen pb-28">
        <Header />
        <div className="mx-auto max-w-xl px-4 pb-5 pt-3 sm:px-5">
          {activeTab === "schedule" && <ScheduleScreen schedule={mergedSchedule} updates={shiftUpdates} />}
          {activeTab === "manage-schedule" && (
            <ManageScheduleScreen updates={shiftUpdates} onUpdateShift={updateShift} />
          )}
          {activeTab === "shift-board" && (
            <ShiftBoardScreen posts={shiftBoardPosts} onDemoAction={() => setModalOpen(true)} />
          )}
          {activeTab === "staff" && <StaffScreen />}
        </div>
      </main>
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <ConfirmationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
