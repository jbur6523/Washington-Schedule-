import { ChevronDown, ChevronRight } from "lucide-react";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import type { CoverageIntensity, DemoDay, ScheduleEntry, ShiftPost } from "@/data/mockSchedule";

type DayScheduleCardProps = {
  day: DemoDay;
  expanded: boolean;
  onToggle: () => void;
};

function EntryRow({ entry }: { entry: ScheduleEntry }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
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

function ScheduledRow({
  entry,
  wantsOff
}: {
  entry: ScheduleEntry;
  wantsOff: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-bold leading-5 text-hospital-ink">{entry.staffName}</p>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">{entry.shiftTime}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StaffTypeBadge staffType={entry.staffType} compact />
        <StatusChip status="Scheduled" compact />
        {wantsOff && <StatusChip status="Wants Off" compact />}
      </div>
    </div>
  );
}

function ShiftSection({
  title,
  entries,
  wantsOffEntries = []
}: {
  title: string;
  entries: ScheduleEntry[];
  wantsOffEntries?: ScheduleEntry[];
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
        {entries.map((entry) => {
          const wantsOff = wantsOffEntries.some(
            (item) => item.staffName === entry.staffName && item.shiftTime === entry.shiftTime
          );

          return (
            <ScheduledRow
              key={`${entry.staffName}-${entry.shiftTime}-${entry.status}`}
              entry={entry}
              wantsOff={wantsOff}
            />
          );
        })}
      </div>
    </section>
  );
}

function SimpleEntrySection({
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

const intensityRank: Record<CoverageIntensity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function getDayAlertPosts(posts: ShiftPost[]) {
  return [...posts]
    .sort((a, b) => intensityRank[b.coverageIntensity] - intensityRank[a.coverageIntensity])
    .filter(
      (post, index, sortedPosts) =>
        sortedPosts.findIndex((item) => item.coverageIntensity === post.coverageIntensity) === index
    );
}

export function DayScheduleCard({ day, expanded, onToggle }: DayScheduleCardProps) {
  const dayScheduled = day.scheduled.filter((entry) => entry.shiftTime === "7A-7P");
  const nightScheduled = day.scheduled.filter((entry) => entry.shiftTime === "7P-7A");
  const dayAvailable = day.available.filter((entry) => entry.shiftTime === "7A-7P");
  const nightAvailable = day.available.filter((entry) => entry.shiftTime === "7P-7A");
  const alertPosts = getDayAlertPosts(day.shiftPosts);

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
          <div className="flex max-w-32 flex-wrap justify-end gap-1">
            {alertPosts.map((post) => (
              <StatusChip key={`${post.id}-${post.status}`} status={post.status} compact />
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 p-4 pt-4">
          <ShiftSection title="Day Shift 7A-7P" entries={dayScheduled} wantsOffEntries={day.wantsOff} />
          <ShiftSection title="Night Shift 7P-7A" entries={nightScheduled} wantsOffEntries={day.wantsOff} />

          <div className="grid gap-4">
            <SimpleEntrySection title="Available - Days" entries={dayAvailable} />
            <SimpleEntrySection title="Available - Nights" entries={nightAvailable} />
            <SimpleEntrySection title="Scheduled but Wants Off" entries={day.wantsOff} />
          </div>

          <section className="rounded-2xl border border-slate-100 bg-white p-3">
            <h4 className="text-sm font-extrabold text-slate-800">Open shift posts</h4>
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
