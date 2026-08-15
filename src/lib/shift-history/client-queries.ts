import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShiftRosterSnapshot } from "@/lib/shift-history/types";
import type { ShiftStatusShiftType } from "@/lib/shift-status/types";

export async function fetchShiftRosterSnapshot(
  supabase: SupabaseClient,
  departmentId: string,
  shiftDate: string,
  shiftType: ShiftStatusShiftType
) {
  const { data, error } = await supabase
    .from("phone_list_roster_snapshots")
    .select("id, shift_date, shift_type, captured_at, captured_by_name, phone_list_roster_entries(id, display_order, staff_display_name, area_labels)")
    .eq("department_id", departmentId)
    .eq("shift_date", shiftDate)
    .eq("shift_type", shiftType)
    .order("display_order", { referencedTable: "phone_list_roster_entries", ascending: true })
    .maybeSingle();

  const snapshot = data as unknown as ShiftRosterSnapshot | null;

  return {
    data: snapshot
      ? {
          ...snapshot,
          phone_list_roster_entries: snapshot.phone_list_roster_entries ?? []
        }
      : null,
    error
  };
}
