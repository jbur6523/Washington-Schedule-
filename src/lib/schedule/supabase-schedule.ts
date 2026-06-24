import type { DemoDay, ScheduleEntry, ShiftPost, StaffType } from "@/data/mockSchedule";

export type ScheduleVersionStatus = "draft" | "review" | "published" | "archived";
export type ScheduleEntryStatus = "scheduled" | "available";
export type ShiftType = "day_shift" | "night_shift" | "pft" | "pulmonary_rehab" | "flexible";
export type ShiftShortageSeverity = "short" | "urgent";
export type ShiftShortageStatus = "active" | "resolved" | "cancelled";
export type EmploymentType = "full_time" | "per_diem";
export type HomeAssignment = "day_shift" | "night_shift" | "pft" | "pulmonary_rehab" | "flexible";
export type UserScheduleOverrideType = "remove_self" | "add_self" | "move_self" | "add_available";
export type ShiftRequestType = "switch_requested" | "coverage_requested";
export type ShiftRequestStatus = "active" | "cancelled" | "resolved";
export type CoverageOfferStatus = "offered" | "accepted" | "declined" | "cancelled";
export type ShiftRequestOfferType = "coverage" | "switch";

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
  status?: ShiftShortageStatus;
  message: string | null;
  created_by?: string | null;
};

export type UserScheduleOverrideRow = {
  id: string;
  department_id: string;
  staff_profile_id: string;
  base_schedule_entry_id: string | null;
  override_type: UserScheduleOverrideType;
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  staff_profiles: StaffProfileSummary | StaffProfileSummary[] | null;
};

export type ShiftRequestRow = {
  id: string;
  department_id: string;
  schedule_entry_id: string | null;
  user_schedule_override_id: string | null;
  staff_profile_id: string;
  request_type: ShiftRequestType;
  status: ShiftRequestStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  staff_profiles: StaffProfileSummary | StaffProfileSummary[] | null;
  schedule_entries?: Pick<
    ScheduleEntryRow,
    "id" | "shift_date" | "day_of_week" | "shift_type" | "shift_start" | "shift_end"
  > | Array<
    Pick<
      ScheduleEntryRow,
      "id" | "shift_date" | "day_of_week" | "shift_type" | "shift_start" | "shift_end"
    >
  > | null;
  user_schedule_overrides?: Pick<
    UserScheduleOverrideRow,
    "id" | "shift_date" | "shift_type" | "shift_start" | "shift_end"
  > | Array<
    Pick<
      UserScheduleOverrideRow,
      "id" | "shift_date" | "shift_type" | "shift_start" | "shift_end"
    >
  > | null;
};

export type ShiftRequestOfferRow = {
  id: string;
  department_id: string;
  shift_request_id: string;
  offer_type: ShiftRequestOfferType;
  offered_by_staff_profile_id: string;
  offered_schedule_entry_id: string | null;
  offered_override_id: string | null;
  offered_date: string | null;
  offered_shift_type: ShiftType | null;
  offered_shift_start: string | null;
  offered_shift_end: string | null;
  note: string | null;
  status: CoverageOfferStatus;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
  staff_profiles: StaffProfileSummary | StaffProfileSummary[] | null;
  shift_requests?: ShiftRequestRow | ShiftRequestRow[] | null;
  schedule_entries?: Pick<
    ScheduleEntryRow,
    "id" | "shift_date" | "day_of_week" | "shift_type" | "shift_start" | "shift_end"
  > | Array<
    Pick<
      ScheduleEntryRow,
      "id" | "shift_date" | "day_of_week" | "shift_type" | "shift_start" | "shift_end"
    >
  > | null;
  user_schedule_overrides?: Pick<
    UserScheduleOverrideRow,
    "id" | "shift_date" | "shift_type" | "shift_start" | "shift_end"
  > | Array<
    Pick<
      UserScheduleOverrideRow,
      "id" | "shift_date" | "shift_type" | "shift_start" | "shift_end"
    >
  > | null;
};

export type CoverageOfferRow = {
  id: string;
  department_id: string;
  shift_request_id: string | null;
  shift_shortage_id: string | null;
  offered_by_staff_profile_id: string;
  status: CoverageOfferStatus;
  note: string | null;
};

export type ActiveSchedule = {
  version: ScheduleVersionRow;
  entries: ScheduleEntryRow[];
  effectiveEntries: ScheduleEntryRow[];
  overrides: UserScheduleOverrideRow[];
  requests: ShiftRequestRow[];
  offers: ShiftRequestOfferRow[];
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

export const standardShiftTimes: Partial<Record<ShiftType, { shift_start: string; shift_end: string }>> = {
  day_shift: { shift_start: "06:30", shift_end: "19:00" },
  night_shift: { shift_start: "18:30", shift_end: "07:00" }
};

export function standardTimesForShiftType(shiftType: ShiftType) {
  return standardShiftTimes[shiftType] ?? null;
}

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
  const [rawHour = "00", rawMinute = "00"] = value.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value.slice(0, 5);
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
    id: entry.id,
    baseScheduleEntryId: entry.id.startsWith("override-") ? null : entry.id,
    userScheduleOverrideId: entry.id.startsWith("override-") ? entry.id.replace("override-", "") : null,
    staffProfileId: entry.staff_profile_id,
    shiftDate: entry.shift_date,
    shiftType: entry.shift_type,
    shiftStart: entry.shift_start,
    shiftEnd: entry.shift_end,
    staffName: staffDisplayName(entry.staff_profiles),
    shiftTime: formatShiftTime(entry.shift_start, entry.shift_end),
    shiftCategory: shiftCategoryForType(entry.shift_type),
    shiftTypeLabel: shiftTypeLabels[entry.shift_type],
    staffType: displayStaffType(entry.staff_profiles),
    status: entry.entry_status === "scheduled" ? "Scheduled" : "Available",
    selfAdded: entry.id.startsWith("override-")
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
    shiftTypeLabel: shiftTypeLabels[shortage.shift_type],
    postedBy: `${shiftTypeLabels[shortage.shift_type]} Team`,
    staffType: "Full-time",
    type: "Short Shift",
    coverageIntensity: shortage.severity === "urgent" ? "critical" : "medium",
    status: "Short Shift",
    description: shortage.message || "Short Shift alert for this shift.",
    shiftShortageId: shortage.id,
    scope: "shift"
  };
}

export function adaptActiveSchedule(
  version: ScheduleVersionRow,
  entries: ScheduleEntryRow[],
  shortages: ShiftShortageRow[],
  overrides: UserScheduleOverrideRow[] = [],
  requests: ShiftRequestRow[] = [],
  offers: ShiftRequestOfferRow[] = []
): ActiveSchedule {
  const activeOverrides = overrides.filter((override) => override.is_active);
  const removedBaseEntryIds = new Set(
    activeOverrides
      .filter((override) => override.override_type === "remove_self" && override.base_schedule_entry_id)
      .map((override) => override.base_schedule_entry_id as string)
  );
  const addOverrides = activeOverrides.filter(
    (override) => override.override_type === "add_self" || override.override_type === "add_available"
  );
  const syntheticEntries: ScheduleEntryRow[] = addOverrides.map((override) => ({
    id: `override-${override.id}`,
    schedule_version_id: version.id,
    department_id: override.department_id,
    staff_profile_id: override.staff_profile_id,
    shift_date: override.shift_date,
    day_of_week: dayNameFromDate(override.shift_date),
    shift_type: override.shift_type,
    shift_start: override.shift_start,
    shift_end: override.shift_end,
    entry_status: override.override_type === "add_available" ? "available" : "scheduled",
    staff_profiles: override.staff_profiles
  }));
  const effectiveEntries = [
    ...entries.filter((entry) => !removedBaseEntryIds.has(entry.id)),
    ...syntheticEntries
  ];
  const entriesByDate = new Map<string, ScheduleEntryRow[]>();
  const shortagesByDate = new Map<string, ShiftShortageRow[]>();

  effectiveEntries.forEach((entry) => {
    const current = entriesByDate.get(entry.shift_date) ?? [];
    current.push(entry);
    entriesByDate.set(entry.shift_date, current);
  });

  shortages
    .filter((shortage) => !shortage.status || shortage.status === "active")
    .forEach((shortage) => {
    const current = shortagesByDate.get(shortage.shift_date) ?? [];
    current.push(shortage);
    shortagesByDate.set(shortage.shift_date, current);
  });

  const allDates = Array.from(
    new Set([...Array.from(entriesByDate.keys()), ...Array.from(shortagesByDate.keys())])
  ).sort();
  const requestPosts = requests
    .filter((request) => request.status === "active")
    .map(requestToPost)
    .filter((post): post is ShiftPost => Boolean(post));
  const shortagePosts = shortages
    .filter((shortage) => !shortage.status || shortage.status === "active")
    .map(shortageToPost);
  const shiftPosts = [...requestPosts, ...shortagePosts];
  const days = allDates.map((dateValue) => {
    const dayEntries = entriesByDate.get(dateValue) ?? [];
    const dayName = dayNameFromDate(dateValue);
    const dateLabel = compactDateLabel(dateValue);

    return {
      day: `${dayName} ${dateLabel}`,
      dateValue,
      dateLabel,
      scheduled: dayEntries
        .filter((entry) => entry.entry_status === "scheduled")
        .map(entryToScheduleEntry),
      available: dayEntries
        .filter((entry) => entry.entry_status === "available")
        .map(entryToScheduleEntry),
      coverageRequests: [],
      shiftPosts: shiftPosts.filter((post) => post.day === `${dayName} ${dateLabel}`)
    } satisfies DemoDay;
  });

  return { version, entries, effectiveEntries, overrides, requests, offers, shortages, days, shiftPosts };
}

function requestToPost(request: ShiftRequestRow): ShiftPost | null {
  const shift = firstRelatedRow(request.schedule_entries) ?? firstRelatedRow(request.user_schedule_overrides);

  if (!shift) {
    return null;
  }

  const dayName = dayNameFromDate(shift.shift_date);
  const dateLabel = compactDateLabel(shift.shift_date);
  const staffProfile = firstStaffProfile(request.staff_profiles);
  const isSwitch = request.request_type === "switch_requested";

  return {
    id: request.id,
    day: `${dayName} ${dateLabel}`,
    shiftTime: formatShiftTime(shift.shift_start, shift.shift_end),
    shiftCategory: shiftCategoryForType(shift.shift_type),
    shiftTypeLabel: shiftTypeLabels[shift.shift_type],
    postedBy: staffDisplayName(request.staff_profiles),
    staffType: displayStaffType(request.staff_profiles),
    type: isSwitch ? "Switch Requested" : "Coverage Requested",
    coverageIntensity: "low",
    status: isSwitch ? "Switch Requested" : "Coverage Requested",
    description:
      request.note ||
      (isSwitch ? "Open to switching this scheduled shift." : "Coverage requested for this shift."),
    targetStaffName: staffProfile?.display_name,
    targetStaffProfileId: request.staff_profile_id,
    shiftRequestId: request.id,
    scope: "employee"
  };
}

export function firstRelatedRow<T>(value?: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
