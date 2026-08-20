import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { ProcedureMetrics } from "@/components/ProcedureMetrics";
import { canViewMetrics } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import {
  buildProcedureMetricsReport,
  monthForInstant,
  parseProcedureMonth,
  procedureMonthQueryRange
} from "@/lib/metrics/procedures";
import { fetchProcedureMetricRows } from "@/lib/metrics/queries";
import { createClient } from "@/lib/supabase/server";

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
  const range = procedureMonthQueryRange(month, now);
  const supabase = await createClient();
  const result = await fetchProcedureMetricRows(supabase, auth.context.departmentId, range);

  return (
    <ProcedureMetrics
      report={buildProcedureMetricsReport(result.data, month, now)}
      currentMonth={monthForInstant(now)}
      loadError={Boolean(result.error)}
    />
  );
}
