import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { RvuStaffingMetrics } from "@/components/RvuStaffingMetrics";
import { canViewRvuStaffingMetrics } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import {
  calculateMetricRows,
  metricReportingWindow,
  parseMetricDateRange
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
  const currentReportingDate = reportingWindowForInstant().localStartDate;
  const window = metricReportingWindow(range, currentReportingDate, parameters?.start, parameters?.end);
  if (window.error) return <RvuStaffingMetrics rows={[]} range={range} start={window.start} end={window.end} rangeError={window.error} />;
  const supabase = await createClient();
  const result = await fetchRvuStaffingMetricRows(supabase, auth.context.departmentId, {
    minimumShiftDate: window.start,
    maximumShiftDate: window.end,
    shift: "all"
  });

  return (
    <RvuStaffingMetrics
      rows={calculateMetricRows(result.data)}
      range={range}
      start={window.start}
      end={window.end}
      loadError={Boolean(result.error)}
    />
  );
}
