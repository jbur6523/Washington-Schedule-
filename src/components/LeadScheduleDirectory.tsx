"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Phone, Search, Users } from "lucide-react";
import { CommandCenterTabs } from "@/components/CommandCenterTabs";
import {
  buildDirectorySections,
  formatDirectoryPhoneHref,
  type DirectoryEmployee,
  type DirectoryFilter,
  type DirectoryStaffProfile,
  type DirectoryShift,
  type ScheduledDirectoryEmployee
} from "@/lib/lead-schedule/directory";

type LeadScheduleDirectoryProps = {
  selectedDate: string;
  selectedShift: DirectoryShift;
  schedule: ScheduledDirectoryEmployee[];
  directory: DirectoryStaffProfile[];
  scheduleError: boolean;
  directoryError: boolean;
};

const filterOptions: Array<{ value: DirectoryFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "full_time", label: "Full Time" },
  { value: "per_diem", label: "Per Diem" }
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00Z`));
}

function employmentLabel(value: "full_time" | "per_diem") {
  return value === "full_time" ? "Full Time" : "Per Diem";
}

function shiftLabel(value: DirectoryShift | null) {
  if (!value) return "Shift unavailable";
  return value === "day" ? "Day Shift" : "Night Shift";
}

function PhoneLink({ phoneNumber }: { phoneNumber: string | null }) {
  if (!phoneNumber) {
    return <span className="text-slate-500">Phone unavailable</span>;
  }

  return (
    <a
      href={formatDirectoryPhoneHref(phoneNumber)}
      className="inline-flex items-center gap-1 font-extrabold text-cyan-800 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-950"
    >
      <Phone aria-hidden="true" size={14} />
      {phoneNumber}
    </a>
  );
}

function MobileScheduleRows({ employees }: { employees: ScheduledDirectoryEmployee[] }) {
  return (
    <ul className="divide-y divide-slate-200 md:hidden">
      {employees.map((employee) => (
        <li key={employee.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-black text-hospital-ink">{employee.fullName}</p>
              {!employee.directoryAvailable && (
                <p className="mt-0.5 text-xs font-bold text-slate-500">Directory information unavailable</p>
              )}
            </div>
            <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-600">
              {employmentLabel(employee.employmentType)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold">
            <PhoneLink phoneNumber={employee.phoneNumber} />
            <span className="text-slate-600">Hire date: {employee.hireDate ? formatDate(employee.hireDate) : "Unavailable"}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DesktopScheduleTable({ employees }: { employees: ScheduledDirectoryEmployee[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-xs font-extrabold uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-2 py-2">Employee</th>
            <th scope="col" className="px-2 py-2">Phone</th>
            <th scope="col" className="px-2 py-2">Hire Date</th>
            <th scope="col" className="px-2 py-2">Employment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {employees.map((employee) => (
            <tr key={employee.id}>
              <th scope="row" className="px-2 py-3 font-black text-hospital-ink">
                {employee.fullName}
                {!employee.directoryAvailable && (
                  <span className="mt-0.5 block text-xs font-bold text-slate-500">Directory information unavailable</span>
                )}
              </th>
              <td className="px-2 py-3"><PhoneLink phoneNumber={employee.phoneNumber} /></td>
              <td className="px-2 py-3 font-bold text-slate-600">{employee.hireDate ? formatDate(employee.hireDate) : "Unavailable"}</td>
              <td className="px-2 py-3 font-bold text-slate-600">{employmentLabel(employee.employmentType)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileDirectoryRows({ employees }: { employees: DirectoryEmployee[] }) {
  return (
    <ul className="divide-y divide-slate-200 md:hidden">
      {employees.map((employee) => (
        <li key={employee.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 break-words text-sm font-black text-hospital-ink">{employee.fullName}</p>
            <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
              {shiftLabel(employee.directory_shift)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold">
            <PhoneLink phoneNumber={employee.phone_number} />
            <span className="text-slate-600">Hired {employee.hire_date ? formatDate(employee.hire_date) : "Unavailable"}</span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {employmentLabel(employee.employment_type)} · {shiftLabel(employee.directory_shift)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function DesktopDirectoryTable({ employees }: { employees: DirectoryEmployee[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-xs font-extrabold uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-2 py-2">Employee</th>
            <th scope="col" className="px-2 py-2">Phone</th>
            <th scope="col" className="px-2 py-2">Hire Date</th>
            <th scope="col" className="px-2 py-2">Employment</th>
            <th scope="col" className="px-2 py-2">Shift</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {employees.map((employee) => (
            <tr key={employee.id}>
              <th scope="row" className="px-2 py-3 font-black text-hospital-ink">{employee.fullName}</th>
              <td className="px-2 py-3"><PhoneLink phoneNumber={employee.phone_number} /></td>
              <td className="px-2 py-3 font-bold text-slate-600">{employee.hire_date ? formatDate(employee.hire_date) : "Unavailable"}</td>
              <td className="px-2 py-3 font-bold text-slate-600">{employmentLabel(employee.employment_type)}</td>
              <td className="px-2 py-3 font-bold text-slate-600">{shiftLabel(employee.directory_shift)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeadScheduleDirectory({
  selectedDate,
  selectedShift,
  schedule,
  directory,
  scheduleError,
  directoryError
}: LeadScheduleDirectoryProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const sections = useMemo(
    () => buildDirectorySections(directory, filter, search),
    [directory, filter, search]
  );
  const directoryResultCount = sections.reduce((count, section) => count + section.employees.length, 0);

  return (
    <main className="min-h-screen px-4 py-5 sm:py-7">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="text-center">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
          <h1 className="mt-1 text-3xl font-black text-hospital-ink lg:text-4xl">Schedule</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Current-shift seniority and employee contact reference.</p>
          <CommandCenterTabs />
        </header>

        <section aria-labelledby="current-shift-heading" className="rounded-3xl border border-slate-300 bg-white/95 p-4 shadow-md sm:p-5">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">RT Schedule</p>
              <h2 id="current-shift-heading" className="mt-1 text-xl font-black text-hospital-ink">Current Shift Schedule</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">Sorted by seniority · Most senior first</p>
            </div>
            <form method="get" className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(8rem,0.8fr)_auto] sm:items-end">
              <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                Date
                <input
                  type="date"
                  name="date"
                  defaultValue={selectedDate}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                Shift
                <select
                  name="shift"
                  defaultValue={selectedShift}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="day">Day Shift</option>
                  <option value="night">Night Shift</option>
                </select>
              </label>
              <button type="submit" className="min-h-11 rounded-xl bg-cyan-700 px-5 text-sm font-black text-white hover:bg-cyan-800">
                View
              </button>
            </form>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-600">
            <CalendarDays aria-hidden="true" size={17} className="text-cyan-700" />
            <span>{formatDate(selectedDate)}</span>
            <span aria-hidden="true">·</span>
            <span>{selectedShift === "day" ? "Day Shift" : "Night Shift"}</span>
            {!scheduleError && <span className="ml-auto text-xs font-extrabold text-slate-500">{schedule.length} scheduled</span>}
          </div>

          {scheduleError ? (
            <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
              The current schedule could not be loaded. Please retry.
            </p>
          ) : schedule.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-slate-50 p-6 text-center">
              <Users aria-hidden="true" className="mx-auto text-slate-400" size={28} />
              <p className="mt-2 text-sm font-bold text-slate-600">No RTs are scheduled for this date and shift.</p>
            </div>
          ) : (
            <div className="mt-4">
              <MobileScheduleRows employees={schedule} />
              <DesktopScheduleTable employees={schedule} />
            </div>
          )}
        </section>

        <section aria-labelledby="directory-heading" className="rounded-3xl border border-slate-300 bg-white/95 p-4 shadow-md sm:p-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Reference</p>
            <h2 id="directory-heading" className="mt-1 text-xl font-black text-hospital-ink">Employee Directory</h2>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_auto] lg:items-end">
            <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Search employees
              <span className="relative mt-1 block">
                <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search employees"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm font-bold text-hospital-ink outline-none placeholder:text-slate-400 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </span>
            </label>
            <fieldset>
              <legend className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Employment</legend>
              <div className="mt-1 grid grid-cols-3 rounded-xl border border-slate-300 bg-slate-100 p-1">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-extrabold ${
                      filter === option.value ? "bg-white text-cyan-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {directoryError ? (
            <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
              Directory details are temporarily unavailable. The current schedule above is still available.
            </p>
          ) : directoryResultCount === 0 ? (
            <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-600">
              No employees match this search and filter.
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              {sections.map((section) => section.employees.length > 0 && (
                <section key={section.key} aria-labelledby={`directory-${section.key}`}>
                  <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3 id={`directory-${section.key}`} className="text-sm font-black text-hospital-ink">{section.label}</h3>
                    <span className="text-xs font-extrabold text-slate-500">{section.employees.length}</span>
                  </div>
                  <MobileDirectoryRows employees={section.employees} />
                  <DesktopDirectoryTable employees={section.employees} />
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
