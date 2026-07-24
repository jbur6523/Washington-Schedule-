import { phoneListRows } from "@/lib/phone-list/rows";
import type {
  PhoneListAssignment,
  PhoneListDirectoryStaff,
  PhoneListDraftRow,
  PhoneListRosterMember,
  PhoneListScheduleEntry,
  PhoneListScheduleOverride,
  PhoneListShiftType
} from "@/lib/phone-list/types";

function firstStaffProfile(
  value:
    | { id: string; display_name: string }
    | Array<{ id: string; display_name: string }>
    | null
) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function scheduleShiftMatchesPhoneList(shiftType: string, selectedShift: PhoneListShiftType) {
  return selectedShift === "night" ? shiftType === "night_shift" : shiftType !== "night_shift";
}

export function buildScheduledRoster(
  entries: PhoneListScheduleEntry[],
  overrides: PhoneListScheduleOverride[],
  selectedShift: PhoneListShiftType
): PhoneListRosterMember[] {
  const activeOverrides = overrides.filter((override) => override.is_active);
  const removedEntryIds = new Set(
    activeOverrides
      .filter((override) => override.override_type === "remove_self" && override.base_schedule_entry_id)
      .map((override) => override.base_schedule_entry_id as string)
  );
  const candidates: PhoneListDirectoryStaff[] = [];

  entries
    .filter(
      (entry) =>
        entry.entry_status === "scheduled" &&
        !removedEntryIds.has(entry.id) &&
        scheduleShiftMatchesPhoneList(entry.shift_type, selectedShift)
    )
    .forEach((entry) => {
      const staff = firstStaffProfile(entry.staff_profiles);

      if (entry.staff_profile_id && staff?.display_name) {
        candidates.push({ id: entry.staff_profile_id, displayName: staff.display_name });
      }
    });

  activeOverrides
    .filter(
      (override) =>
        override.override_type === "add_self" &&
        scheduleShiftMatchesPhoneList(override.shift_type, selectedShift)
    )
    .forEach((override) => {
      const staff = firstStaffProfile(override.staff_profiles);

      if (staff?.display_name) {
        candidates.push({ id: override.staff_profile_id, displayName: staff.display_name });
      }
    });

  const uniqueByStaffProfileId = new Map<string, PhoneListDirectoryStaff>();
  candidates.forEach((candidate) => {
    if (!uniqueByStaffProfileId.has(candidate.id)) {
      uniqueByStaffProfileId.set(candidate.id, candidate);
    }
  });

  return Array.from(uniqueByStaffProfileId.values())
    .sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName, "en", { sensitivity: "base" }) ||
        left.id.localeCompare(right.id)
    )
    .map((staff, index) => ({ ...staff, rosterNumber: index + 1 }));
}

export function emptyPhoneListAssignments(): PhoneListAssignment[] {
  return phoneListRows.map((row) => ({
    rowKey: row.key,
    staffProfileId: null,
    staffNameSnapshot: "",
    phoneNumber: ""
  }));
}

export function assignmentsFromDraft(draft: PhoneListDraftRow | null): PhoneListAssignment[] {
  const savedByRowKey = new Map(
    (draft?.phone_list_assignments ?? []).map((assignment) => [assignment.row_key, assignment])
  );

  return phoneListRows.map((row) => {
    const saved = savedByRowKey.get(row.key);

    return {
      rowKey: row.key,
      staffProfileId: saved?.selected_staff_profile_id ?? null,
      staffNameSnapshot: saved?.staff_name_snapshot ?? "",
      phoneNumber: saved?.phone_number ?? ""
    };
  });
}

export function normalizeManualName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function assignmentIdentity(assignment: PhoneListAssignment) {
  if (assignment.staffProfileId) {
    return `staff:${assignment.staffProfileId}`;
  }

  const normalizedName = normalizeManualName(assignment.staffNameSnapshot);
  return normalizedName ? `manual:${normalizedName}` : null;
}

function rememberedPhone(assignments: PhoneListAssignment[], identity: string | null, excludedRowKey: string) {
  if (!identity) {
    return "";
  }

  return (
    assignments.find(
      (assignment) =>
        assignment.rowKey !== excludedRowKey &&
        assignmentIdentity(assignment) === identity &&
        assignment.phoneNumber.trim()
    )?.phoneNumber ?? ""
  );
}

export function selectStaffForAssignment(
  assignments: PhoneListAssignment[],
  rowKey: string,
  staff: PhoneListDirectoryStaff
) {
  const identity = `staff:${staff.id}`;
  const phoneNumber = rememberedPhone(assignments, identity, rowKey);

  return assignments.map((assignment) =>
    assignment.rowKey === rowKey
      ? {
          ...assignment,
          staffProfileId: staff.id,
          staffNameSnapshot: staff.displayName,
          phoneNumber:
            assignmentIdentity(assignment) === identity
              ? assignment.phoneNumber
              : phoneNumber
        }
      : assignment
  );
}

export function enterManualName(assignments: PhoneListAssignment[], rowKey: string, value: string) {
  const currentAssignment = assignments.find((assignment) => assignment.rowKey === rowKey);
  const nextAssignment: PhoneListAssignment = {
    rowKey,
    staffProfileId: null,
    staffNameSnapshot: value,
    phoneNumber: ""
  };
  const phoneNumber = rememberedPhone(assignments, assignmentIdentity(nextAssignment), rowKey);

  return assignments.map((assignment) =>
    assignment.rowKey === rowKey
      ? {
          ...assignment,
          staffProfileId: null,
          staffNameSnapshot: value,
          phoneNumber:
            currentAssignment && assignmentIdentity(currentAssignment) === assignmentIdentity(nextAssignment)
              ? assignment.phoneNumber
              : phoneNumber
        }
      : assignment
  );
}

export function applyRosterShortcut(
  assignments: PhoneListAssignment[],
  rowKey: string,
  value: string,
  roster: PhoneListRosterMember[]
) {
  if (!/^\d+$/.test(value.trim())) {
    return assignments;
  }

  const rosterMember = roster[Number(value.trim()) - 1];
  return rosterMember ? selectStaffForAssignment(assignments, rowKey, rosterMember) : assignments;
}

export function updatePhoneForAssignment(
  assignments: PhoneListAssignment[],
  rowKey: string,
  phoneNumber: string
) {
  const target = assignments.find((assignment) => assignment.rowKey === rowKey);
  const identity = target ? assignmentIdentity(target) : null;

  return assignments.map((assignment) => {
    if (assignment.rowKey === rowKey || (identity && assignmentIdentity(assignment) === identity)) {
      return { ...assignment, phoneNumber };
    }

    return assignment;
  });
}

export function directoryMatch(directory: PhoneListDirectoryStaff[], value: string) {
  const normalizedValue = normalizeManualName(value);
  return directory.find((staff) => normalizeManualName(staff.displayName) === normalizedValue) ?? null;
}
