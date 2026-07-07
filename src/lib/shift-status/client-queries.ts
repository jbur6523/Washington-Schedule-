import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

const baseShiftStatusColumns = [
  "id",
  "department_id",
  "shift_date",
  "shift_type",
  "rts_on",
  "rts_required",
  "vent_count",
  "bipap_count",
  "c_section_count",
  "cabg_count",
  "bronch_count",
  "sputum_induction_count",
  "other_procedure_count",
  "other_procedure_note",
  "updated_by_staff_profile_id",
  "updated_by_name",
  "created_at",
  "updated_at",
  "staff_profiles(display_name)"
];

const shiftStatusSelect = [
  ...baseShiftStatusColumns.slice(0, 10),
  "vaginal_delivery_count",
  ...baseShiftStatusColumns.slice(10)
].join(", ");

const legacyShiftStatusSelect = baseShiftStatusColumns.join(", ");

export type ShiftStatusQueryError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type ShiftStatusRow = Omit<ShiftStatusUpdate, "vaginal_delivery_count"> & {
  vaginal_delivery_count?: number | null;
};

export function isMissingVaginalDeliveryColumn(error: ShiftStatusQueryError | null) {
  const errorText = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();

  return errorText.includes("vaginal_delivery_count") && (errorText.includes("does not exist") || errorText.includes("42703"));
}

function normalizeShiftStatusRows(rows: ShiftStatusRow[] | null) {
  return (rows ?? []).map((row) => ({
    ...row,
    vaginal_delivery_count: row.vaginal_delivery_count ?? 0
  })) as ShiftStatusUpdate[];
}

async function queryShiftStatusUpdates(supabase: SupabaseClient, departmentId: string, selectColumns: string, limit: number) {
  const { data, error } = await supabase
    .from("shift_status_updates")
    .select(selectColumns)
    .eq("department_id", departmentId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  return {
    data: normalizeShiftStatusRows(data as ShiftStatusRow[] | null),
    error: error as ShiftStatusQueryError | null
  };
}

export async function fetchShiftStatusUpdates(supabase: SupabaseClient, departmentId: string, limit = 30) {
  const primary = await queryShiftStatusUpdates(supabase, departmentId, shiftStatusSelect, limit);

  if (!primary.error) {
    return {
      ...primary,
      usedLegacyProcedureSelect: false
    };
  }

  if (!isMissingVaginalDeliveryColumn(primary.error)) {
    return {
      ...primary,
      usedLegacyProcedureSelect: false
    };
  }

  const legacy = await queryShiftStatusUpdates(supabase, departmentId, legacyShiftStatusSelect, limit);

  return {
    ...legacy,
    usedLegacyProcedureSelect: !legacy.error
  };
}
