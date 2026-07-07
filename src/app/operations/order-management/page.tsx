import Link from "next/link";
import { redirect } from "next/navigation";
import { InactiveAccountNotice } from "@/components/InactiveAccountNotice";
import { OrderManagementClient } from "@/components/OrderManagementClient";
import { hasOrderManagementAccess } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

function AccessDenied() {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-pink-700">Order Management</p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">You do not have access to this tool.</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
          Order Management is available to aides and admins.
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

export default async function OrderManagementPage() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status === "inactive") {
    return <InactiveAccountNotice displayName={auth.displayName} />;
  }

  if (auth.status !== "authenticated" || !hasOrderManagementAccess(auth.context)) {
    return <AccessDenied />;
  }

  return <OrderManagementClient authContext={auth.context} />;
}
