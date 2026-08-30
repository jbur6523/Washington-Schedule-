import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { IcuReadOnlyPage } from "@/components/IcuReadOnlyViews";
import { canViewIcuCommandCenter } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { prominentBackActionClass } from "@/lib/ui/action-styles";

export const dynamic = "force-dynamic";

function AccessDenied() {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">ICU Snapshot</p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">You do not have access to this page.</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
          ICU Snapshot is available to the Lead Command Board in read-only mode.
        </p>
        <Link
          href="/"
          className={`${prominentBackActionClass} mt-5 w-full`}
        >
          <ArrowLeft size={18} aria-hidden="true" />
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


  if (auth.status === "error") {
    return <AuthVerificationNotice message={auth.message} />;
  }

  if (auth.status !== "authenticated" || !canViewIcuCommandCenter(auth.context)) {
    return <AccessDenied />;
  }

  const supabase = await createClient();
  const { data: department } = await supabase
    .from("departments")
    .select("timezone")
    .eq("id", auth.context.departmentId)
    .maybeSingle();

  return (
    <IcuReadOnlyPage
      departmentId={auth.context.departmentId}
      timezone={(department?.timezone as string | null | undefined) || "America/Los_Angeles"}
      title="ICU Snapshot"
      subtitle="View ICU respiratory devices and settings."
      backHref="/command-center"
      backLabel="Back to Command Center"
    />
  );
}
