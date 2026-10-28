import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/paginated-query";
import { timeZoneParts } from "@/lib/time/zoned-date-time";
import {
  adaptActiveSchedule, type ActiveSchedule, type CoworkerTitleRow,
  type ScheduleEntryRow, type ScheduleVersionRow, type ShiftShortageRow,
  type UserScheduleOverrideRow, type ShiftRequestRow, type ShiftRequestOfferRow
} from "./supabase-schedule";

export type ScheduleSnapshot = {
  activeSchedule: ActiveSchedule | null;
  timezone: string;
  error: string;
};

// Include yesterday so ongoing overnight shifts remain available after midnight.
// Calendar arithmetic (rather than subtracting 24 hours) also handles DST.
export function recentScheduleStart(timezone: string, now = new Date()) {
  const { year, month, day } = timeZoneParts(now, timezone);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

const entryColumns = "id, schedule_version_id, department_id, staff_profile_id, shift_date, day_of_week, shift_type, shift_start, shift_end, entry_status, is_shift_lead, staff_profiles(id, display_name, employment_type, home_assignment, operations_role, is_active)";

export async function fetchScheduleEntries(
  supabase: SupabaseClient, versionId: string, startDate: string | null, signal: AbortSignal
) {
  const fetchEntries = (fromDate: string | null) => fetchAllPages((from, to) => {
    let query = supabase.from("schedule_entries").select(entryColumns).eq("schedule_version_id", versionId);
    if (fromDate) query = query.gte("shift_date", fromDate);
    return query.order("shift_date").order("shift_start").order("id").range(from, to).abortSignal(signal);
  });
  const result = await fetchEntries(startDate);
  if (result.error || result.data?.length || !startDate || signal.aborted) return result;

  // Preserve the existing last-day view when the published schedule has ended.
  // Read one indexed date instead of downloading the entire expired schedule.
  const latest = await supabase.from("schedule_entries").select("shift_date")
    .eq("schedule_version_id", versionId).order("shift_date", { ascending: false })
    .limit(1).abortSignal(signal).maybeSingle();
  if (latest.error) return { data: null, error: latest.error };
  return latest.data ? fetchEntries(latest.data.shift_date as string) : result;
}

export async function loadScheduleSnapshot({
  supabase, departmentId, staffProfileId, includeHistory, signal, now = new Date()
}: {
  supabase: SupabaseClient;
  departmentId: string;
  staffProfileId: string | null;
  includeHistory: boolean;
  signal: AbortSignal;
  now?: Date;
}): Promise<ScheduleSnapshot> {
  const { data: department, error: departmentError } = await supabase
    .from("departments")
    .select("active_schedule_version_id, timezone")
    .eq("id", departmentId)
    .abortSignal(signal).maybeSingle();
  const timezone = (department?.timezone as string | null | undefined) || "America/Los_Angeles";

  if (departmentError) {
    return {
      error: "Permission denied or department schedule settings could not be loaded.",
      activeSchedule: null,
      timezone,
    };
  }

  const activeVersionId = department?.active_schedule_version_id as string | null | undefined;

  if (!activeVersionId) {
    return { error: "", activeSchedule: null, timezone };
  }

  const { data: version, error: versionError } = await supabase
    .from("schedule_versions")
    .select("*")
    .eq("id", activeVersionId)
    .eq("status", "published")
    .abortSignal(signal).maybeSingle();

  if (versionError || !version) {
    return {
      error: "The active schedule version could not be loaded.",
      activeSchedule: null,
      timezone,
    };
  }

  const [
    { data: entries, error: entriesError },
    { data: shortages, error: shortagesError },
    { data: overrides, error: overridesError },
    { data: requests, error: requestsError },
    { data: offers, error: offersError },
    { data: coworkerTitles, error: coworkerTitlesError }
  ] = await Promise.all([
    fetchScheduleEntries(supabase, activeVersionId, includeHistory ? null : recentScheduleStart(timezone, now), signal),
    fetchAllPages((from, to) => supabase
      .from("shift_shortages")
      .select("id, schedule_version_id, department_id, shift_date, shift_type, shift_start, shift_end, severity, status, message, created_by")
      .eq("schedule_version_id", activeVersionId)
      .eq("status", "active")
      .order("shift_date", { ascending: true })
      .order("shift_start", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to).abortSignal(signal)),
    fetchAllPages((from, to) => supabase
      .from("user_schedule_overrides")
      .select(
        "id, department_id, staff_profile_id, base_schedule_entry_id, override_type, shift_date, shift_type, shift_start, shift_end, note, is_active, created_at, updated_at, staff_profiles(id, display_name, employment_type, home_assignment, operations_role, is_active)"
      )
      .eq("department_id", departmentId)
      .eq("is_active", true)
      .order("shift_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to).abortSignal(signal)),
    fetchAllPages((from, to) => supabase
      .from("shift_requests")
      .select(
        "id, department_id, schedule_entry_id, user_schedule_override_id, staff_profile_id, request_type, status, note, created_at, updated_at, staff_profiles(id, display_name, employment_type, home_assignment, operations_role, is_active), schedule_entries(id, shift_date, day_of_week, shift_type, shift_start, shift_end), user_schedule_overrides(id, shift_date, shift_type, shift_start, shift_end)"
      )
      .eq("department_id", departmentId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to).abortSignal(signal)),
    fetchAllPages((from, to) => supabase
      .from("shift_request_offers")
      .select(
        "id, department_id, shift_request_id, offer_type, offered_by_staff_profile_id, offered_schedule_entry_id, offered_override_id, offered_date, offered_shift_type, offered_shift_start, offered_shift_end, note, status, created_at, updated_at, responded_at, staff_profiles(id, display_name, employment_type, home_assignment, operations_role, is_active), shift_requests(id, department_id, schedule_entry_id, user_schedule_override_id, staff_profile_id, request_type, status, note, created_at, updated_at, staff_profiles(id, display_name, employment_type, home_assignment, operations_role, is_active), schedule_entries(id, shift_date, day_of_week, shift_type, shift_start, shift_end), user_schedule_overrides(id, shift_date, shift_type, shift_start, shift_end)), schedule_entries(id, shift_date, shift_type, shift_start, shift_end), user_schedule_overrides(id, shift_date, shift_type, shift_start, shift_end)"
      )
      .eq("department_id", departmentId)
      .in("status", ["offered", "accepted", "declined"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to).abortSignal(signal)),
    staffProfileId
      ? fetchAllPages((from, to) => supabase
          .from("coworker_titles")
          .select("id, department_id, owner_staff_profile_id, target_staff_profile_id, title, title_key, custom_title, custom_icon, is_custom")
          .eq("department_id", departmentId)
          .eq("owner_staff_profile_id", staffProfileId)
          .order("id", { ascending: true })
          .range(from, to).abortSignal(signal))
      : Promise.resolve({ data: [], error: null })
  ]);

  if (entriesError || shortagesError || overridesError || requestsError || offersError || coworkerTitlesError) {
    return {
      error: "Schedule coordination data could not be loaded. Confirm required migrations are applied.",
      activeSchedule: null,
      timezone,
    };
  }

  return {
    error: "",
    timezone,
    activeSchedule: adaptActiveSchedule(
      version as ScheduleVersionRow,
      (entries ?? []) as ScheduleEntryRow[],
      (shortages ?? []) as ShiftShortageRow[],
      (overrides ?? []) as UserScheduleOverrideRow[],
      (requests ?? []) as ShiftRequestRow[],
      (offers ?? []) as ShiftRequestOfferRow[],
      (coworkerTitles ?? []) as CoworkerTitleRow[]
    )
  };
}
