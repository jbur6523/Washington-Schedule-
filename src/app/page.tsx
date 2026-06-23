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
  type ScheduleStatus,
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

function getCurrentDemoStatus(member: StaffMember): ScheduleStatus {
  const summary = getStaffSummary(member.name);

  if (summary.wantsOff > 0) {
    return "Wants Off";
  }

  if (summary.available > 0) {
    return "Available";
  }

  if (summary.scheduled > 0) {
    return "Scheduled";
  }

  return member.staffType === "Per diem" ? "Available" : "Scheduled";
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
            <StatusChip status="Wants Off" />
            <StatusChip status="Switch Requested" />
            <StatusChip status="Short Shift" />
            <StatusChip status="Short Shift" intensity="critical" />
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            Wants Off marks a requested day off. Switch Requested marks a requested trade.
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

function ScheduleSummary({
  selectedDay,
  shiftFilter
}: {
  selectedDay: ScheduleDay;
  shiftFilter: ScheduleShiftFilter;
}) {
  const day = demoSchedule.find((scheduleDay) => scheduleDay.day === selectedDay) ?? demoSchedule[0];
  const matchesShift = getShiftMatches(shiftFilter);
  const scheduled = day.scheduled.filter((entry) => matchesShift(entry.shiftTime)).length;
  const available = day.available.filter((entry) => matchesShift(entry.shiftTime)).length;
  const wantsOff = day.wantsOff.filter((entry) => matchesShift(entry.shiftTime)).length;
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
          ["Wants off", wantsOff],
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

function ScheduleScreen() {
  const [shiftFilter, setShiftFilter] = useState<ScheduleShiftFilter>("day");
  const [selectedDay, setSelectedDay] = useState<ScheduleDay>("Monday");
  const [expandedDay, setExpandedDay] = useState("");

  return (
    <div className="space-y-3">
      <ScheduleFilterTabs
        shiftFilter={shiftFilter}
        onChange={(filter) => {
          setShiftFilter(filter);
          setExpandedDay("");
        }}
      />
      <ScheduleSummary selectedDay={selectedDay} shiftFilter={shiftFilter} />
      <Legend />
      <div className="space-y-3">
        <p className="px-1 text-xs font-extrabold uppercase tracking-wide text-cyan-700">
          3-day demo schedule
        </p>
        {demoSchedule.map((day) => (
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

function AvailabilityScreen() {
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

function ShiftBoardScreen({ onDemoAction }: { onDemoAction: () => void }) {
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
      {allShiftPosts.map((post) => (
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

  return (
    <>
      <main className="min-h-screen pb-28">
        <Header />
        <div className="mx-auto max-w-xl px-4 pb-5 pt-3 sm:px-5">
          {activeTab === "schedule" && <ScheduleScreen />}
          {activeTab === "availability" && <AvailabilityScreen />}
          {activeTab === "shift-board" && <ShiftBoardScreen onDemoAction={() => setModalOpen(true)} />}
          {activeTab === "staff" && <StaffScreen />}
        </div>
      </main>
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <ConfirmationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
