import type { AuthenticatedUserContext } from "@/lib/auth/types";

export const adminDashboardAreas = [
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
    title: "Staff Management",
    description: "Manage staff profiles, roles, and access.",
    href: "/admin/roster",
    buttonLabel: "Open Staff Management",
    className: "border-slate-200 bg-white text-slate-700"
  },
  {
    title: "Import Schedule",
    description: "Upload, review, match roster names, and create a schedule version.",
    href: "/admin/import-schedule",
    buttonLabel: "Open Import Schedule",
    className: "border-cyan-100 bg-cyan-50/80 text-cyan-700"
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
