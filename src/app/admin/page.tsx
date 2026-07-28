import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { adminDashboardAreas } from "@/lib/admin/navigation";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }


  if (auth.status === "error") {
    return <AuthVerificationNotice message={auth.message} />;
  }

  if (auth.status !== "authenticated" || auth.context.role !== "admin") {
    notFound();
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-2xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
          Admin
        </p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">
          WHHS RT Schedule Administration
        </h1>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          Admin is the app superuser for reviewing and testing every major module.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {adminDashboardAreas.map((area) => (
            <Link
              key={area.title}
              href={area.href}
              className={`flex min-h-44 flex-col justify-between rounded-2xl border px-4 py-4 shadow-sm transition duration-150 active:scale-[0.99] ${area.className}`}
            >
              <span>
                <span className="block text-base font-black text-hospital-ink">{area.title}</span>
                <span className="mt-1 block text-sm font-bold leading-5 text-slate-600">{area.description}</span>
              </span>
              <span className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-white/90 px-3 text-center text-sm font-black shadow-sm">
                {area.buttonLabel}
              </span>
            </Link>
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
