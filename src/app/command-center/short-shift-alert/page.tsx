import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { CommandShortShiftAlertClient } from "@/components/CommandShortShiftAlertClient";
import { isCommandCenter } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function AccessDenied() {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Short Shift Alert</p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">You do not have access to this page.</h1>
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

export default async function CommandCenterShortShiftAlertPage() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }


  if (auth.status === "error") {
    return <AuthVerificationNotice message={auth.message} />;
  }

  if (auth.status !== "authenticated" || !isCommandCenter(auth.context)) {
    return <AccessDenied />;
  }

  const supabase = await createClient();
  const { data: department } = await supabase
    .from("departments")
    .select("timezone")
    .eq("id", auth.context.departmentId)
    .maybeSingle();

  return (
    <CommandShortShiftAlertClient
      authContext={auth.context}
      timezone={(department?.timezone as string | null | undefined) || "America/Los_Angeles"}
    />
  );
}
