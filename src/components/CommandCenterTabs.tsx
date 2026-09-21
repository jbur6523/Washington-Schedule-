"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/command-center", label: "Live Board" },
  { href: "/command-center/schedule", label: "Schedule" },
  { href: "/command-center/history", label: "History" }
] as const;

export function CommandCenterTabs({ variant = "default" }: { variant?: "default" | "board" }) {
  const board = variant === "board";
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Lead Command Board views" className={board ? "mt-5 flex border-b border-slate-200" : "mx-auto mt-3 grid w-full max-w-md grid-cols-3 rounded-2xl border border-slate-300 bg-slate-100 p-1"}>
      {tabs.map((tab) => {
        const selected = tab.href === "/command-center"
          ? pathname === tab.href
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={board ? `inline-flex min-h-11 items-center justify-center border-b-2 px-5 text-sm font-semibold sm:px-7 ${selected ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}` : `inline-flex min-h-9 items-center justify-center rounded-xl px-3 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 ${
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
