import { ChevronDown, ChevronRight } from "lucide-react";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import type { DemoDay, ScheduleEntry } from "@/data/mockSchedule";

type DayScheduleCardProps = {
  day: DemoDay;
  expanded: boolean;
  onToggle: () => void;
};

function EntryRow({ entry }: { entry: ScheduleEntry }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold leading-5 text-hospital-ink">{entry.staffName}</p>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">{entry.shiftTime}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StaffTypeBadge staffType={entry.staffType} compact />
        <StatusChip status={entry.status} compact />
      </div>
    </div>
  );
}

function ShiftSection({
  title,
  entries
}: {
  title: string;
  entries: ScheduleEntry[];
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-extrabold text-slate-700">{title}</h4>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
          {entries.length}
        </span>
      </div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <EntryRow key={`${entry.staffName}-${entry.shiftTime}-${entry.status}`} entry={entry} />
        ))}
      </div>
    </section>
  );
}

export function DayScheduleCard({ day, expanded, onToggle }: DayScheduleCardProps) {
  const dayScheduled = day.scheduled.filter((entry) => entry.shiftTime === "7A-7P");
  const nightScheduled = day.scheduled.filter((entry) => entry.shiftTime === "7P-7A");
  const dayOpenItems = [...day.available, ...day.wantsOff].filter((entry) => entry.shiftTime === "7A-7P");
  const nightOpenItems = [...day.available, ...day.wantsOff].filter((entry) => entry.shiftTime === "7P-7A");
  const urgentCount = day.shiftPosts.filter(
    (post) => post.status === "Need covered ASAP" || post.status === "Urgent coverage"
  ).length;

  return (
    <article className="overflow-hidden rounded-3xl border border-white bg-white/95 shadow-soft">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 p-5 text-left"
      >
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
            3-day demo schedule
          </p>
          <h2 className="mt-1 text-2xl font-black text-hospital-ink">{day.day}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {day.scheduled.length} scheduled • {day.available.length} available •{" "}
            {day.wantsOff.length} wants off
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600">
            {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </span>
          {urgentCount > 0 && <StatusChip status="Urgent coverage" compact />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-slate-100 p-5 pt-4">
          <ShiftSection title="Day Shift 7A-7P" entries={dayScheduled} />
          <ShiftSection title="Night Shift 7P-7A" entries={nightScheduled} />

          <div className="grid gap-4">
            <ShiftSection title="Available / Wants Off - Days" entries={dayOpenItems} />
            <ShiftSection title="Available / Wants Off - Nights" entries={nightOpenItems} />
          </div>

          <section className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
            <h4 className="text-sm font-extrabold text-rose-900">Open shift posts</h4>
            <div className="mt-3 space-y-2">
              {day.shiftPosts.map((post) => (
                <div key={post.id} className="rounded-xl bg-white px-3.5 py-3">
                  <p className="text-sm font-bold leading-5 text-slate-800">{post.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusChip status={post.status} compact />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{post.shiftTime}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
