import type { AuthenticatedUserContext } from "@/lib/auth/types";

export const adminDashboardAreas = [
  {
    title: "Lead Command Board",
    description: "Access lead shift operations and department workflow tools.",
    href: "/command-center",
    buttonLabel: "Open Lead Command Board",
    cardClassName: "border-blue-200 bg-blue-100",
    accentClassName: "text-blue-800",
    buttonClassName: "bg-blue-700 text-white"
  },
  {
    title: "Leadership Dashboard",
    description: "View the leadership operational dashboard.",
    href: "/director/shift-status",
    buttonLabel: "Open Leadership Dashboard",
    cardClassName: "border-emerald-200 bg-emerald-100",
    accentClassName: "text-emerald-800",
    buttonClassName: "bg-emerald-700 text-white"
  },
  {
    title: "ICU Command Center",
    description: "Track ICU respiratory devices and settings.",
    href: "/icu-command-center",
    buttonLabel: "Open ICU Command Center",
    cardClassName: "border-teal-200 bg-teal-100",
    accentClassName: "text-teal-800",
    buttonClassName: "bg-teal-700 text-white"
  },
  {
    title: "Rental Management",
    description: "Track BiPAP V60 rentals.",
    href: "/operations/rental-management",
    buttonLabel: "Open Rental Management",
    cardClassName: "border-amber-200 bg-amber-100",
    accentClassName: "text-amber-900",
    buttonClassName: "bg-amber-700 text-white"
  },
  {
    title: "Order Management",
    description: "Manage supply orders, tasks, and aide communication.",
    href: "/operations/order-management",
    buttonLabel: "Open Order Management",
    cardClassName: "border-rose-200 bg-rose-100",
    accentClassName: "text-rose-800",
    buttonClassName: "bg-rose-700 text-white"
  },
  {
    title: "Staff Management",
    description: "Manage staff profiles, roles, and access.",
    href: "/admin/roster",
    buttonLabel: "Open Staff Management",
    cardClassName: "border-slate-300 bg-slate-200",
    accentClassName: "text-slate-800",
    buttonClassName: "bg-slate-700 text-white"
  },
  {
    title: "Import Schedule",
    description: "Upload, review, match roster names, and create a schedule version.",
    href: "/admin/import-schedule",
    buttonLabel: "Open Import Schedule",
    cardClassName: "border-cyan-200 bg-cyan-100",
    accentClassName: "text-cyan-800",
    buttonClassName: "bg-cyan-700 text-white"
  },
  {
    title: "Metrics",
    description: "Review RVU, staffing, and procedure trends.",
    href: "/admin/metrics",
    buttonLabel: "Open Metrics",
    cardClassName: "border-violet-200 bg-violet-100",
    accentClassName: "text-violet-800",
    buttonClassName: "bg-violet-700 text-white"
  }
] as const;

export function getProfileDashboardShortcut(
  context: Pick<AuthenticatedUserContext, "role" | "operationsRole">
) {
  if (context.role === "admin") {
    return { href: "/admin", label: "Admin View" } as const;
  }

  if (context.role === "lead") {
    return { href: "/operations", label: "Lead" } as const;
  }

  if (context.operationsRole === "aide") {
    return { href: "/operations", label: "Aide" } as const;
  }

  return null;
}
