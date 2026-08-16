// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";
import {
  formatDirectorSourceShift,
  resolveDirectorCurrentClinicalShift,
  resolveDirectorCurrentShiftStatus,
  resolveDirectorDepartmentSnapshot
} from "@/lib/director-dashboard/shift-status";

const timezone = "America/Los_Angeles";
const activeDay = new Date("2026-08-09T16:00:00.000Z");

function update(overrides: Partial<ShiftStatusUpdate> = {}): ShiftStatusUpdate {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    department_id: "department-1",
    shift_date: "2026-08-08",
    shift_type: "night",
    rts_on: 8,
    rts_required: 8,
    rvu_total: null,
    vent_count: 5,
    bipap_count: 2,
    c_section_count: 1,
    vaginal_delivery_count: 0,
    cabg_count: 0,
    bronch_count: 1,
    sputum_induction_count: 0,
    other_procedure_count: 0,
    other_procedure_note: null,
    shift_note: null,
    updated_by_staff_profile_id: "lead-1",
    updated_by_name: "Lead RT",
    created_at: "2026-08-09T03:15:00.000Z",
    updated_at: "2026-08-09T03:15:00.000Z",
    ...overrides
  };
}

describe("Director latest-known shift submissions", () => {
  it("keeps an early Night submission hidden until the 18:30 clinical handoff", () => {
    const day = update({
      shift_date: "2026-08-09",
      shift_type: "day",
      shift_note: "Day handoff note"
    });
    const night = update({
      id: "00000000-0000-0000-0000-000000000002",
      shift_date: "2026-08-09",
      shift_type: "night",
      shift_note: "Night note",
      created_at: "2026-08-10T00:30:00.000Z",
      updated_at: "2026-08-10T00:30:00.000Z"
    });

    expect(resolveDirectorCurrentClinicalShift([day, night], timezone, new Date("2026-08-10T01:29:59.999Z")).latest).toBe(day);
    expect(resolveDirectorCurrentClinicalShift([day, night], timezone, new Date("2026-08-10T01:30:00.000Z")).latest).toBe(night);
  });

  it("keeps Day visible at 18:30 until a Night update is submitted", () => {
    const day = update({ shift_date: "2026-08-09", shift_type: "day", shift_note: "Day fallback note" });
    const handoffTime = new Date("2026-08-10T01:30:00.000Z");

    expect(resolveDirectorCurrentClinicalShift([day], timezone, handoffTime)).toMatchObject({
      latest: day,
      currentLatest: null,
      fallbackLatest: day,
      showingFallback: true
    });
    expect(resolveDirectorCurrentClinicalShift([day], timezone, handoffTime).latest?.shift_note).toBe("Day fallback note");

    const lateNight = update({
      id: "00000000-0000-0000-0000-000000000002",
      shift_date: "2026-08-09",
      shift_type: "night",
      shift_note: "Night submitted after handoff",
      created_at: "2026-08-10T02:00:00.000Z",
      updated_at: "2026-08-10T02:00:00.000Z"
    });

    expect(resolveDirectorCurrentClinicalShift([day, lateNight], timezone, new Date("2026-08-10T02:00:00.000Z")).latest).toBe(lateNight);
  });

  it("applies the equivalent eligibility and fallback behavior at the 06:30 Day handoff", () => {
    const night = update({ shift_date: "2026-08-09", shift_type: "night", shift_note: "Night fallback note" });
    const earlyDay = update({
      id: "00000000-0000-0000-0000-000000000002",
      shift_date: "2026-08-10",
      shift_type: "day",
      shift_note: "Day note",
      created_at: "2026-08-10T12:30:00.000Z",
      updated_at: "2026-08-10T12:30:00.000Z"
    });

    expect(resolveDirectorCurrentClinicalShift([night, earlyDay], timezone, new Date("2026-08-10T13:29:59.999Z")).latest).toBe(night);
    expect(resolveDirectorCurrentClinicalShift([night], timezone, new Date("2026-08-10T13:30:00.000Z")).latest).toBe(night);
    expect(resolveDirectorCurrentClinicalShift([night], timezone, new Date("2026-08-10T13:30:00.000Z")).latest?.shift_note).toBe("Night fallback note");
    expect(resolveDirectorCurrentClinicalShift([night, earlyDay], timezone, new Date("2026-08-10T13:30:00.000Z")).latest).toBe(earlyDay);
  });

  it("keeps prior status and snapshot across shift and date rollover", () => {
    const prior = update();

    const status = resolveDirectorCurrentShiftStatus([prior], timezone, activeDay);
    const snapshot = resolveDirectorDepartmentSnapshot([prior], timezone, activeDay);

    expect(status.currentWindow).toEqual({ shiftDate: "2026-08-09", shiftType: "day" });
    expect(status.latest).toBe(prior);
    expect(status.showingFallback).toBe(true);
    expect(snapshot.latest).toBe(prior);
    expect(snapshot.showingFallback).toBe(true);
    expect(formatDirectorSourceShift(status.latest)).toBe("08/08 Night Shift");
    expect(formatDirectorSourceShift(snapshot.latest)).toBe("08/08 Night Shift");
  });

  it("does not let an unattributed current-shift placeholder suppress prior submissions", () => {
    const prior = update();
    const placeholder = update({
      id: "00000000-0000-0000-0000-000000000002",
      shift_date: "2026-08-09",
      shift_type: "day",
      rts_on: 0,
      rts_required: 0,
      bipap_count: 0,
      updated_by_staff_profile_id: null,
      updated_by_name: null,
      staff_profiles: null,
      created_at: "2026-08-09T15:30:00.000Z",
      updated_at: "2026-08-09T15:30:00.000Z"
    });

    expect(resolveDirectorCurrentShiftStatus([prior, placeholder], timezone, activeDay).latest).toBe(prior);
    expect(resolveDirectorDepartmentSnapshot([prior, placeholder], timezone, activeDay).latest).toBe(prior);
  });

  it("resolves status and department snapshot independently", () => {
    const prior = update();
    const currentStatusOnly = update({
      id: "00000000-0000-0000-0000-000000000002",
      shift_date: "2026-08-09",
      shift_type: "day",
      rts_on: 7,
      rts_required: 9,
      bipap_count: null as unknown as number,
      created_at: "2026-08-09T15:10:00.000Z",
      updated_at: "2026-08-09T15:10:00.000Z"
    });

    expect(resolveDirectorCurrentShiftStatus([prior, currentStatusOnly], timezone, activeDay).latest).toBe(currentStatusOnly);
    expect(resolveDirectorDepartmentSnapshot([prior, currentStatusOnly], timezone, activeDay).latest).toBe(prior);

    const currentSnapshotOnly = update({
      id: "00000000-0000-0000-0000-000000000003",
      shift_date: "2026-08-09",
      shift_type: "day",
      rts_on: null as unknown as number,
      bipap_count: 4,
      created_at: "2026-08-09T15:20:00.000Z",
      updated_at: "2026-08-09T15:20:00.000Z"
    });

    expect(resolveDirectorCurrentShiftStatus([prior, currentSnapshotOnly], timezone, activeDay).latest).toBe(prior);
    expect(resolveDirectorDepartmentSnapshot([prior, currentSnapshotOnly], timezone, activeDay).latest).toBe(currentSnapshotOnly);
  });

  it("replaces each prior value when that card receives a valid active-shift submission", () => {
    const prior = update();
    const current = update({
      id: "00000000-0000-0000-0000-000000000002",
      shift_date: "2026-08-09",
      shift_type: "day",
      rts_on: 9,
      rts_required: 8,
      bipap_count: 3,
      created_at: "2026-08-09T15:30:00.000Z",
      updated_at: "2026-08-09T15:30:00.000Z"
    });

    expect(resolveDirectorCurrentShiftStatus([prior, current], timezone, activeDay)).toMatchObject({
      latest: current,
      currentLatest: current,
      fallbackLatest: null,
      showingFallback: false
    });
    expect(resolveDirectorDepartmentSnapshot([prior, current], timezone, activeDay)).toMatchObject({
      latest: current,
      currentLatest: current,
      fallbackLatest: null,
      showingFallback: false
    });
    expect(formatDirectorSourceShift(current)).toBe("08/09 Day Shift");
  });

  it("preserves intentional zero counts and rejects missing counts", () => {
    const zero = update({
      rts_on: 0,
      rts_required: 0,
      bipap_count: 0,
      c_section_count: 0,
      vaginal_delivery_count: 0,
      bronch_count: 0
    });
    const missingStatus = update({ rts_on: undefined as unknown as number });
    const missingSnapshot = update({ bipap_count: undefined as unknown as number });

    expect(resolveDirectorCurrentShiftStatus([zero], timezone, activeDay).latest).toBe(zero);
    expect(resolveDirectorDepartmentSnapshot([zero], timezone, activeDay).latest).toBe(zero);
    expect(resolveDirectorCurrentShiftStatus([missingStatus], timezone, activeDay).latest).toBeNull();
    expect(resolveDirectorDepartmentSnapshot([missingSnapshot], timezone, activeDay).latest).toBeNull();
  });

  it("shows true first-use empty states when no valid historical submission exists", () => {
    const draft = update({
      is_draft: true
    } as Partial<ShiftStatusUpdate>);
    const deleted = update({
      is_deleted: true
    } as Partial<ShiftStatusUpdate>);

    expect(resolveDirectorCurrentShiftStatus([], timezone, activeDay).latest).toBeNull();
    expect(resolveDirectorDepartmentSnapshot([draft, deleted], timezone, activeDay).latest).toBeNull();
    expect(formatDirectorSourceShift(null)).toBeNull();
  });

  it("excludes submissions from shifts that are not active yet", () => {
    const prior = update();
    const sameDateNight = update({
      id: "00000000-0000-0000-0000-000000000002",
      shift_date: "2026-08-09",
      shift_type: "night",
      updated_at: "2026-08-10T03:05:00.000Z"
    });
    const futureDay = update({
      id: "00000000-0000-0000-0000-000000000003",
      shift_date: "2026-08-10",
      shift_type: "day",
      updated_at: "2026-08-10T15:05:00.000Z"
    });

    expect(resolveDirectorCurrentShiftStatus([prior, sameDateNight, futureDay], timezone, activeDay).latest).toBe(prior);
    expect(resolveDirectorDepartmentSnapshot([prior, sameDateNight, futureDay], timezone, activeDay).latest).toBe(prior);
  });

  it("uses the hospital operational shift around day/night boundaries", () => {
    const day = update({ shift_date: "2026-08-09", shift_type: "day" });
    const night = update({ shift_date: "2026-08-09", shift_type: "night" });

    expect(resolveDirectorCurrentShiftStatus([day, night], timezone, new Date("2026-08-09T22:59:59.999Z")).latest).toBe(day);
    expect(resolveDirectorCurrentShiftStatus([day, night], timezone, new Date("2026-08-09T23:00:00.000Z")).latest).toBe(night);
    expect(resolveDirectorCurrentShiftStatus([day, night], timezone, new Date("2026-08-10T10:59:59.999Z")).latest).toBe(night);
  });

  it("returns the same persisted records after a refresh with new row objects", () => {
    const prior = update({ rts_on: 0, bipap_count: 0 });
    const firstStatus = resolveDirectorCurrentShiftStatus([prior], timezone, activeDay).latest;
    const firstSnapshot = resolveDirectorDepartmentSnapshot([prior], timezone, activeDay).latest;
    const refreshedRows = [{ ...prior }];

    expect(resolveDirectorCurrentShiftStatus(refreshedRows, timezone, activeDay).latest).toEqual(firstStatus);
    expect(resolveDirectorDepartmentSnapshot(refreshedRows, timezone, activeDay).latest).toEqual(firstSnapshot);
  });
});
