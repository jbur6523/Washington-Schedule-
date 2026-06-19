"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarClock, Sparkles } from "lucide-react";
import { BottomNavigation, type TabId } from "@/components/BottomNavigation";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { DayScheduleCard } from "@/components/DayScheduleCard";
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
  type StaffMember,
  type UsualShift
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

const tabTitles: Record<TabId, string> = {
  schedule: "Schedule",
  availability: "Availability",
  "shift-board": "Shift Board",
  staff: "Staff"
};

function getCurrentDemoStatus(member: StaffMember): ScheduleStatus {
  const summary = getStaffSummary(member.name);

  if (summary.wantsOff > 0) {
    return "Wants off";
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

function Header({ activeTab }: { activeTab: TabId }) {
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

        <div className="mt-5 rounded-3xl border border-white bg-gradient-to-br from-white to-cyan-50 p-4 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-100 text-cyan-700">
              <Activity size={22} />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                Current view
              </p>
              <h2 className="mt-1 text-xl font-black text-hospital-ink">{tabTitles[activeTab]}</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                Three demo days with clear staffing, availability, and coverage needs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Legend() {
  return (
    <section className="rounded-3xl border border-white bg-white/90 p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <CalendarClock size={18} className="text-cyan-700" />
        <h2 className="text-base font-black text-hospital-ink">Color legend</h2>
      </div>
      <div className="mt-3 grid gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
            Staff type
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StaffTypeBadge staffType="Full-time" />
            <StaffTypeBadge staffType="Per diem" />
          </div>
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
            Schedule status
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusChip status="Scheduled" />
            <StatusChip status="Available" />
            <StatusChip status="Wants off" />
            <StatusChip status="Switch requested" />
            <StatusChip status="Need covered ASAP" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ScheduleScreen() {
  const [expandedDay, setExpandedDay] = useState("Monday");

  return (
    <div className="space-y-4">
      <Legend />
      <div className="space-y-4">
        {demoSchedule.map((day) => (
          <DayScheduleCard
            key={day.day}
            day={day}
            expanded={expandedDay === day.day}
            onToggle={() => setExpandedDay((current) => (current === day.day ? "" : day.day))}
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
              Demo cards show switch requests, pickup options, and urgent coverage needs.
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
        <Header activeTab={activeTab} />
        <div className="mx-auto max-w-xl px-4 py-5 sm:px-5">
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
