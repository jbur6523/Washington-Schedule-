import Link from "next/link";
import { redirect } from "next/navigation";
import { RentalManagementClient } from "@/components/RentalManagementClient";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

function hasDashboardAccess(context: AuthenticatedUserContext) {
  return context.role === "admin" || context.role === "lead" || context.operationsRole === "aide";
}

function AccessDenied() {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Rental Check In</p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">You do not have access to this dashboard.</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
          Department operations tools are available to admins, leads, and aides.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
        >
          Back to Schedule
        </Link>
      </section>
    </main>
  );
}

export default async function RentalCheckInPage() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status !== "authenticated" || !hasDashboardAccess(auth.context)) {
    return <AccessDenied />;
  }

  return <RentalManagementClient authContext={auth.context} mode="check-in" />;
}
