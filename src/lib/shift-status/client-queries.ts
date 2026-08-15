import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OfficialVentCountUpdate,
  ShiftStatusUpdate
} from "@/lib/shift-status/types";
import type { ShiftUpdateReportingWindow } from "@/lib/shift-status/reporting-window";

const baseShiftStatusColumns = [
  "id",
  "department_id",
  "shift_date",
  "shift_type",
  "rts_on",
  "rts_required",
  "rvu_total",
  "vent_count",
  "bipap_count",
  "c_section_count",
  "cabg_count",
  "bronch_count",
  "sputum_induction_count",
  "other_procedure_count",
  "other_procedure_note",
  "shift_note",
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
const canonicalShiftStatusSelect = `${shiftStatusSelect}, is_canonical`;

export type ShiftStatusQueryError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type ShiftStatusRow = Omit<ShiftStatusUpdate, "vaginal_delivery_count" | "shift_note" | "rvu_total"> & {
  vaginal_delivery_count?: number | null;
  shift_note?: string | null;
  rvu_total?: number | null;
};

export function isMissingVaginalDeliveryColumn(error: ShiftStatusQueryError | null) {
  const errorText = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();

  return errorText.includes("vaginal_delivery_count") && (errorText.includes("does not exist") || errorText.includes("42703"));
}

function normalizeShiftStatusRows(rows: ShiftStatusRow[] | null) {
  return (rows ?? []).map((row) => ({
    ...row,
    vaginal_delivery_count: row.vaginal_delivery_count ?? 0,
    shift_note: row.shift_note ?? null,
    rvu_total: row.rvu_total ?? null
  })) as ShiftStatusUpdate[];
}

async function queryShiftStatusUpdates(supabase: SupabaseClient, departmentId: string, selectColumns: string, limit: number) {
  const { data, error } = await supabase
    .from("shift_status_updates")
    .select(selectColumns)
    .eq("department_id", departmentId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  return {
    data: normalizeShiftStatusRows(data as ShiftStatusRow[] | null),
    error: error as ShiftStatusQueryError | null
  };
}

async function queryReportingWindowShiftStatusUpdates(
  supabase: SupabaseClient,
  departmentId: string,
  selectColumns: string,
  window: ShiftUpdateReportingWindow
) {
  const { data, error } = await supabase
    .from("shift_status_updates")
    .select(selectColumns)
    .eq("department_id", departmentId)
    .gte("created_at", window.startsAt)
    .lt("created_at", window.endsAt)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1_000);

  return {
    data: normalizeShiftStatusRows(data as ShiftStatusRow[] | null),
    error: error as ShiftStatusQueryError | null
  };
}

async function queryDirectorShiftStatusUpdates(
  supabase: SupabaseClient,
  departmentId: string,
  selectColumns: string,
  maximumShiftDate: string
) {
  const pageSize = 1_000;
  const rows: ShiftStatusRow[] = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("shift_status_updates")
      .select(selectColumns)
      .eq("department_id", departmentId)
      .lte("shift_date", maximumShiftDate)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + pageSize - 1);

    if (error) {
      return {
        data: [] as ShiftStatusUpdate[],
        error: error as ShiftStatusQueryError
      };
    }

    const page = (data ?? []) as unknown as ShiftStatusRow[];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return {
    data: normalizeShiftStatusRows(rows),
    error: null
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

export async function fetchLatestCanonicalShiftStatusUpdate(
  supabase: SupabaseClient,
  departmentId: string
) {
  const { data, error } = await supabase
    .from("shift_status_updates")
    .select(canonicalShiftStatusSelect)
    .eq("department_id", departmentId)
    .eq("is_canonical", true)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: data ? normalizeShiftStatusRows([data as unknown as ShiftStatusRow])[0] ?? null : null,
    error: error as ShiftStatusQueryError | null
  };
}

export async function fetchLatestCanonicalVentStatusUpdate(
  supabase: SupabaseClient,
  departmentId: string
) {
  const { data, error } = await supabase
    .from("shift_status_updates")
    .select(canonicalShiftStatusSelect)
    .eq("department_id", departmentId)
    .eq("is_canonical", true)
    .not("vent_count", "is", null)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: data ? normalizeShiftStatusRows([data as unknown as ShiftStatusRow])[0] ?? null : null,
    error: error as ShiftStatusQueryError | null
  };
}

export async function fetchShiftStatusUpdateForRecord(
  supabase: SupabaseClient,
  departmentId: string,
  shiftDate: string,
  shiftType: ShiftStatusUpdate["shift_type"]
) {
  const { data, error } = await supabase
    .from("shift_status_updates")
    .select(canonicalShiftStatusSelect)
    .eq("department_id", departmentId)
    .match({ shift_date: shiftDate, shift_type: shiftType })
    .eq("is_canonical", true)
    .maybeSingle();

  return {
    data: data ? normalizeShiftStatusRows([data as unknown as ShiftStatusRow])[0] ?? null : null,
    error: error as ShiftStatusQueryError | null
  };
}

export async function fetchReportingWindowShiftStatusUpdates(
  supabase: SupabaseClient,
  departmentId: string,
  window: ShiftUpdateReportingWindow
) {
  const primary = await queryReportingWindowShiftStatusUpdates(
    supabase,
    departmentId,
    shiftStatusSelect,
    window
  );

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

  const legacy = await queryReportingWindowShiftStatusUpdates(
    supabase,
    departmentId,
    legacyShiftStatusSelect,
    window
  );

  return {
    ...legacy,
    usedLegacyProcedureSelect: !legacy.error
  };
}

export async function fetchDirectorShiftStatusUpdates(
  supabase: SupabaseClient,
  departmentId: string,
  maximumShiftDate: string
) {
  const primary = await queryDirectorShiftStatusUpdates(
    supabase,
    departmentId,
    shiftStatusSelect,
    maximumShiftDate
  );

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

  const legacy = await queryDirectorShiftStatusUpdates(
    supabase,
    departmentId,
    legacyShiftStatusSelect,
    maximumShiftDate
  );

  return {
    ...legacy,
    usedLegacyProcedureSelect: !legacy.error
  };
}

export async function fetchOfficialVentCount(
  supabase: SupabaseClient,
  departmentId: string
) {
  const { data, error } = await supabase
    .from("official_vent_count_updates")
    .select(
      "id, department_id, shift_date, shift_type, vent_count, source, updated_by_staff_profile_id, updated_by_name, created_at"
    )
    .eq("department_id", departmentId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: data as OfficialVentCountUpdate | null,
    error: error as ShiftStatusQueryError | null
  };
}
