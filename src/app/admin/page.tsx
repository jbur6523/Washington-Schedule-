import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

const adminAreas = [
  "Schedule Administration",
  "Import Schedule",
  "Schedule Versions",
  "Audit History"
];

export default async function AdminPage() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status !== "authenticated" || auth.context.role !== "admin") {
    notFound();
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
          Admin
        </p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">
          Washington Schedule Administration
        </h1>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          These tools are protected for department admins and will be completed in later phases.
        </p>
        <div className="mt-5 grid gap-3">
          {adminAreas.map((area) => (
            <div key={area} className="rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3">
              <p className="text-sm font-black text-hospital-ink">{area}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">Coming in a later phase.</p>
            </div>
          ))}
        </div>
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
