import { CalendarDays, ClipboardList, MessageCircle, Users, UserCog } from "lucide-react";

export type TabId = "schedule" | "manage-schedule" | "gossip" | "shift-board" | "staff";

type BottomNavigationProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
};

const tabs: Array<{ id: TabId; label: string; icon: typeof CalendarDays }> = [
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "manage-schedule", label: "Manage Schedule", icon: UserCog },
  { id: "gossip", label: "Gossip", icon: MessageCircle },
  { id: "shift-board", label: "Cover/Switch", icon: ClipboardList },
  { id: "staff", label: "Staff", icon: Users }
];

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.55rem+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onTabChange(tab.id)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-0.5 text-[8px] font-extrabold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
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
