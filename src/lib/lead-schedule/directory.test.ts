import { describe, expect, it } from "vitest";
import {
  buildCurrentShiftRoster,
  buildDirectorySections,
  normalizeDirectoryName,
  type DirectoryStaffProfile,
  type LeadScheduleEntry,
  type LeadScheduleOverride,
  type ScheduledStaffProfile
} from "@/lib/lead-schedule/directory";

function directoryProfile(overrides: Partial<DirectoryStaffProfile> = {}): DirectoryStaffProfile {
  return {
    id: "staff-1",
    display_name: "Senior Therapist",
    first_name: "Senior",
    last_name: "Therapist",
    hire_date: "2000-01-01",
    phone_number: "510-555-0100",
    employment_type: "full_time",
    home_assignment: "day_shift",
    operations_role: "none",
    directory_shift: "day",
    name_aliases: [],
    is_active: true,
    ...overrides
  };
}

function scheduledProfile(profile: DirectoryStaffProfile): ScheduledStaffProfile {
  return {
    id: profile.id,
    display_name: profile.display_name,
    employment_type: profile.employment_type,
    home_assignment: profile.home_assignment,
    operations_role: profile.operations_role,
    is_active: profile.is_active
  };
}

function entry(
  profile: ScheduledStaffProfile,
  shiftType: string,
  id = `entry-${profile.id}`
): LeadScheduleEntry {
  return {
    id,
    staff_profile_id: profile.id,
    shift_type: shiftType,
    entry_status: "scheduled",
    staff_profiles: profile
  };
}

function override(
  profile: ScheduledStaffProfile,
  overrideType: string,
  shiftType: string,
  baseScheduleEntryId: string | null = null
): LeadScheduleOverride {
  return {
    id: `override-${profile.id}-${overrideType}`,
    staff_profile_id: profile.id,
    base_schedule_entry_id: baseScheduleEntryId,
    override_type: overrideType,
    shift_type: shiftType,
    is_active: true,
    staff_profiles: profile
  };
}

describe("Lead Schedule directory data", () => {
  it("normalizes case, punctuation, spacing, and LAST, FIRST names without fuzzy matching", () => {
    expect(normalizeDirectoryName("  Khera, Pawanjit ")).toBe("pawanjit khera");
    expect(normalizeDirectoryName("MY-QUYEN   GIANG")).toBe("my quyen giang");
    expect(normalizeDirectoryName("Kinty Khera")).not.toBe(normalizeDirectoryName("Kathy Khera"));
  });

  it("uses actual scheduled shift, deduplicates staff, applies active add/remove overrides, and excludes aides/support roles", () => {
    const dayRt = directoryProfile({ id: "day-rt", display_name: "Day RT", hire_date: "1999-01-01" });
    const perDiemNightHome = directoryProfile({
      id: "actual-day",
      display_name: "Actual Day",
      first_name: "Actual",
      last_name: "Day",
      employment_type: "per_diem",
      home_assignment: "night_shift",
      directory_shift: "night",
      hire_date: "2000-01-01"
    });
    const removed = directoryProfile({ id: "removed", display_name: "Removed RT" });
    const added = directoryProfile({ id: "added", display_name: "Added RT", first_name: "Added", last_name: "RT", hire_date: "2001-01-01" });
    const aide = directoryProfile({ id: "aide", display_name: "RT Aide", operations_role: "aide", home_assignment: "rt_aide" });
    const director = directoryProfile({ id: "director", display_name: "Director", operations_role: "director" });
    const entries = [
      entry(scheduledProfile(dayRt), "day_shift"),
      entry(scheduledProfile(dayRt), "pulmonary_rehab", "duplicate-reference"),
      entry(scheduledProfile(dayRt), "pft", "duplicate-pft-reference"),
      entry(scheduledProfile(perDiemNightHome), "day_shift"),
      entry(scheduledProfile(removed), "day_shift", "remove-me"),
      entry(scheduledProfile(aide), "rt_aide"),
      entry(scheduledProfile(director), "day_shift"),
      entry(scheduledProfile(directoryProfile({ id: "night-rt" })), "night_shift")
    ];
    const overrides = [
      override(scheduledProfile(removed), "remove_self", "day_shift", "remove-me"),
      override(scheduledProfile(added), "add_self", "day_shift")
    ];

    const roster = buildCurrentShiftRoster(
      entries,
      overrides,
      [dayRt, perDiemNightHome, removed, added, aide, director],
      "day"
    );

    expect(roster.map((employee) => employee.id)).toEqual(["day-rt", "actual-day", "added"]);
    expect(roster.find((employee) => employee.id === "day-rt")?.employmentType).toBe("full_time");
    expect(roster.find((employee) => employee.id === "actual-day")?.employmentType).toBe("per_diem");
  });

  it("sorts most senior first, puts missing hire dates last, breaks ties by name, and preserves unmatched schedule names", () => {
    const alpha = directoryProfile({ id: "alpha", display_name: "Alpha Zed", first_name: "Alpha", last_name: "Zed", hire_date: "2001-01-01" });
    const beta = directoryProfile({ id: "beta", display_name: "Beta Able", first_name: "Beta", last_name: "Able", hire_date: "2001-01-01" });
    const newest = directoryProfile({ id: "newest", display_name: "Newest RT", first_name: "Newest", last_name: "RT", hire_date: "2025-01-01" });
    const legacy = directoryProfile({ id: "legacy", display_name: "Legacy Scheduled Name", first_name: null, last_name: null, hire_date: null, directory_shift: null });
    const roster = buildCurrentShiftRoster(
      [alpha, beta, newest, legacy].map((profile) => entry(scheduledProfile(profile), "day_shift")),
      [],
      [alpha, beta, newest],
      "day"
    );

    expect(roster.map((employee) => employee.fullName)).toEqual([
      "Beta Able",
      "Alpha Zed",
      "Newest RT",
      "Legacy Scheduled Name"
    ]);
    expect(roster.at(-1)).toMatchObject({ directoryAvailable: false, phoneNumber: null, hireDate: null });
  });

  it("resolves an exact known alias for legacy schedule identities without fuzzy matching", () => {
    const scheduledLegacy = directoryProfile({
      id: "legacy-id",
      display_name: "Pawanjit Khera",
      first_name: null,
      last_name: null,
      hire_date: null,
      directory_shift: null
    });
    const canonical = directoryProfile({
      id: "canonical-id",
      display_name: "Kinty Khera",
      first_name: "Kinty",
      last_name: "Khera",
      name_aliases: ["Pawanjit Khera"]
    });

    expect(buildCurrentShiftRoster(
      [entry(scheduledProfile(scheduledLegacy), "day_shift")],
      [],
      [canonical],
      "day"
    )).toEqual([
      expect.objectContaining({ id: "legacy-id", fullName: "Kinty Khera", directoryAvailable: true })
    ]);
  });

  it("keeps paper-roster section order, filters employment type, and searches preferred/legal aliases", () => {
    const profiles = [
      directoryProfile({ id: "pd", display_name: "Mona Ahmed", first_name: "Mona", last_name: "Ahmed", employment_type: "per_diem" }),
      directoryProfile({ id: "kinty", display_name: "Pawanjit Khera", first_name: "Kinty", last_name: "Khera", name_aliases: ["Pawanjit Khera"] }),
      directoryProfile({ id: "maggie", display_name: "Yiqin Meng", first_name: "Maggie", last_name: "Meng", name_aliases: ["Yiqin Meng"] }),
      directoryProfile({ id: "night", display_name: "Night RT", first_name: "Night", last_name: "RT", directory_shift: "night", home_assignment: "night_shift" }),
      directoryProfile({ id: "aide", display_name: "Aide Person", first_name: "Aide", last_name: "Person", operations_role: "aide", home_assignment: "rt_aide" })
    ];

    expect(buildDirectorySections(profiles, "all").map((section) => section.label)).toEqual([
      "Per Diem",
      "Full-Time Day Shift",
      "Full-Time Night Shift"
    ]);
    expect(buildDirectorySections(profiles, "full_time").map((section) => section.label)).toEqual([
      "Full-Time Day Shift",
      "Full-Time Night Shift"
    ]);
    expect(buildDirectorySections(profiles, "per_diem")[0].employees.map((employee) => employee.fullName)).toEqual(["Mona Ahmed"]);
    expect(buildDirectorySections(profiles, "all", "Pawanjit")[1].employees[0].fullName).toBe("Kinty Khera");
    expect(buildDirectorySections(profiles, "all", "Yiqin")[1].employees[0].fullName).toBe("Maggie Meng");
    expect(buildDirectorySections(profiles, "all").flatMap((section) => section.employees).some((employee) => employee.id === "aide")).toBe(false);
  });
});
