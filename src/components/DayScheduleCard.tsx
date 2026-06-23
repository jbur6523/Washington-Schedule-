import { ChevronDown, ChevronRight } from "lucide-react";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import type { DemoDay, ScheduleEntry, ShiftPost } from "@/data/mockSchedule";

export type ScheduleShiftFilter = "all" | "day" | "night";

type DayScheduleCardProps = {
  day: DemoDay;
  expanded: boolean;
  shiftFilter: ScheduleShiftFilter;
  shiftNotes?: Record<string, string>;
  onToggle: () => void;
};

function hasCoverageRequest(entry: ScheduleEntry, coverageRequestEntries: ScheduleEntry[]) {
  return coverageRequestEntries.some(
    (item) => item.staffName === entry.staffName && item.shiftTime === entry.shiftTime
  );
}

function StaffScheduleRow({
  entry,
  variant,
  coverageRequested,
  posts,
  note
}: {
  entry: ScheduleEntry;
  variant: "scheduled" | "available";
  coverageRequested?: boolean;
  posts?: ShiftPost[];
  note?: string;
}) {
  const background =
    variant === "scheduled"
      ? "border-sky-100 bg-sky-50/90"
      : "border-emerald-100 bg-emerald-50/90";

  return (
    <div className={`rounded-2xl border px-3 py-2 ${background}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold leading-5 text-hospital-ink">{entry.staffName}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">{entry.shiftTime}</p>
        </div>
        <StaffTypeBadge staffType={entry.staffType} compact />
      </div>

      {(coverageRequested || Boolean(posts?.length)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {coverageRequested && <StatusChip status="Coverage Requested" compact />}
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
        <p key={`${post.id}-note`} className="mt-1 text-xs font-semibold leading-4 text-slate-600">
          {post.description}
        </p>
      ))}

      {coverageRequested && (
        <p className="mt-1 text-xs font-semibold leading-4 text-slate-600">
          Coverage requested for this shift.
        </p>
      )}

      {note && (
        <p className="mt-2 rounded-xl bg-white/70 px-2.5 py-2 text-xs font-semibold leading-4 text-slate-600">
          {note}
        </p>
      )}
    </div>
  );
}

function ShiftAlertRow({ post }: { post: ShiftPost }) {
  return (
    <div
      className={`rounded-2xl border px-3 py-2 ${
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
      <p className="mt-1 text-xs font-bold leading-4 text-slate-700">{post.description}</p>
    </div>
  );
}

function ShiftGroup({
  dayName,
  title,
  shiftTime,
  scheduled,
  available,
  coverageRequestEntries,
  posts,
  shiftNotes
}: {
  dayName: DemoDay["day"];
  title: string;
  shiftTime: "7A-7P" | "7P-7A";
  scheduled: ScheduleEntry[];
  available: ScheduleEntry[];
  coverageRequestEntries: ScheduleEntry[];
  posts: ShiftPost[];
  shiftNotes?: Record<string, string>;
}) {
  const shiftPosts = posts.filter((post) => post.shiftTime === shiftTime);
  const shiftAlerts = shiftPosts.filter((post) => post.scope === "shift" && post.status === "Short Shift");

  return (
    <section className="space-y-2">
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
          const coverageRequested = hasCoverageRequest(entry, coverageRequestEntries);
          const employeePosts = shiftPosts.filter(
            (post) =>
              post.scope === "employee" &&
              post.targetStaffName === entry.staffName &&
              post.status === "Switch Requested"
          );
          const note = shiftNotes?.[`${entry.staffName}-${dayName}-${entry.shiftTime}`];

          return (
            <StaffScheduleRow
              key={`${entry.staffName}-${entry.shiftTime}-scheduled`}
              entry={entry}
              variant="scheduled"
              coverageRequested={coverageRequested}
              posts={employeePosts}
              note={note}
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

function shouldShowShift(shiftFilter: ScheduleShiftFilter, shiftTime: "7A-7P" | "7P-7A") {
  if (shiftFilter === "all") {
    return true;
  }

  return shiftFilter === "day" ? shiftTime === "7A-7P" : shiftTime === "7P-7A";
}

export function DayScheduleCard({ day, expanded, shiftFilter, shiftNotes, onToggle }: DayScheduleCardProps) {
  const dayScheduled = day.scheduled.filter((entry) => entry.shiftTime === "7A-7P");
  const nightScheduled = day.scheduled.filter((entry) => entry.shiftTime === "7P-7A");
  const dayAvailable = day.available.filter((entry) => entry.shiftTime === "7A-7P");
  const nightAvailable = day.available.filter((entry) => entry.shiftTime === "7P-7A");
  const visibleScheduled = day.scheduled.filter((entry) => shouldShowShift(shiftFilter, entry.shiftTime));
  const visibleAvailable = day.available.filter((entry) => shouldShowShift(shiftFilter, entry.shiftTime));
  const visibleCoverageRequests = day.coverageRequests.filter((entry) => shouldShowShift(shiftFilter, entry.shiftTime));
  const visiblePosts = day.shiftPosts.filter((post) => shouldShowShift(shiftFilter, post.shiftTime));
  const alertPosts = getDayAlertPosts(visiblePosts);
  const showDayShift = shouldShowShift(shiftFilter, "7A-7P");
  const showNightShift = shouldShowShift(shiftFilter, "7P-7A");
  const shiftSubtitle =
    shiftFilter === "all"
      ? "Day + Night"
      : shiftFilter === "day"
        ? "Day Shift 7A-7P"
        : "Night Shift 7P-7A";

  return (
    <article className="overflow-hidden rounded-2xl border border-white bg-white/95 shadow-soft">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <h2 className="text-xl font-black text-hospital-ink">{day.day}</h2>
          <p className="mt-0.5 text-xs font-extrabold uppercase tracking-wide text-cyan-700">
            {shiftSubtitle}
          </p>
          <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
            {visibleScheduled.length} scheduled - {visibleAvailable.length} available -{" "}
            {visibleCoverageRequests.length} coverage requested
          </p>
          <span className="mt-2 inline-flex text-xs font-extrabold text-cyan-700">
            {expanded ? "View less" : "View more"}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600">
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </span>
          <div className="flex max-w-28 flex-wrap justify-end gap-1">
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
        <div className="space-y-3 border-t border-slate-100 p-3.5">
          {showDayShift && (
            <ShiftGroup
              dayName={day.day}
              title="Day Shift 7A-7P"
              shiftTime="7A-7P"
              scheduled={dayScheduled}
              available={dayAvailable}
              coverageRequestEntries={day.coverageRequests}
              posts={day.shiftPosts}
              shiftNotes={shiftNotes}
            />
          )}
          {showNightShift && (
            <ShiftGroup
              dayName={day.day}
              title="Night Shift 7P-7A"
              shiftTime="7P-7A"
              scheduled={nightScheduled}
              available={nightAvailable}
              coverageRequestEntries={day.coverageRequests}
              posts={day.shiftPosts}
              shiftNotes={shiftNotes}
            />
          )}
        </div>
      )}
    </article>
  );
}
