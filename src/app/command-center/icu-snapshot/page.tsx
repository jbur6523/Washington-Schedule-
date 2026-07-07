import Link from "next/link";
import { redirect } from "next/navigation";
import { IcuReadOnlyPage } from "@/components/IcuReadOnlyViews";
import { InactiveAccountNotice } from "@/components/InactiveAccountNotice";
import { isCommandCenter } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

function AccessDenied() {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">ICU Snapshot</p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">You do not have access to this page.</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
          ICU Snapshot is available to the Respiratory Command Center in read-only mode.
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

export default async function CommandCenterIcuSnapshotPage() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status === "inactive") {
    return <InactiveAccountNotice displayName={auth.displayName} />;
  }

  if (auth.status !== "authenticated" || !isCommandCenter(auth.context)) {
    return <AccessDenied />;
  }

  return (
    <IcuReadOnlyPage
      departmentId={auth.context.departmentId}
      title="ICU Snapshot"
      subtitle="View ICU respiratory devices and settings."
      backHref="/command-center"
      backLabel="Back to Command Center"
    />
  );
}
