import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

const adminAreas = [
  {
    title: "Schedule",
    description: "View the staff schedule.",
    href: "/",
    buttonLabel: "Open Schedule",
    className: "border-sky-100 bg-sky-50/80 text-sky-700"
  },
  {
    title: "Manage Schedule",
    description: "Manage personal schedule actions and shift requests.",
    href: "/?tab=manage-schedule",
    buttonLabel: "Open Manage Schedule",
    className: "border-violet-100 bg-violet-50/80 text-violet-700"
  },
  {
    title: "Staff Directory",
    description: "View staff contact and profile details.",
    href: "/?tab=staff",
    buttonLabel: "Open Staff Directory",
    className: "border-cyan-100 bg-cyan-50/80 text-cyan-700"
  },
  {
    title: "Cover/Switch",
    description: "Review switch and coverage workflows.",
    href: "/?tab=shift-board",
    buttonLabel: "Open Cover/Switch",
    className: "border-purple-100 bg-purple-50/80 text-purple-700"
  },
  {
    title: "Gossip",
    description: "Open the private department board.",
    href: "/?tab=gossip",
    buttonLabel: "Open Gossip",
    className: "border-pink-100 bg-pink-50/80 text-pink-700"
  },
  {
    title: "Lead Command Board",
    description: "Access lead shift operations and department workflow tools.",
    href: "/command-center",
    buttonLabel: "Open Lead Command Board",
    className: "border-blue-100 bg-blue-50/80 text-blue-700"
  },
  {
    title: "Director Dashboard",
    description: "View the leadership operational dashboard.",
    href: "/director/shift-status",
    buttonLabel: "Open Director Dashboard",
    className: "border-teal-100 bg-teal-50/80 text-teal-700"
  },
  {
    title: "ICU Command Center",
    description: "Track ICU respiratory devices and settings.",
    href: "/icu-command-center",
    buttonLabel: "Open ICU Command Center",
    className: "border-cyan-100 bg-cyan-50/80 text-cyan-700"
  },
  {
    title: "ICU Snapshot",
    description: "Open the read-only ICU respiratory snapshot.",
    href: "/command-center/icu-snapshot",
    buttonLabel: "Open ICU Snapshot",
    className: "border-emerald-100 bg-emerald-50/80 text-emerald-700"
  },
  {
    title: "Rental Management",
    description: "Track BiPAP V60 rentals.",
    href: "/operations/rental-management",
    buttonLabel: "Open Rental Management",
    className: "border-amber-100 bg-amber-50/80 text-amber-700"
  },
  {
    title: "Order Management",
    description: "Manage supply orders, tasks, and aide communication.",
    href: "/operations/order-management",
    buttonLabel: "Open Order Management",
    className: "border-rose-100 bg-rose-50/80 text-rose-700"
  },
  {
    title: "Communication Boards",
    description: "View Aide and Lead communication boards.",
    href: "/command-center",
    buttonLabel: "Open Communication Boards",
    className: "border-indigo-100 bg-indigo-50/80 text-indigo-700"
  },
  {
    title: "Short Shift Alert",
    description: "Post or review current staffing needs.",
    href: "/command-center/short-shift-alert",
    buttonLabel: "Open Short Shift Alert",
    className: "border-red-100 bg-red-50/80 text-red-700"
  },
  {
    title: "Staff Management",
    description: "Manage staff profiles, roles, and access.",
    href: "/admin/roster",
    buttonLabel: "Open Staff Management",
    className: "border-slate-200 bg-white text-slate-700"
  },
  {
    title: "Schedule Versions",
    description: "Create, edit, and publish the active schedule.",
    href: "/admin/schedule-versions",
    buttonLabel: "Open Schedule Versions",
    className: "border-cyan-100 bg-cyan-50/80 text-cyan-700"
  },
  {
    title: "Import Schedule",
    description: "Upload, review, match roster names, and create a schedule version.",
    href: "/admin/import-schedule",
    buttonLabel: "Open Import Schedule",
    className: "border-cyan-100 bg-cyan-50/80 text-cyan-700"
  }
];

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
          {adminAreas.map((area) => (
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
