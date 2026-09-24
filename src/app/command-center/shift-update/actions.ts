"use server";

import { canManageShiftStatus } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import type { ShiftStatusSavePayload, ShiftStatusSaveResult } from "@/lib/shift-status/types";
import { createClient } from "@/lib/supabase/server";

function validPayload(payload: ShiftStatusSavePayload) {
  const numericValues = [
    payload.rts_on,
    payload.rts_required,
    Number(payload.rvu_total),
    payload.vent_count,
    payload.bipap_count,
    payload.neonatal_high_flow_count,
    payload.bubble_cpap_count,
    payload.c_section_count,
    payload.vaginal_delivery_count,
    payload.cabg_count,
    payload.bronch_count,
    payload.sputum_induction_count,
    payload.other_procedure_count
  ].filter((value): value is number => value !== null && value !== undefined);

  return (
    /^\d{4}-\d{2}-\d{2}$/.test(payload.shift_date)
    && (payload.shift_type === "day" || payload.shift_type === "night")
    && numericValues.every((value) => Number.isFinite(value) && value >= 0)
    && Boolean(payload.updated_by_name.trim())
  );
}

export async function saveShiftStatusUpdate(
  payload: ShiftStatusSavePayload
): Promise<ShiftStatusSaveResult> {
  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated") {
    return { ok: false, message: "Your session expired. Sign in and try again." };
  }

  if (!canManageShiftStatus(auth.context)) {
    return { ok: false, message: "You do not have permission to update this shift." };
  }

  if (!validPayload(payload)) {
    return { ok: false, message: "The shift update contains invalid values." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_shift_status_update", {
    shift_payload: {
      ...payload,
      department_id: auth.context.departmentId
    }
  });

  if (error) {
    return { ok: false, message: "Unable to save shift update." };
  }

  return { ok: true };
}
