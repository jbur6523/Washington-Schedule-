// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveShiftStatusUpdate } from "./actions";
import type { ShiftStatusSavePayload } from "@/lib/shift-status/types";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getAuthenticatedUserContext: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
const payload: ShiftStatusSavePayload = {
  shift_date: "2026-10-05", shift_type: "night", rts_on: 8, rts_required: 8,
  rvu_total: "216", vent_count: 0, bipap_count: 0, c_section_count: 0,
  vaginal_delivery_count: 0, cabg_count: 0, bronch_count: 0, sputum_induction_count: 0,
  other_procedure_count: 0, other_procedure_note: null, shift_note: null,
  updated_by_staff_profile_id: null, updated_by_name: "Lead RT"
};
describe("additional staffing server persistence", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ status: "authenticated", context: { role: "lead", departmentId: "department-1" } });
    mocks.rpc.mockReset().mockResolvedValue({ error: null });
  });
  it("passes independent counts to the existing authorized save", async () => {
    expect(await saveShiftStatusUpdate({ ...payload, stayed_over_count: 2, called_in_count: 1 })).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("save_shift_status_update", { shift_payload: {
      ...payload, stayed_over_count: 2, called_in_count: 1, department_id: "department-1"
    } });
  });
  it.each([-1, 0.5, NaN, Infinity, 2147483648])("rejects invalid additional count %s", async (value) => {
    for (const field of ["stayed_over_count", "called_in_count"]) {
      expect((await saveShiftStatusUpdate({ ...payload, [field]: value })).ok).toBe(false);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("accepts older payloads that omit additional staffing", async () => {
    expect(await saveShiftStatusUpdate(payload)).toEqual({ ok: true });
  });
  it("does not allow unauthorized staffing edits", async () => {
    mocks.auth.mockResolvedValue({ status: "authenticated", context: { role: "staff" } });
    expect((await saveShiftStatusUpdate({ ...payload, stayed_over_count: 2 })).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
