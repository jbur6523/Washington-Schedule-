import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MetricShiftFilter,
  RvuStaffingMetricRow
} from "@/lib/metrics/rvu-staffing";

const metricColumns = "id, shift_date, shift_type, rvu_total, rts_on, created_at, updated_at";

export async function fetchRvuStaffingMetricRows(
  supabase: SupabaseClient,
  departmentId: string,
  filters: { minimumShiftDate: string | null; maximumShiftDate: string; shift: MetricShiftFilter }
) {
  const pageSize = 1_000;
  const rows: RvuStaffingMetricRow[] = [];

  for (let start = 0; ; start += pageSize) {
    let query = supabase
      .from("shift_status_updates")
      .select(metricColumns)
      .eq("department_id", departmentId)
      .lte("shift_date", filters.maximumShiftDate)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (filters.minimumShiftDate) {
      query = query.gte("shift_date", filters.minimumShiftDate);
    }

    if (filters.shift !== "all") {
      query = query.eq("shift_type", filters.shift);
    }

    const { data, error } = await query.range(start, start + pageSize - 1);

    if (error) {
      return { data: [] as RvuStaffingMetricRow[], error };
    }

    const page = (data ?? []) as unknown as RvuStaffingMetricRow[];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return { data: rows, error: null };
}
