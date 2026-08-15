import { describe, expect, it } from "vitest";
import { isFreshProcedureUpdate, procedureCounts, procedureTotal } from "@/lib/shift-status/procedures";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

const update: ShiftStatusUpdate = {
  id: "status-1",
  department_id: "department-1",
  shift_date: "2026-08-09",
  shift_type: "day",
  rts_on: 8,
  rts_required: 8,
  rvu_total: null,
  vent_count: null,
  bipap_count: 0,
  c_section_count: 1,
  vaginal_delivery_count: 2,
  cabg_count: 3,
  bronch_count: 4,
  sputum_induction_count: 5,
  other_procedure_count: 6,
  other_procedure_note: null,
  shift_note: null,
  updated_by_staff_profile_id: "staff-1",
  updated_by_name: "Lead RT",
  created_at: "2026-08-09T15:00:00.000Z",
  updated_at: "2026-08-09T15:00:00.000Z"
};

describe("procedure summary helpers", () => {
  it("uses all canonical procedure fields for the total", () => {
    expect(procedureTotal(procedureCounts(update))).toBe(21);
  });

  it("preserves the existing 24-hour freshness boundary", () => {
    expect(isFreshProcedureUpdate(update, new Date("2026-08-10T14:59:59.999Z"))).toBe(true);
    expect(isFreshProcedureUpdate(update, new Date("2026-08-10T15:00:00.000Z"))).toBe(false);
  });
});
