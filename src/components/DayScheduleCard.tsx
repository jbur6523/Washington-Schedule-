import { ChevronDown, ChevronRight } from "lucide-react";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import type { DemoDay, ScheduleEntry, ShiftPost } from "@/data/mockSchedule";

type DayScheduleCardProps = {
  day: DemoDay;
  expanded: boolean;
  onToggle: () => void;
};

function hasWantsOff(entry: ScheduleEntry, wantsOffEntries: ScheduleEntry[]) {
  return wantsOffEntries.some(
    (item) => item.staffName === entry.staffName && item.shiftTime === entry.shiftTime
  );
}

function StaffScheduleRow({
  entry,
  variant,
  wantsOff,
  posts
}: {
  entry: ScheduleEntry;
  variant: "scheduled" | "available";
  wantsOff?: boolean;
  posts?: ShiftPost[];
}) {
  const background =
    variant === "scheduled"
      ? "border-sky-100 bg-sky-50/90"
      : "border-emerald-100 bg-emerald-50/90";
  const label = variant === "scheduled" ? "Scheduled" : "Available";

  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${background}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold leading-5 text-hospital-ink">{entry.staffName}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {label} - {entry.shiftTime}
          </p>
        </div>
        <StaffTypeBadge staffType={entry.staffType} compact />
      </div>

      {(wantsOff || Boolean(posts?.length)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {wantsOff && <StatusChip status="Wants Off" compact />}
          {posts?.map((post) => (
            <StatusChip
              key={post.id}
              status={post.status}
              intensity={post.coverageIntensity}
              compact
            />
          ))}
        </div>
      )}

      {posts?.map((post) => (
        <p key={`${post.id}-note`} className="mt-1 text-xs font-semibold leading-5 text-slate-600">
          {post.description}
        </p>
      ))}
    </div>
  );
}

function ShiftAlertRow({ post }: { post: ShiftPost }) {
  return (
    <div
      className={`rounded-2xl border px-3 py-2.5 ${
        post.coverageIntensity === "critical"
          ? "border-red-200 bg-red-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status="Short Shift" intensity={post.coverageIntensity} compact />
        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
          {post.shiftTime}
        </span>
      </div>
      <p className="mt-1 text-xs font-bold leading-5 text-slate-700">{post.description}</p>
    </div>
  );
}

function ShiftGroup({
  title,
  shiftTime,
  scheduled,
  available,
  wantsOffEntries,
  posts
}: {
  title: string;
  shiftTime: "7A-7P" | "7P-7A";
  scheduled: ScheduleEntry[];
  available: ScheduleEntry[];
  wantsOffEntries: ScheduleEntry[];
  posts: ShiftPost[];
}) {
  const shiftPosts = posts.filter((post) => post.shiftTime === shiftTime);
  const shiftAlerts = shiftPosts.filter((post) => post.scope === "shift");

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-extrabold text-slate-800">{title}</h4>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
          {scheduled.length} scheduled / {available.length} available
        </span>
      </div>

      {shiftAlerts.map((post) => (
        <ShiftAlertRow key={post.id} post={post} />
      ))}

      <div className="space-y-2">
        {scheduled.map((entry) => {
          const employeePosts = shiftPosts.filter((post) => post.targetStaffName === entry.staffName);

          return (
            <StaffScheduleRow
              key={`${entry.staffName}-${entry.shiftTime}-scheduled`}
              entry={entry}
              variant="scheduled"
              wantsOff={hasWantsOff(entry, wantsOffEntries)}
              posts={employeePosts}
            />
          );
        })}

        {available.map((entry) => (
          <StaffScheduleRow
            key={`${entry.staffName}-${entry.shiftTime}-available`}
            entry={entry}
            variant="available"
          />
        ))}
      </div>
    </section>
  );
}

function getDayAlertPosts(posts: ShiftPost[]) {
  const alertKeys = new Set<string>();

  return posts.filter((post) => {
    const key = post.status === "Short Shift" ? `${post.status}-${post.coverageIntensity}` : post.status;

    if (alertKeys.has(key)) {
      return false;
    }

    alertKeys.add(key);
    return true;
  });
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
            {day.scheduled.length} scheduled - {day.available.length} available -{" "}
            {day.wantsOff.length} wants off
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600">
            {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </span>
          <div className="flex max-w-32 flex-wrap justify-end gap-1">
            {alertPosts.map((post) => (
              <StatusChip
                key={`${post.id}-${post.status}`}
                status={post.status}
                intensity={post.coverageIntensity}
                compact
              />
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 p-4 pt-4">
          <ShiftGroup
            title="Day Shift 7A-7P"
            shiftTime="7A-7P"
            scheduled={dayScheduled}
            available={dayAvailable}
            wantsOffEntries={day.wantsOff}
            posts={day.shiftPosts}
          />
          <ShiftGroup
            title="Night Shift 7P-7A"
            shiftTime="7P-7A"
            scheduled={nightScheduled}
            available={nightAvailable}
            wantsOffEntries={day.wantsOff}
            posts={day.shiftPosts}
          />
        </div>
      )}
    </article>
  );
}
