import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { InactiveAccountNotice } from "@/components/InactiveAccountNotice";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { ImportScheduleAdmin } from "@/components/ImportScheduleAdmin";

export const dynamic = "force-dynamic";

export default async function ImportSchedulePage() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status === "inactive") {
    return <InactiveAccountNotice displayName={auth.displayName} />;
  }

  if (auth.status === "error") {
    return <AuthVerificationNotice message={auth.message} />;
  }

  if (auth.status !== "authenticated" || auth.context.role !== "admin") {
    notFound();
  }

  return <ImportScheduleAdmin authContext={auth.context} />;
}
