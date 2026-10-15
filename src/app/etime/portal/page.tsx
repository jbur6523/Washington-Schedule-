import { redirect } from "next/navigation";
import { reviewer } from "@/lib/etime/server";
import { payrollReviewRole } from "@/lib/etime/access";
import { EtimeClient } from "@/components/etime/EtimeClient";
import Link from "next/link";
import { TRIAL_NOTICE } from "@/lib/etime/model";
export const dynamic = "force-dynamic";
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const grant = await reviewer();
  if (!payrollReviewRole(grant)) redirect("/login");
  if (grant?.role === "identity_admin" && grant.temporary_manager_access) {
    const { view } = await searchParams;
    if (view === "timekeeper" || view === "manager")
      return <EtimeClient key={view} mode="review" demoView={view} />;
    return (
      <main className="min-h-screen px-4 py-8">
        <section className="mx-auto max-w-2xl space-y-5 rounded-3xl border border-white bg-white/95 p-6 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
            Washington Schedule
          </p>
          <h1 className="text-2xl font-black text-hospital-ink">
            Temporary Payroll Access
          </h1>
          <p className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm">
            {TRIAL_NOTICE}
          </p>
          <p>
            Choose a workflow to demonstrate. Actions are recorded as{" "}
            {grant.display_name}.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/etime/portal?view=timekeeper"
              className="rounded-2xl border border-amber-200 bg-amber-50 p-5 hover:bg-amber-100"
            >
              <span className="block text-lg font-black">
                Timekeeper (Olive)
              </span>
              <span className="mt-2 block text-sm text-slate-600">
                Initial exceptions · Pending and Completed folders
              </span>
            </Link>
            <Link
              href="/etime/portal?view=manager"
              className="rounded-2xl border border-blue-200 bg-blue-50 p-5 hover:bg-blue-100"
            >
              <span className="block text-lg font-black">Manager (Ramon)</span>
              <span className="mt-2 block text-sm text-slate-600">
                Initial and sign timecards · Three-folder workflow
              </span>
            </Link>
          </div>
          <Link
            href="/admin"
            className="block font-bold text-cyan-700 underline"
          >
            Back to Admin
          </Link>
        </section>
      </main>
    );
  }
  return <EtimeClient mode="review" />;
}
