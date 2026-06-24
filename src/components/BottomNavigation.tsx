import { CalendarDays, ClipboardList, Users, UserCog } from "lucide-react";

export type TabId = "schedule" | "manage-schedule" | "shift-board" | "staff";

type BottomNavigationProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
};

const tabs: Array<{ id: TabId; label: string; icon: typeof CalendarDays }> = [
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "manage-schedule", label: "Manage Schedule", icon: UserCog },
  { id: "shift-board", label: "Coverage Board", icon: ClipboardList },
  { id: "staff", label: "Staff", icon: Users }
];

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.55rem+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-0.5 text-[9px] font-extrabold leading-tight transition ${
                active ? "bg-cyan-50 text-cyan-700" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.7 : 2.2} />
              <span className="mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
