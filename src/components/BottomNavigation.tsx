import Link from "next/link";
import { Bed, CalendarDays, ClipboardList, Mail, Users } from "lucide-react";

export type TabId = "schedule" | "manage-schedule" | "gossip" | "shift-board" | "staff" | "time-card";

type BottomNavigationProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  canAccessIcu: boolean;
};

type InternalNavigationItem = {
  kind: "internal";
  id: TabId;
  label: string;
  icon: typeof CalendarDays;
};

type ExternalNavigationItem = {
  kind: "external";
  href: string;
  label: string;
  icon: typeof CalendarDays;
};

type NavigationItem = InternalNavigationItem | ExternalNavigationItem | (Omit<ExternalNavigationItem, "kind"> & { kind: "page" });

const navigationItems: NavigationItem[] = [
  { kind: "internal", id: "schedule", label: "Schedule", icon: CalendarDays },
  { kind: "page", href: "/icu-command-center", label: "ICU", icon: Bed },
  { kind: "external", href: "https://mail.whhs.com/owa/", label: "Email", icon: Mail },
  { kind: "internal", id: "time-card", label: "Time Card", icon: ClipboardList },
  { kind: "internal", id: "staff", label: "Staff", icon: Users }
];

const navigationItemClass =
  "flex min-h-12 flex-col items-center justify-center rounded-xl px-0.5 text-[8px] font-extrabold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600";

export function BottomNavigation({ activeTab, onTabChange, canAccessIcu }: BottomNavigationProps) {
  const visibleItems = navigationItems.filter(item => item.kind !== "page" || canAccessIcu);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.55rem+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className={`mx-auto grid max-w-xl gap-1 ${canAccessIcu ? "grid-cols-5" : "grid-cols-4"}`}>
        {visibleItems.map((item) => {
          const Icon = item.icon;

          if (item.kind === "page") {
            return (
              <Link key={item.href} href={item.href} className={`${navigationItemClass} text-slate-500 hover:bg-slate-50`}>
                <Icon size={19} strokeWidth={2.2} aria-hidden="true" />
                <span className="mt-0.5">{item.label}</span>
              </Link>
            );
          }

          if (item.kind === "external") {
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${navigationItemClass} text-slate-500 hover:bg-slate-50`}
              >
                <Icon size={19} strokeWidth={2.2} aria-hidden="true" />
                <span className="mt-0.5">{item.label}</span>
              </a>
            );
          }

          const active = activeTab === item.id || (item.id === "time-card" && activeTab === "shift-board");

          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onTabChange(item.id)}
              className={`${navigationItemClass} ${
                active ? "bg-cyan-50 text-cyan-700" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.7 : 2.2} aria-hidden="true" />
              <span className="mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
