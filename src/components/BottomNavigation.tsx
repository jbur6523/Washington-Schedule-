import { CalendarDays, ClipboardList, Users, UserCheck } from "lucide-react";

export type TabId = "schedule" | "availability" | "shift-board" | "staff";

type BottomNavigationProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
};

const tabs: Array<{ id: TabId; label: string; icon: typeof CalendarDays }> = [
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "availability", label: "Availability", icon: UserCheck },
  { id: "shift-board", label: "Shift Board", icon: ClipboardList },
  { id: "staff", label: "Staff", icon: Users }
];

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-3 pt-2 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-2xl px-1 text-[11px] font-extrabold transition ${
                active ? "bg-cyan-50 text-cyan-700" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon size={21} strokeWidth={active ? 2.7 : 2.2} />
              <span className="mt-1">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
