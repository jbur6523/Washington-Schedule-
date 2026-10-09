import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayScheduleCard } from "@/components/DayScheduleCard";
import { withLeadShiftHours } from "@/lib/schedule/lead-shift-hours";
import { adaptActiveSchedule, type ScheduleEntryRow, type ScheduleVersionRow, type ShiftRequestRow } from "@/lib/schedule/supabase-schedule";

const version = { id: "version" } as ScheduleVersionRow;
const entry: ScheduleEntryRow = {
  id: "day-lead", schedule_version_id: "version", department_id: "department",
  staff_profile_id: "staff", shift_date: "2026-10-09", day_of_week: "Friday",
  shift_type: "day_shift", shift_start: "06:30:00", shift_end: "19:00:00",
  entry_status: "scheduled", is_shift_lead: true,
  staff_profiles: { id: "staff", display_name: "Assigned Lead", employment_type: "full_time", home_assignment: "day_shift" }
};

describe("assigned Lead shift hours", () => {
  it("sets day and overnight hours without mutating stored entries", () => {
    expect(withLeadShiftHours(entry)).toMatchObject({ shift_start: "05:30", shift_end: "18:00" });
    expect(withLeadShiftHours({ ...entry, shift_type: "night_shift" })).toMatchObject({ shift_start: "19:30", shift_end: "06:00" });
    expect(entry.shift_start).toBe("06:30:00");
  });

  it.each([false, null, undefined])("preserves regular hours without a Lead assignment (%s)", is_shift_lead => {
    const regular = { ...entry, is_shift_lead, shift_start: "08:00", shift_end: "16:00" };
    expect(withLeadShiftHours(regular)).toBe(regular);
  });

  it("preserves availability and specialty shift hours", () => {
    for (const unchanged of [{ ...entry, entry_status: "available" }, { ...entry, shift_type: "pft" }]) {
      expect(withLeadShiftHours(unchanged)).toBe(unchanged);
    }
  });

  it("uses the same hours for personal schedule, cover/switch posts, and mobile schedule rows", () => {
    const night = { ...entry, id: "night-lead", shift_type: "night_shift" as const };
    const regular = { ...entry, id: "regular", is_shift_lead: false };
    const request = {
      id: "request", status: "active", request_type: "coverage_requested", staff_profile_id: "staff",
      schedule_entry_id: entry.id, schedule_entries: entry, staff_profiles: entry.staff_profiles,
      department_id: "department", user_schedule_override_id: null, note: null,
      created_at: "2026-10-09T12:00:00Z", updated_at: "2026-10-09T12:00:00Z"
    } satisfies ShiftRequestRow;
    const schedule = adaptActiveSchedule(version, [entry, night, regular], [], [], [request]);
    expect(schedule.entries[0].shift_start).toBe("05:30");
    expect(schedule.effectiveEntries[1].shift_end).toBe("06:00");
    expect(schedule.entries[2].shift_start).toBe("06:30:00");
    expect(schedule.shiftPosts[0].shiftTime).toBe("05:30-18:00");
    render(<DayScheduleCard day={schedule.days[0]} expanded shiftFilter="all" onToggle={() => {}} />);
    expect(screen.getAllByText("05:30-18:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("19:30-06:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("06:30-19:00").length).toBeGreaterThan(0);
  });
});
