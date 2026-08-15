import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { ShiftHistory } from "@/components/ShiftHistory";
import { canManageShiftStatus } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { parseShiftHistoryFilters, shiftHistoryInstantRange } from "@/lib/shift-history/filters";
import type { ShiftHistoryRecord, ShiftRosterSnapshot } from "@/lib/shift-history/types";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const pageSize = 12;

function rosterKey(shiftDate: string, shiftType: string) {
  return `${shiftDate}:${shiftType}`;
}

export default async function ShiftHistoryPage({
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
  const { data: department } = await supabase
    .from("departments")
    .select("timezone")
    .eq("id", auth.context.departmentId)
    .maybeSingle();
  const timezone = (department?.timezone as string | null | undefined) || "America/Los_Angeles";
  const filters = parseShiftHistoryFilters((await searchParams) ?? {});
  const instantRange = shiftHistoryInstantRange(filters, new Date(), timezone);

  if (instantRange.error) {
    return (
      <ShiftHistory
        records={[]}
        filters={filters}
        timezone={timezone}
        hasPrevious={filters.page > 1}
        hasNext={false}
        filterError={instantRange.error}
        loadError={false}
      />
    );
  }

  const { data: historyRows, error: historyError } = await supabase.rpc("list_shift_history", {
    p_department_id: auth.context.departmentId,
    p_starts_at: instantRange.startsAt,
    p_ends_at: instantRange.endsAt,
    p_shift_type: filters.shift === "all" ? null : filters.shift,
    p_offset: (filters.page - 1) * pageSize,
    p_limit: pageSize + 1
  });
  const boundedRows = ((historyRows ?? []) as unknown as ShiftStatusUpdate[]).slice(0, pageSize);
  const hasNext = (historyRows?.length ?? 0) > pageSize;
  const loadError = Boolean(historyError);
  const rosterByWindow = new Map<string, ShiftRosterSnapshot>();
  const updaterNames = new Map<string, string>();

  if (!historyError && boundedRows.length > 0) {
    const dates = Array.from(new Set(boundedRows.map((row) => row.shift_date)));
    const updaterIds = Array.from(new Set(boundedRows.map((row) => row.updated_by_staff_profile_id).filter((value): value is string => Boolean(value))));
    const [rosterResult, updaterResult] = await Promise.all([
      supabase
        .from("phone_list_roster_snapshots")
        .select("id, shift_date, shift_type, captured_at, captured_by_name, phone_list_roster_entries(id, display_order, staff_display_name, area_labels)")
        .eq("department_id", auth.context.departmentId)
        .in("shift_date", dates)
        .order("display_order", { referencedTable: "phone_list_roster_entries", ascending: true }),
      updaterIds.length
        ? supabase.from("staff_profiles").select("id, display_name").in("id", updaterIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (!rosterResult.error) {
      for (const rawSnapshot of rosterResult.data ?? []) {
        const snapshot = rawSnapshot as unknown as ShiftRosterSnapshot;
        rosterByWindow.set(rosterKey(snapshot.shift_date, snapshot.shift_type), {
          ...snapshot,
          phone_list_roster_entries: snapshot.phone_list_roster_entries ?? []
        });
      }
    }
    if (!updaterResult.error) {
      for (const staff of updaterResult.data ?? []) {
        updaterNames.set(staff.id as string, staff.display_name as string);
      }
    }
  }

  const records: ShiftHistoryRecord[] = boundedRows.map((record) => {
    const updaterDisplayName = record.updated_by_staff_profile_id
      ? updaterNames.get(record.updated_by_staff_profile_id)
      : undefined;
    return {
      ...record,
      staff_profiles: updaterDisplayName ? { display_name: updaterDisplayName } : record.staff_profiles,
      roster: rosterByWindow.get(rosterKey(record.shift_date, record.shift_type)) ?? null
    };
  });

  return (
    <ShiftHistory
      records={loadError ? [] : records}
      filters={filters}
      timezone={timezone}
      hasPrevious={filters.page > 1}
      hasNext={hasNext}
      filterError=""
      loadError={loadError}
    />
  );
}
