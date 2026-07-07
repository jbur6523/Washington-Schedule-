import { notFound, redirect } from "next/navigation";
import { InactiveAccountNotice } from "@/components/InactiveAccountNotice";
import { ScheduleVersionsAdmin } from "@/components/ScheduleVersionsAdmin";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function ScheduleVersionsPage() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status === "inactive") {
    return <InactiveAccountNotice displayName={auth.displayName} />;
  }

  if (auth.status !== "authenticated" || auth.context.role !== "admin") {
    notFound();
  }

  return <ScheduleVersionsAdmin authContext={auth.context} />;
}
