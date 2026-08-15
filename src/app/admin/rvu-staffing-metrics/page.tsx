import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { RvuStaffingMetrics } from "@/components/RvuStaffingMetrics";
import { canViewRvuStaffingMetrics } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import {
  calculateMetricRows,
  minimumShiftDateForRange,
  parseMetricDateRange,
  parseMetricShiftFilter
} from "@/lib/metrics/rvu-staffing";
import { fetchRvuStaffingMetricRows } from "@/lib/metrics/queries";
import { reportingWindowForInstant } from "@/lib/shift-status/reporting-window";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RvuStaffingMetricsPage({
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

  if (auth.status !== "authenticated" || !canViewRvuStaffingMetrics(auth.context)) {
    notFound();
  }

  const parameters = await searchParams;
  const range = parseMetricDateRange(parameters?.range);
  const shift = parseMetricShiftFilter(parameters?.shift);
  const currentReportingDate = reportingWindowForInstant().localStartDate;
  const minimumShiftDate = minimumShiftDateForRange(range, currentReportingDate);
  const supabase = await createClient();
  const result = await fetchRvuStaffingMetricRows(supabase, auth.context.departmentId, {
    minimumShiftDate,
    maximumShiftDate: currentReportingDate,
    shift
  });

  return (
    <RvuStaffingMetrics
      rows={calculateMetricRows(result.data)}
      range={range}
      shift={shift}
      loadError={Boolean(result.error)}
    />
  );
}
