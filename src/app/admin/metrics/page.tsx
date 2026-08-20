import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { MetricsLanding } from "@/components/MetricsLanding";
import { canViewMetrics } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
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

  return <MetricsLanding />;
}
