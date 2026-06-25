import { ChevronDown, ChevronRight } from "lucide-react";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import type { ScheduleDay, ScheduleEntry, ShiftPost } from "@/data/mockSchedule";
import { standardShiftTimes } from "@/lib/schedule/supabase-schedule";

export type ScheduleShiftFilter = "all" | "day" | "night";
export type AvailabilityTarget = {
  shift_date: string;
  shift_type: string;
  shift_start: string;
  shift_end: string;
};

type DayScheduleCardProps = {
  day: ScheduleDay;
  expanded: boolean;
  shiftFilter: ScheduleShiftFilter;
  shiftNotes?: Record<string, string>;
  availabilityByShift?: Record<string, string>;
  availabilitySaving?: boolean;
  onToggleAvailability?: (target: AvailabilityTarget, activeOverrideId?: string) => void;
  onToggle: () => void;
};

function hasCoverageRequest(entry: ScheduleEntry, coverageRequestEntries: ScheduleEntry[]) {
  return coverageRequestEntries.some(
    (item) => item.staffName === entry.staffName && item.shiftTime === entry.shiftTime
  );
}

function getShiftCategory(item: { shiftTime: string; shiftCategory?: "day" | "night" }) {
  if (item.shiftCategory) {
    return item.shiftCategory;
  }

  return item.shiftTime.startsWith("18:") || item.shiftTime.startsWith("19:") ? "night" : "day";
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
  const showChips = coverageRequested || Boolean(posts?.length) || variant === "available" || entry.selfAdded;

  return (
    <div className={`rounded-2xl border px-3 py-2 ${background}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1 text-sm font-extrabold leading-5 text-hospital-ink">
            <span>{entry.staffName}</span>
            {entry.coworkerTitles?.map((title) => (
              <span
                key={title.title}
                title={title.label}
                aria-label={title.label}
                className="inline-grid h-5 w-5 place-items-center rounded-full bg-white/75 text-[11px] leading-none shadow-sm"
              >
                {title.icon}
              </span>
            ))}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">{entry.shiftTime}</p>
          {entry.statusMessage && (
            <p className="mt-1 max-w-full rounded-xl bg-white/70 px-2 py-1 text-xs font-semibold leading-4 text-slate-600">
              {entry.statusMessage}
            </p>
          )}
        </div>
        <StaffTypeBadge staffType={entry.staffType} compact />
      </div>

      {showChips && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {variant === "available" && <StatusChip status="Available" compact />}
          {entry.selfAdded && <StatusChip status="Self-added" compact />}
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
  shiftCategory,
  scheduled,
  available,
  coverageRequestEntries,
  posts,
  shiftNotes,
  availabilityTarget,
  activeAvailabilityOverrideId,
  availabilitySaving,
  onToggleAvailability
}: {
  dayName: ScheduleDay["day"];
  title: string;
  shiftCategory: "day" | "night";
  scheduled: ScheduleEntry[];
  available: ScheduleEntry[];
  coverageRequestEntries: ScheduleEntry[];
  posts: ShiftPost[];
  shiftNotes?: Record<string, string>;
  availabilityTarget?: AvailabilityTarget | null;
  activeAvailabilityOverrideId?: string;
  availabilitySaving?: boolean;
  onToggleAvailability?: (target: AvailabilityTarget, activeOverrideId?: string) => void;
}) {
  const shiftPosts = posts.filter((post) => getShiftCategory(post) === shiftCategory);
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
              (post.targetStaffProfileId
                ? post.targetStaffProfileId === entry.staffProfileId
                : post.targetStaffName === entry.staffName) &&
              (post.status === "Switch Requested" || post.status === "Coverage Requested")
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
            key={`${entry.id}-available`}
            entry={entry}
            variant="available"
          />
        ))}
      </div>

      {availabilityTarget && onToggleAvailability && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-2.5">
          <button
            type="button"
            onClick={() => onToggleAvailability(availabilityTarget, activeAvailabilityOverrideId)}
            disabled={availabilitySaving}
            className={`min-h-10 w-full rounded-2xl px-3 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-60 ${
              activeAvailabilityOverrideId
                ? "border border-emerald-200 bg-white text-emerald-700"
                : "bg-emerald-600 text-white shadow-sm shadow-emerald-900/10"
            }`}
          >
            {activeAvailabilityOverrideId ? "Remove My Availability" : "Add Myself Available"}
          </button>
          <p className="mt-2 px-1 text-xs font-bold leading-4 text-emerald-900">
            Self-reported availability.
          </p>
        </div>
      )}
    </section>
  );
}

function availabilityKey(target: AvailabilityTarget) {
  return `${target.shift_date}|${target.shift_type}|${target.shift_start.slice(0, 5)}|${target.shift_end.slice(0, 5)}`;
}

function getAvailabilityTarget(
  day: ScheduleDay,
  shiftCategory: "day" | "night",
  entries: ScheduleEntry[]
): AvailabilityTarget | null {
  const entry = entries.find(
    (item) => item.shiftDate && item.shiftType && item.shiftStart && item.shiftEnd
  );

  if (entry?.shiftDate && entry.shiftType && entry.shiftStart && entry.shiftEnd) {
    return {
      shift_date: entry.shiftDate,
      shift_type: entry.shiftType,
      shift_start: entry.shiftStart,
      shift_end: entry.shiftEnd
    };
  }

  if (!day.dateValue) {
    return null;
  }

  return shiftCategory === "night"
    ? {
        shift_date: day.dateValue,
        shift_type: "night_shift",
        shift_start: standardShiftTimes.night_shift?.shift_start ?? "18:30",
        shift_end: standardShiftTimes.night_shift?.shift_end ?? "07:00"
      }
    : {
        shift_date: day.dateValue,
        shift_type: "day_shift",
        shift_start: standardShiftTimes.day_shift?.shift_start ?? "06:30",
        shift_end: standardShiftTimes.day_shift?.shift_end ?? "19:00"
      };
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

function shouldShowShift(
  shiftFilter: ScheduleShiftFilter,
  item: { shiftTime: string; shiftCategory?: "day" | "night" }
) {
  if (shiftFilter === "all") {
    return true;
  }

  return getShiftCategory(item) === shiftFilter;
}

export function DayScheduleCard({
  day,
  expanded,
  shiftFilter,
  shiftNotes,
  availabilityByShift,
  availabilitySaving,
  onToggleAvailability,
  onToggle
}: DayScheduleCardProps) {
  const dayScheduled = day.scheduled.filter((entry) => getShiftCategory(entry) === "day");
  const nightScheduled = day.scheduled.filter((entry) => getShiftCategory(entry) === "night");
  const dayAvailable = day.available.filter((entry) => getShiftCategory(entry) === "day");
  const nightAvailable = day.available.filter((entry) => getShiftCategory(entry) === "night");
  const visibleScheduled = day.scheduled.filter((entry) => shouldShowShift(shiftFilter, entry));
  const visibleAvailable = day.available.filter((entry) => shouldShowShift(shiftFilter, entry));
  const visibleCoverageRequests = day.coverageRequests.filter((entry) => shouldShowShift(shiftFilter, entry));
  const visiblePosts = day.shiftPosts.filter((post) => shouldShowShift(shiftFilter, post));
  const alertPosts = getDayAlertPosts(visiblePosts);
  const showDayShift = shouldShowShift(shiftFilter, { shiftTime: "06:30-19:00", shiftCategory: "day" });
  const showNightShift = shouldShowShift(shiftFilter, { shiftTime: "18:30-07:00", shiftCategory: "night" });
  const dayAvailabilityTarget = getAvailabilityTarget(day, "day", [...dayScheduled, ...dayAvailable]);
  const nightAvailabilityTarget = getAvailabilityTarget(day, "night", [...nightScheduled, ...nightAvailable]);
  const dayAvailabilityOverrideId = dayAvailabilityTarget
    ? availabilityByShift?.[availabilityKey(dayAvailabilityTarget)]
    : undefined;
  const nightAvailabilityOverrideId = nightAvailabilityTarget
    ? availabilityByShift?.[availabilityKey(nightAvailabilityTarget)]
    : undefined;
  const shiftSubtitle =
    shiftFilter === "all"
      ? "Day + Night"
      : shiftFilter === "day"
        ? "Day Shift 06:30-19:00"
        : "Night Shift 18:30-07:00";

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
                title="Day Shift 06:30-19:00"
                shiftCategory="day"
                scheduled={dayScheduled}
                available={dayAvailable}
              coverageRequestEntries={day.coverageRequests}
              posts={day.shiftPosts}
              shiftNotes={shiftNotes}
              availabilityTarget={dayAvailabilityTarget}
              activeAvailabilityOverrideId={dayAvailabilityOverrideId}
              availabilitySaving={availabilitySaving}
              onToggleAvailability={onToggleAvailability}
            />
          )}
            {showNightShift && (
              <ShiftGroup
                dayName={day.day}
                title="Night Shift 18:30-07:00"
                shiftCategory="night"
                scheduled={nightScheduled}
                available={nightAvailable}
              coverageRequestEntries={day.coverageRequests}
              posts={day.shiftPosts}
              shiftNotes={shiftNotes}
              availabilityTarget={nightAvailabilityTarget}
              activeAvailabilityOverrideId={nightAvailabilityOverrideId}
              availabilitySaving={availabilitySaving}
              onToggleAvailability={onToggleAvailability}
            />
          )}
        </div>
      )}
    </article>
  );
}
