import type { DemoDay, ScheduleEntry, ShiftPost, StaffType } from "@/data/mockSchedule";

export type ScheduleVersionStatus = "draft" | "review" | "published" | "archived";
export type ScheduleEntryStatus = "scheduled" | "available";
export type ShiftType = "day_shift" | "night_shift" | "pft" | "pulmonary_rehab" | "flexible";
export type ShiftShortageSeverity = "short" | "urgent";
export type EmploymentType = "full_time" | "per_diem";
export type HomeAssignment = "day_shift" | "night_shift" | "pft" | "pulmonary_rehab" | "flexible";

export type StaffProfileSummary = {
  id: string;
  display_name: string;
  employment_type: EmploymentType;
  home_assignment: HomeAssignment;
  is_active?: boolean;
};

export type ScheduleVersionRow = {
  id: string;
  department_id: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  status: ScheduleVersionStatus;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleEntryRow = {
  id: string;
  schedule_version_id: string;
  department_id: string;
  staff_profile_id: string | null;
  shift_date: string;
  day_of_week: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  entry_status: ScheduleEntryStatus;
  staff_profiles: StaffProfileSummary | StaffProfileSummary[] | null;
};

export type ShiftShortageRow = {
  id: string;
  schedule_version_id: string;
  department_id: string;
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  severity: ShiftShortageSeverity;
  message: string | null;
};

export type ActiveSchedule = {
  version: ScheduleVersionRow;
  entries: ScheduleEntryRow[];
  shortages: ShiftShortageRow[];
  days: DemoDay[];
  shiftPosts: ShiftPost[];
};

export const shiftTypeLabels: Record<ShiftType, string> = {
  day_shift: "Day Shift",
  night_shift: "Night Shift",
  pft: "PFT",
  pulmonary_rehab: "Pulmonary Rehab",
  flexible: "Flexible"
};

export const employmentLabels: Record<EmploymentType, StaffType> = {
  full_time: "Full-time",
  per_diem: "Per diem"
};

export function shiftCategoryForType(shiftType: string): "day" | "night" {
  return shiftType === "night_shift" ? "night" : "day";
}

export function dayNameFromDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
}

export function compactDateLabel(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric" }).format(date);
}

function formatTimeValue(value: string) {
  const [rawHour = "0", rawMinute = "0"] = value.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const period = hour >= 12 ? "P" : "A";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${period}`;
}

export function formatShiftTime(start: string, end: string) {
  return `${formatTimeValue(start)}-${formatTimeValue(end)}`;
}

export function firstStaffProfile(staffProfile?: StaffProfileSummary | StaffProfileSummary[] | null) {
  if (Array.isArray(staffProfile)) {
    return staffProfile[0] ?? null;
  }

  return staffProfile ?? null;
}

export function displayStaffType(staffProfile?: StaffProfileSummary | StaffProfileSummary[] | null): StaffType {
  const profile = firstStaffProfile(staffProfile);
  return profile?.employment_type ? employmentLabels[profile.employment_type] : "Full-time";
}

export function staffDisplayName(staffProfile?: StaffProfileSummary | StaffProfileSummary[] | null) {
  return firstStaffProfile(staffProfile)?.display_name ?? "Unassigned staff";
}

function entryToScheduleEntry(entry: ScheduleEntryRow): ScheduleEntry {
  return {
    staffName: staffDisplayName(entry.staff_profiles),
    shiftTime: formatShiftTime(entry.shift_start, entry.shift_end),
    shiftCategory: shiftCategoryForType(entry.shift_type),
    shiftTypeLabel: shiftTypeLabels[entry.shift_type],
    staffType: displayStaffType(entry.staff_profiles),
    status: entry.entry_status === "scheduled" ? "Scheduled" : "Available"
  };
}

function shortageToPost(shortage: ShiftShortageRow): ShiftPost {
  const dayName = dayNameFromDate(shortage.shift_date);
  const dateLabel = compactDateLabel(shortage.shift_date);

  return {
    id: shortage.id,
    day: `${dayName} ${dateLabel}`,
    shiftTime: formatShiftTime(shortage.shift_start, shortage.shift_end),
    shiftCategory: shiftCategoryForType(shortage.shift_type),
    postedBy: `${shiftTypeLabels[shortage.shift_type]} Team`,
    staffType: "Full-time",
    type: "Short Shift",
    coverageIntensity: shortage.severity === "urgent" ? "critical" : "medium",
    status: "Short Shift",
    description: shortage.message || "Short Shift alert for this shift.",
    scope: "shift"
  };
}

export function adaptActiveSchedule(
  version: ScheduleVersionRow,
  entries: ScheduleEntryRow[],
  shortages: ShiftShortageRow[]
): ActiveSchedule {
  const entriesByDate = new Map<string, ScheduleEntryRow[]>();
  const shortagesByDate = new Map<string, ShiftShortageRow[]>();

  entries.forEach((entry) => {
    const current = entriesByDate.get(entry.shift_date) ?? [];
    current.push(entry);
    entriesByDate.set(entry.shift_date, current);
  });

  shortages.forEach((shortage) => {
    const current = shortagesByDate.get(shortage.shift_date) ?? [];
    current.push(shortage);
    shortagesByDate.set(shortage.shift_date, current);
  });

  const allDates = Array.from(
    new Set([...Array.from(entriesByDate.keys()), ...Array.from(shortagesByDate.keys())])
  ).sort();
  const shiftPosts = shortages.map(shortageToPost);
  const days = allDates.map((dateValue) => {
    const dayEntries = entriesByDate.get(dateValue) ?? [];
    const dayShortages = shortagesByDate.get(dateValue) ?? [];
    const dayName = dayNameFromDate(dateValue);
    const dateLabel = compactDateLabel(dateValue);

    return {
      day: `${dayName} ${dateLabel}`,
      dateLabel,
      scheduled: dayEntries
        .filter((entry) => entry.entry_status === "scheduled")
        .map(entryToScheduleEntry),
      available: dayEntries
        .filter((entry) => entry.entry_status === "available")
        .map(entryToScheduleEntry),
      coverageRequests: [],
      shiftPosts: dayShortages.map(shortageToPost)
    } satisfies DemoDay;
  });

  return { version, entries, shortages, days, shiftPosts };
}
