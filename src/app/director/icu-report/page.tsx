import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { LeadershipIcuReport } from "@/components/LeadershipIcuReport";
import { canViewDirectorShiftStatus } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function LeadershipIcuReportPage() {
  const auth = await getAuthenticatedUserContext();
  if (auth.status === "unauthenticated") redirect("/login");
  if (auth.status === "error") return <AuthVerificationNotice message={auth.message} />;
  if (auth.status !== "authenticated" || !canViewDirectorShiftStatus(auth.context)) notFound();
  return <LeadershipIcuReport departmentId={auth.context.departmentId} departmentName={auth.context.departmentName} />;
}
