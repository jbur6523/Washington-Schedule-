export type DirectoryEmploymentType = "full_time" | "per_diem";
export type DirectoryShift = "day" | "night";
export type DirectoryFilter = "all" | DirectoryEmploymentType;

export type DirectoryStaffProfile = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  hire_date: string | null;
  phone_number: string | null;
  employment_type: DirectoryEmploymentType;
  home_assignment: string;
  operations_role: string | null;
  directory_shift: DirectoryShift | null;
  name_aliases: string[] | null;
  is_active: boolean;
};

export type ScheduledStaffProfile = Pick<
  DirectoryStaffProfile,
  "id" | "display_name" | "employment_type" | "home_assignment" | "operations_role" | "is_active"
>;

export type LeadScheduleEntry = {
  id: string;
  staff_profile_id: string | null;
  shift_type: string;
  entry_status: "scheduled" | "available";
  staff_profiles: ScheduledStaffProfile | ScheduledStaffProfile[] | null;
};

export type LeadScheduleOverride = {
  id: string;
  staff_profile_id: string;
  base_schedule_entry_id: string | null;
  override_type: string;
  shift_type: string;
  is_active: boolean;
  staff_profiles: ScheduledStaffProfile | ScheduledStaffProfile[] | null;
};

export type DirectoryEmployee = DirectoryStaffProfile & {
  fullName: string;
};

export type ScheduledDirectoryEmployee = {
  id: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber: string | null;
  hireDate: string | null;
  employmentType: DirectoryEmploymentType;
  directoryAvailable: boolean;
};

export type DirectorySection = {
  key: "per_diem" | "full_time_day" | "full_time_night";
  label: string;
  employees: DirectoryEmployee[];
};

function firstProfile<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function normalizeDirectoryName(value: string) {
  const trimmed = value.trim();
  const commaParts = trimmed.split(",");
  const ordered = commaParts.length === 2
    ? `${commaParts[1].trim()} ${commaParts[0].trim()}`
    : trimmed;

  return ordered
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function directoryDisplayName(profile: Pick<DirectoryStaffProfile, "display_name" | "first_name" | "last_name">) {
  const structuredName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  return structuredName || profile.display_name;
}

function directoryNameVariants(profile: DirectoryStaffProfile) {
  return [
    profile.display_name,
    directoryDisplayName(profile),
    ...(profile.name_aliases ?? [])
  ].map(normalizeDirectoryName).filter(Boolean);
}

function hasDirectoryMetadata(profile: DirectoryStaffProfile | null) {
  return Boolean(profile?.first_name && profile.last_name && profile.directory_shift);
}

export function seniorityCompare(
  left: Pick<DirectoryEmployee, "hire_date" | "last_name" | "first_name" | "fullName">,
  right: Pick<DirectoryEmployee, "hire_date" | "last_name" | "first_name" | "fullName">
) {
  if (left.hire_date && right.hire_date && left.hire_date !== right.hire_date) {
    return left.hire_date.localeCompare(right.hire_date);
  }
  if (left.hire_date && !right.hire_date) return -1;
  if (!left.hire_date && right.hire_date) return 1;

  return (
    (left.last_name ?? left.fullName).localeCompare(right.last_name ?? right.fullName, "en", { sensitivity: "base" })
    || (left.first_name ?? "").localeCompare(right.first_name ?? "", "en", { sensitivity: "base" })
    || left.fullName.localeCompare(right.fullName, "en", { sensitivity: "base" })
  );
}

function scheduledSeniorityCompare(left: ScheduledDirectoryEmployee, right: ScheduledDirectoryEmployee) {
  if (left.employmentType !== right.employmentType) {
    return left.employmentType === "full_time" ? -1 : 1;
  }

  return seniorityCompare(
    {
      hire_date: left.hireDate,
      last_name: left.lastName ?? left.fullName.split(/\s+/).at(-1) ?? left.fullName,
      first_name: left.firstName ?? left.fullName.split(/\s+/)[0] ?? "",
      fullName: left.fullName
    },
    {
      hire_date: right.hireDate,
      last_name: right.lastName ?? right.fullName.split(/\s+/).at(-1) ?? right.fullName,
      first_name: right.firstName ?? right.fullName.split(/\s+/)[0] ?? "",
      fullName: right.fullName
    }
  );
}

export function scheduleShiftMatches(shiftType: string, selectedShift: DirectoryShift) {
  return selectedShift === "night" ? shiftType === "night_shift" : shiftType !== "night_shift";
}

function isRespiratoryTherapist(profile: ScheduledStaffProfile | null, shiftType: string) {
  if (!profile) return false;
  if (profile.operations_role && profile.operations_role !== "none") return false;
  return shiftType !== "rt_aide" && profile.home_assignment !== "rt_aide";
}

export function buildCurrentShiftRoster(
  entries: LeadScheduleEntry[],
  overrides: LeadScheduleOverride[],
  directory: DirectoryStaffProfile[],
  selectedShift: DirectoryShift
): ScheduledDirectoryEmployee[] {
  const directoryById = new Map(directory.map((profile) => [profile.id, profile]));
  const directoryByExactName = new Map<string, DirectoryStaffProfile | null>();
  for (const profile of directory) {
    for (const name of directoryNameVariants(profile)) {
      if (!directoryByExactName.has(name)) {
        directoryByExactName.set(name, profile);
        continue;
      }
      const existing = directoryByExactName.get(name);
      if (!existing || existing.id !== profile.id) {
        directoryByExactName.set(name, null);
      }
    }
  }
  const removedEntryIds = new Set(
    overrides
      .filter((override) => override.is_active && override.override_type === "remove_self" && override.base_schedule_entry_id)
      .map((override) => override.base_schedule_entry_id as string)
  );
  const candidates: Array<{ id: string; profile: ScheduledStaffProfile; shiftType: string }> = [];

  for (const entry of entries) {
    const profile = firstProfile(entry.staff_profiles);
    if (
      entry.entry_status === "scheduled"
      && !removedEntryIds.has(entry.id)
      && scheduleShiftMatches(entry.shift_type, selectedShift)
      && entry.staff_profile_id
      && profile
      && isRespiratoryTherapist(profile, entry.shift_type)
    ) {
      candidates.push({ id: entry.staff_profile_id, profile, shiftType: entry.shift_type });
    }
  }

  for (const override of overrides) {
    const profile = firstProfile(override.staff_profiles);
    if (
      override.is_active
      && override.override_type === "add_self"
      && scheduleShiftMatches(override.shift_type, selectedShift)
      && profile
      && isRespiratoryTherapist(profile, override.shift_type)
    ) {
      candidates.push({ id: override.staff_profile_id, profile, shiftType: override.shift_type });
    }
  }

  const uniqueCandidates = new Map<string, ScheduledDirectoryEmployee>();
  for (const candidate of candidates) {
    const normalizedEmploymentType: DirectoryEmploymentType =
      candidate.shiftType === "pft"
      || candidate.shiftType === "pulmonary_rehab"
      || candidate.profile.home_assignment === "pft"
      || candidate.profile.home_assignment === "pulmonary_rehab"
        ? "full_time"
        : candidate.profile.employment_type;
    const existing = uniqueCandidates.get(candidate.id);
    if (existing) {
      if (normalizedEmploymentType === "full_time") {
        existing.employmentType = "full_time";
      }
      continue;
    }
    const idMetadata = directoryById.get(candidate.id) ?? null;
    const exactNameMetadata = directoryByExactName.get(normalizeDirectoryName(candidate.profile.display_name)) ?? null;
    const metadata = hasDirectoryMetadata(idMetadata) ? idMetadata : exactNameMetadata;
    uniqueCandidates.set(candidate.id, {
      id: candidate.id,
      fullName: metadata ? directoryDisplayName(metadata) : candidate.profile.display_name,
      firstName: metadata?.first_name ?? null,
      lastName: metadata?.last_name ?? null,
      phoneNumber: metadata?.phone_number ?? null,
      hireDate: metadata?.hire_date ?? null,
      employmentType: normalizedEmploymentType === "full_time"
        ? "full_time"
        : metadata?.employment_type ?? normalizedEmploymentType,
      directoryAvailable: hasDirectoryMetadata(metadata)
    });
  }

  return Array.from(uniqueCandidates.values()).sort(scheduledSeniorityCompare);
}

function isDirectoryEmployee(profile: DirectoryStaffProfile) {
  return (
    profile.is_active
    && (!profile.operations_role || profile.operations_role === "none")
    && profile.home_assignment !== "rt_aide"
    && Boolean(profile.first_name && profile.last_name && profile.directory_shift)
  );
}

function profileMatchesSearch(profile: DirectoryStaffProfile, query: string) {
  const normalizedQuery = normalizeDirectoryName(query);
  if (!normalizedQuery) return true;
  const searchableNames = [
    profile.first_name ?? "",
    profile.last_name ?? "",
    directoryDisplayName(profile),
    profile.display_name,
    ...directoryNameVariants(profile)
  ];
  return searchableNames.some((name) => normalizeDirectoryName(name).includes(normalizedQuery));
}

export function buildDirectorySections(
  profiles: DirectoryStaffProfile[],
  filter: DirectoryFilter,
  query = ""
): DirectorySection[] {
  const employees = profiles
    .filter(isDirectoryEmployee)
    .filter((profile) => filter === "all" || profile.employment_type === filter)
    .filter((profile) => profileMatchesSearch(profile, query))
    .map((profile) => ({ ...profile, fullName: directoryDisplayName(profile) }))
    .sort(seniorityCompare);

  const sections: DirectorySection[] = [];
  if (filter === "all" || filter === "per_diem") {
    sections.push({
      key: "per_diem",
      label: "Per Diem",
      employees: employees.filter((employee) => employee.employment_type === "per_diem")
    });
  }
  if (filter === "all" || filter === "full_time") {
    sections.push(
      {
        key: "full_time_day",
        label: "Full-Time Day Shift",
        employees: employees.filter(
          (employee) => employee.employment_type === "full_time" && employee.directory_shift === "day"
        )
      },
      {
        key: "full_time_night",
        label: "Full-Time Night Shift",
        employees: employees.filter(
          (employee) => employee.employment_type === "full_time" && employee.directory_shift === "night"
        )
      }
    );
  }

  return sections;
}

export function formatDirectoryPhoneHref(phoneNumber: string) {
  return `tel:${phoneNumber.replace(/[^\d+]/g, "")}`;
}
