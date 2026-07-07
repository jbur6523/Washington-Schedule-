import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ClipboardList, PackageCheck, ShieldCheck } from "lucide-react";
import { hasOperationsDashboardAccess, hasOrderManagementAccess } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

function dashboardTitle(context: AuthenticatedUserContext) {
  if (context.role === "admin") {
    return "Admin Dashboard";
  }

  if (context.role === "lead") {
    return "Lead Dashboard";
  }

  if (context.operationsRole === "aide") {
    return "Aide Dashboard";
  }

  return "Operations Dashboard";
}

function AccessDenied() {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Operations</p>
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

export default async function OperationsDashboardPage() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status !== "authenticated" || !hasOperationsDashboardAccess(auth.context)) {
    return <AccessDenied />;
  }

  const showOrderManagement = hasOrderManagementAccess(auth.context);
  const orderManagementLabel = auth.context.role === "admin" ? "Admin view" : "Aide";
  const orderManagementDescription =
    auth.context.role === "admin"
      ? "Monitor department supply orders."
      : "Create and track department supply orders.";

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-cyan-700">
            <ShieldCheck size={15} />
            Department Operations
          </p>
          <h1 className="mt-2 text-2xl font-black text-hospital-ink">{dashboardTitle(auth.context)}</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Department operations tools</p>
        </section>

        <section className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
              <ClipboardList size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-hospital-ink">Rental Management</h2>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">Track BiPAP V60 rentals.</p>
              <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                Active
              </span>
            </div>
          </div>
          <Link
            href="/operations/rental-management"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white shadow-md shadow-cyan-900/20"
          >
            Open Rental Management
          </Link>
        </section>

        {showOrderManagement && (
          <section className="rounded-3xl border border-pink-100 bg-pink-50/80 p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-100 text-pink-700">
                <PackageCheck size={22} />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-hospital-ink">Order Management</h2>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                  {orderManagementDescription}
                </p>
                <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-pink-700">
                  {orderManagementLabel}
                </span>
              </div>
            </div>
            <Link
              href="/operations/order-management"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-pink-600 px-4 text-sm font-extrabold text-white shadow-md shadow-pink-900/20"
            >
              Open Order Management
            </Link>
          </section>
        )}

        {auth.context.role === "admin" && (
          <section className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <Activity size={22} />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-hospital-ink">ICU Command Center</h2>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                  Track ICU respiratory devices and settings.
                </p>
                <span className="mt-2 inline-flex rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-extrabold text-cyan-700">
                  Admin
                </span>
              </div>
            </div>
            <Link
              href="/icu-command-center"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white shadow-md shadow-cyan-900/20"
            >
              Open ICU Command Center
            </Link>
          </section>
        )}

        {auth.context.role === "admin" && (
          <Link
            href="/admin"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
          >
            Admin tools
          </Link>
        )}

        <Link
          href="/"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
        >
          Back to Schedule
        </Link>
      </div>
    </main>
  );
}
