import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { ProcedureMetrics } from "@/components/ProcedureMetrics";
import { canViewMetrics } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import {
  buildProcedureMetricsReport,
  buildProcedureRangeReport,
  RELIABLE_PROCEDURE_HISTORY_START_DATE,
  monthForInstant,
  parseProcedureMonth,
  procedureMonthQueryRange
} from "@/lib/metrics/procedures";
import { fetchProcedureMetricRows } from "@/lib/metrics/queries";
import { createClient } from "@/lib/supabase/server";
import { metricReportingWindow } from "@/lib/metrics/rvu-staffing";

export const dynamic = "force-dynamic";

export default async function ProcedureMetricsPage({
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

  if (auth.status !== "authenticated" || !canViewMetrics(auth.context)) {
    notFound();
  }

  const now = new Date();
  const parameters = await searchParams;
  const month = parseProcedureMonth(parameters?.month, now);
  const custom = parameters?.range === "custom";
  const today = procedureMonthQueryRange(monthForInstant(now), now).maximumShiftDate;
  const window = custom ? metricReportingWindow("custom", today, parameters?.start, parameters?.end) : null;
  const rangeError = window?.error || (window && window.end > today ? "End date must be today or earlier." : "");
  if (rangeError) return <ProcedureMetrics report={buildProcedureMetricsReport([], month, now)} currentMonth={monthForInstant(now)} customRange={window!} rangeError={rangeError} />;
  const range = window ? { minimumShiftDate: RELIABLE_PROCEDURE_HISTORY_START_DATE, maximumShiftDate: procedureMonthQueryRange(window.end.slice(0, 7), now).maximumShiftDate } : procedureMonthQueryRange(month, now);
  const supabase = await createClient();
  const result = await fetchProcedureMetricRows(supabase, auth.context.departmentId, range);

  return (
    <ProcedureMetrics
      report={window ? buildProcedureRangeReport(result.data, window.start, window.end, now) : buildProcedureMetricsReport(result.data, month, now)}
      customRange={window ?? undefined}
      currentMonth={monthForInstant(now)}
      loadError={Boolean(result.error)}
    />
  );
}
