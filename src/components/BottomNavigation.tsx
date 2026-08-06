import { CalendarDays, ClipboardList, Mail, Users, UserCog } from "lucide-react";

export type TabId = "schedule" | "manage-schedule" | "gossip" | "shift-board" | "staff";

type BottomNavigationProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
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

type NavigationItem = InternalNavigationItem | ExternalNavigationItem;

const navigationItems: NavigationItem[] = [
  { kind: "internal", id: "schedule", label: "Schedule", icon: CalendarDays },
  { kind: "internal", id: "manage-schedule", label: "Manage Schedule", icon: UserCog },
  { kind: "external", href: "https://mail.whhs.com", label: "Email", icon: Mail },
  { kind: "internal", id: "shift-board", label: "Cover/Switch", icon: ClipboardList },
  { kind: "internal", id: "staff", label: "Staff", icon: Users }
];

const navigationItemClass =
  "flex min-h-12 flex-col items-center justify-center rounded-xl px-0.5 text-[8px] font-extrabold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600";

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.55rem+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;

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

          const active = activeTab === item.id;

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
