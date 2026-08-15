"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/command-center", label: "Live Board" },
  { href: "/command-center/history", label: "History" }
] as const;

export function CommandCenterTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Lead Command Board views" className="mx-auto mt-3 grid w-full max-w-xs grid-cols-2 rounded-2xl border border-slate-300 bg-slate-100 p-1">
      {tabs.map((tab) => {
        const selected = tab.href === "/command-center"
          ? pathname === tab.href
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={`inline-flex min-h-9 items-center justify-center rounded-xl px-3 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 ${
              selected
                ? "bg-white text-cyan-800 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
