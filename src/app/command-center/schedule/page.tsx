import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { LeadScheduleDirectory } from "@/components/LeadScheduleDirectory";
import { canManageShiftStatus } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import {
  buildCurrentShiftRoster,
  type DirectoryShift,
  type DirectoryStaffProfile,
  type LeadScheduleEntry,
  type LeadScheduleOverride
} from "@/lib/lead-schedule/directory";
import { defaultShiftRecordForInstant } from "@/lib/shift-status/reporting-window";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const scheduledStaffSelect =
  "id, display_name, employment_type, home_assignment, operations_role, is_active";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export default async function LeadSchedulePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status === "error") {
    return <AuthVerificationNotice message={auth.message} />;
  }

  if (auth.status !== "authenticated" || !canManageShiftStatus(auth.context)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: department, error: departmentError } = await supabase
    .from("departments")
    .select("timezone, active_schedule_version_id")
    .eq("id", auth.context.departmentId)
    .maybeSingle();
  const timezone = (department?.timezone as string | null | undefined) || "America/Los_Angeles";
  const defaultSelection = defaultShiftRecordForInstant(new Date(), timezone);
  const params = (await searchParams) ?? {};
  const selectedDate = validDate(firstParam(params.date)) ?? defaultSelection.shiftDate;
  const requestedShift = firstParam(params.shift);
  const selectedShift: DirectoryShift = requestedShift === "day" || requestedShift === "night"
    ? requestedShift
    : defaultSelection.shiftType;
  const activeScheduleVersionId = department?.active_schedule_version_id as string | null | undefined;

  const [entriesResult, overridesResult, directoryResult] = await Promise.all([
    activeScheduleVersionId
      ? supabase
          .from("schedule_entries")
          .select(
            `id, staff_profile_id, shift_type, entry_status, staff_profiles(${scheduledStaffSelect})`
          )
          .eq("schedule_version_id", activeScheduleVersionId)
          .eq("shift_date", selectedDate)
          .order("shift_start", { ascending: true })
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("user_schedule_overrides")
      .select(
        `id, staff_profile_id, base_schedule_entry_id, override_type, shift_type, is_active, staff_profiles(${scheduledStaffSelect})`
      )
      .eq("department_id", auth.context.departmentId)
      .eq("shift_date", selectedDate)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("staff_profiles")
      .select(
        "id, display_name, first_name, last_name, hire_date, phone_number, employment_type, home_assignment, operations_role, directory_shift, name_aliases, is_active"
      )
      .eq("department_id", auth.context.departmentId)
      .eq("is_active", true)
      .order("display_name", { ascending: true })
  ]);

  const scheduleError = Boolean(departmentError || entriesResult.error || overridesResult.error);
  const directoryError = Boolean(directoryResult.error);
  const directory = directoryError ? [] : (directoryResult.data ?? []) as unknown as DirectoryStaffProfile[];
  const schedule = scheduleError
    ? []
    : buildCurrentShiftRoster(
        (entriesResult.data ?? []) as unknown as LeadScheduleEntry[],
        (overridesResult.data ?? []) as unknown as LeadScheduleOverride[],
        directory,
        selectedShift
      );

  return (
    <LeadScheduleDirectory
      selectedDate={selectedDate}
      selectedShift={selectedShift}
      schedule={schedule}
      directory={directory}
      scheduleError={scheduleError}
      directoryError={directoryError}
    />
  );
}
