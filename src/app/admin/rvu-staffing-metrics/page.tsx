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
import { parseProcedureMonth, daysInMonth } from "@/lib/metrics/procedures";

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
  const currentMonth = currentReportingDate.slice(0, 7);
  const month = parseProcedureMonth(parameters?.month, new Date(`${currentReportingDate}T20:00:00Z`));
  const monthly = parameters?.range !== "custom";
  const window = monthly ? { start: `${month}-01`, end: month === currentMonth ? currentReportingDate : `${month}-${daysInMonth(month)}`, error: "" } : metricReportingWindow(range, currentReportingDate, parameters?.start, parameters?.end);
  const navigation = { month, currentMonth, custom: !monthly };
  if (window.error) return <RvuStaffingMetrics rows={[]} range={range} start={window.start} end={window.end} rangeError={window.error} navigation={navigation} />;
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
      navigation={navigation}
      start={window.start}
      end={window.end}
      loadError={Boolean(result.error)}
    />
  );
}
