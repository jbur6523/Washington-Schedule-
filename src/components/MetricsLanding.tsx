import Link from "next/link";
import { Activity, ClipboardList } from "lucide-react";

const metricCategories = [
  {
    title: "RVUs",
    description: "View RVU and staffing-demand metrics.",
    href: "/admin/rvu-staffing-metrics",
    icon: Activity,
    cardClassName: "border-violet-200 bg-violet-50",
    iconClassName: "bg-violet-100 text-violet-700"
  },
  {
    title: "Procedures",
    description: "Track monthly procedure volume and shift trends.",
    href: "/admin/metrics/procedures",
    icon: ClipboardList,
    cardClassName: "border-cyan-200 bg-cyan-50",
    iconClassName: "bg-cyan-100 text-cyan-700"
  }
] as const;

export function MetricsLanding() {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-3xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Admin</p>
        <h1 className="mt-2 text-3xl font-black text-hospital-ink">Metrics</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          Choose a reporting category. Additional metrics can be added here as reporting grows.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {metricCategories.map((category) => {
            const Icon = category.icon;
            return (
              <Link
                key={category.title}
                href={category.href}
                className={`flex min-h-52 flex-col justify-between rounded-3xl border p-5 shadow-sm ${category.cardClassName}`}
              >
                <span>
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${category.iconClassName}`}>
                    <Icon size={24} aria-hidden="true" />
                  </span>
                  <span className="mt-4 block text-xl font-black text-hospital-ink">{category.title}</span>
                  <span className="mt-2 block text-sm font-bold leading-6 text-slate-600">{category.description}</span>
                </span>
                <span className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-black text-white">
                  Open {category.title}
                </span>
              </Link>
            );
          })}
        </div>

        <Link
          href="/admin"
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
        >
          Back to Admin
        </Link>
      </section>
    </main>
  );
}
