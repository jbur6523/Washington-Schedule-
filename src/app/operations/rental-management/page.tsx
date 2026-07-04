import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, DoorOpen, RotateCcw, ScanLine } from "lucide-react";
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
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Rental Management</p>
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

const futureFeatures = [
  { title: "Check Out Rental", icon: ScanLine },
  { title: "Active Rentals", icon: ClipboardCheck },
  { title: "Transfer Room", icon: DoorOpen },
  { title: "Return Equipment", icon: RotateCcw }
];

export default async function RentalManagementPage() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status !== "authenticated" || !hasDashboardAccess(auth.context)) {
    return <AccessDenied />;
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Department Operations</p>
          <h1 className="mt-2 text-2xl font-black text-hospital-ink">Rental Management</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            BiPAP and ventilator rental tracking
          </p>
          <p className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3 text-sm font-bold leading-6 text-cyan-900">
            Check out, transfer, and return rental equipment from one place.
          </p>
        </section>

        <section className="grid gap-3">
          {futureFeatures.map((feature) => {
            const Icon = feature.icon;

            return (
              <div key={feature.title} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
                    <Icon size={20} />
                  </span>
                  <div>
                    <h2 className="text-base font-black text-hospital-ink">{feature.title}</h2>
                    <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-violet-700">Coming Soon</p>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <Link
          href="/operations"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
