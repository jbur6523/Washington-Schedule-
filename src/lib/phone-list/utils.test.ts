import { describe, expect, it } from "vitest";
import type {
  PhoneListScheduleEntry,
  PhoneListScheduleOverride
} from "@/lib/phone-list/types";
import {
  applyRosterShortcut,
  assignmentsFromDraft,
  buildScheduledRoster,
  directoryMatch,
  emptyPhoneListAssignments,
  enterManualName,
  selectStaffForAssignment,
  updatePhoneForAssignment
} from "@/lib/phone-list/utils";

function entry(
  id: string,
  staffId: string,
  displayName: string,
  shiftType: string,
  entryStatus: "scheduled" | "available" = "scheduled"
): PhoneListScheduleEntry {
  return {
    id,
    staff_profile_id: staffId,
    shift_type: shiftType,
    entry_status: entryStatus,
    staff_profiles: { id: staffId, display_name: displayName }
  };
}

function override(
  id: string,
  staffId: string,
  displayName: string,
  overrideType: string,
  shiftType: string,
  baseScheduleEntryId: string | null = null
): PhoneListScheduleOverride {
  return {
    id,
    staff_profile_id: staffId,
    base_schedule_entry_id: baseScheduleEntryId,
    override_type: overrideType,
    shift_type: shiftType,
    is_active: true,
    staff_profiles: { id: staffId, display_name: displayName }
  };
}

describe("phone-list scheduled roster", () => {
  it("loads only the selected shift and includes scheduled aides", () => {
    const roster = buildScheduledRoster(
      [
        entry("1", "staff-night", "Night Staff", "night_shift"),
        entry("2", "staff-day", "Day Staff", "day_shift"),
        entry("3", "staff-aide", "Day Aide", "rt_aide")
      ],
      [],
      "day"
    );

    expect(roster.map((staff) => staff.displayName)).toEqual(["Day Aide", "Day Staff"]);
  });

  it("excludes available-only rows and available overrides", () => {
    const roster = buildScheduledRoster(
      [
        entry("1", "staff-scheduled", "Scheduled Staff", "day_shift"),
        entry("2", "staff-available", "Available Staff", "day_shift", "available")
      ],
      [
        override("1", "staff-added", "Added Staff", "add_self", "day_shift"),
        override("2", "staff-offered", "Offered Staff", "add_available", "day_shift")
      ],
      "day"
    );

    expect(roster.map((staff) => staff.displayName)).toEqual(["Added Staff", "Scheduled Staff"]);
  });

  it("applies active removals and produces stable alphabetical numbering", () => {
    const entries = [
      entry("remove-me", "staff-z", "Zoe Staff", "day_shift"),
      entry("2", "staff-b", "Bravo Therapist", "day_shift"),
      entry("3", "staff-a", "Alpha Therapist", "day_shift"),
      entry("4", "staff-a", "Alpha Therapist", "day_shift")
    ];
    const overrides = [
      override("remove", "staff-z", "Zoe Staff", "remove_self", "day_shift", "remove-me")
    ];

    expect(buildScheduledRoster(entries, overrides, "day")).toEqual([
      { id: "staff-a", displayName: "Alpha Therapist", rosterNumber: 1 },
      { id: "staff-b", displayName: "Bravo Therapist", rosterNumber: 2 }
    ]);
  });
});

describe("phone-list assignment helpers", () => {
  it("selects a scheduled roster number", () => {
    const assignments = enterManualName(emptyPhoneListAssignments(), "main_lead_therapist", "2");
    const result = applyRosterShortcut(assignments, "main_lead_therapist", "2", [
      { id: "staff-1", displayName: "Alpha Therapist", rosterNumber: 1 },
      { id: "staff-2", displayName: "Bravo Therapist", rosterNumber: 2 }
    ]);

    expect(result[0]).toMatchObject({
      staffProfileId: "staff-2",
      staffNameSnapshot: "Bravo Therapist"
    });
  });

  it("matches any active directory entry, including off-shift staff", () => {
    const directory = [
      { id: "scheduled", displayName: "Scheduled Staff" },
      { id: "off-shift", displayName: "Off Shift Staff" }
    ];

    expect(directoryMatch(directory, "off shift staff")).toEqual(directory[1]);
  });

  it("keeps a manual-name fallback without a staff profile reference", () => {
    const result = enterManualName(emptyPhoneListAssignments(), "main_lead_therapist", "Agency Therapist");

    expect(result[0]).toMatchObject({
      staffProfileId: null,
      staffNameSnapshot: "Agency Therapist"
    });
  });

  it("autofills a repeated selected person's phone and synchronizes later changes", () => {
    let assignments = selectStaffForAssignment(
      emptyPhoneListAssignments(),
      "main_lead_therapist",
      { id: "staff-2", displayName: "Bravo Therapist" }
    );
    assignments = updatePhoneForAssignment(assignments, "main_lead_therapist", "6303");
    assignments = selectStaffForAssignment(
      assignments,
      "main_rapid_response",
      { id: "staff-2", displayName: "Bravo Therapist" }
    );

    expect(assignments[1].phoneNumber).toBe("6303");

    assignments = updatePhoneForAssignment(assignments, "main_rapid_response", "6404");
    expect(assignments[0].phoneNumber).toBe("6404");
    expect(assignments[1].phoneNumber).toBe("6404");
  });

  it("reuses phone numbers for normalized manual names", () => {
    let assignments = enterManualName(emptyPhoneListAssignments(), "main_lead_therapist", "Agency Therapist");
    assignments = updatePhoneForAssignment(assignments, "main_lead_therapist", "6200");
    assignments = enterManualName(assignments, "main_rapid_response", "  agency   therapist ");

    expect(assignments[1].phoneNumber).toBe("6200");
  });

  it("keeps phone-number memory separate between draft states", () => {
    const dayDraft = updatePhoneForAssignment(
      enterManualName(emptyPhoneListAssignments(), "main_lead_therapist", "Agency Therapist"),
      "main_lead_therapist",
      "6303"
    );
    const nightDraft = enterManualName(
      emptyPhoneListAssignments(),
      "main_lead_therapist",
      "Agency Therapist"
    );

    expect(dayDraft[0].phoneNumber).toBe("6303");
    expect(nightDraft[0].phoneNumber).toBe("");
  });

  it("reloads a saved draft while retaining all blank canonical rows", () => {
    const assignments = assignmentsFromDraft({
      id: "draft-1",
      schedule_date: "2026-07-24",
      shift_type: "day",
      updated_at: "2026-07-24T12:00:00Z",
      phone_list_assignments: [
        {
          row_key: "main_lead_therapist",
          selected_staff_profile_id: "staff-1",
          staff_name_snapshot: "Saved Therapist",
          phone_number: "6303"
        }
      ]
    });

    expect(assignments).toHaveLength(31);
    expect(assignments[0]).toMatchObject({
      staffProfileId: "staff-1",
      staffNameSnapshot: "Saved Therapist",
      phoneNumber: "6303"
    });
    expect(assignments[1]).toMatchObject({
      staffProfileId: null,
      staffNameSnapshot: "",
      phoneNumber: ""
    });
  });
});
