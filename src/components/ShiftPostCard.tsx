import { ArrowRightLeft, CalendarX, ClipboardCheck, SearchCheck } from "lucide-react";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import type { ShiftPost, ShiftPostType } from "@/data/mockSchedule";

type ShiftPostCardProps = {
  post: ShiftPost;
  relatedStatuses?: ShiftPostType[];
  onOfferCoverage?: () => void;
  onOfferSwitch?: () => void;
  coverageActionLabel?: string;
  switchActionLabel?: string;
  coverageActionDisabled?: boolean;
  switchActionDisabled?: boolean;
  onResolve?: () => void;
  onCancelShortShift?: () => void;
};

const typeIcon = {
  "Switch Requested": ArrowRightLeft,
  "Coverage Requested": ClipboardCheck,
  "Wants Off": CalendarX,
  "Short Shift": SearchCheck
};

const typeHelp = {
  "Switch Requested": "Open to switching this scheduled shift.",
  "Coverage Requested": "Coverage requested for this shift.",
  "Wants Off": "Wants this shift covered.",
  "Short Shift": "Department is short for part or all of this shift."
};

export function ShiftPostCard({
  post,
  relatedStatuses,
  onOfferCoverage,
  onOfferSwitch,
  coverageActionLabel,
  switchActionLabel,
  coverageActionDisabled,
  switchActionDisabled,
  onResolve,
  onCancelShortShift
}: ShiftPostCardProps) {
  const Icon = typeIcon[post.type];
  const isAide = post.operationsRole === "aide";
  const statuses = Array.from(new Set(relatedStatuses?.length ? relatedStatuses : [post.status]));
  const hasCoverageRequest = statuses.includes("Coverage Requested");
  const hasSwitchRequest = statuses.includes("Switch Requested");
  const hasWantsOffRequest = statuses.includes("Wants Off");
  const title = statuses.length > 1 ? statuses.join(" + ") : post.type;
  const actionButtons = [
    (post.type === "Coverage Requested" ||
      post.type === "Wants Off" ||
      post.type === "Short Shift" ||
      hasCoverageRequest ||
      hasWantsOffRequest) && onOfferCoverage
      ? {
          label: coverageActionLabel ?? (post.type === "Short Shift" ? "I Can Cover" : "Offer Coverage"),
          onClick: onOfferCoverage,
          disabled: Boolean(coverageActionDisabled)
        }
      : null,
    (post.type === "Switch Requested" || hasSwitchRequest) && onOfferSwitch
      ? { label: switchActionLabel ?? "Offer Switch", onClick: onOfferSwitch, disabled: Boolean(switchActionDisabled) }
      : null,
  ].filter((button): button is { label: string; onClick: () => void; disabled: boolean } => Boolean(button));

  return (
    <article className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Icon size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
              {post.day} - {post.shiftTypeLabel ?? "Shift"} - {post.shiftTime}
            </p>
            {statuses.map((status) => (
              <StatusChip key={status} status={status} intensity={post.coverageIntensity} compact />
            ))}
          </div>
          <h3 className="mt-2 text-base font-black leading-6 text-hospital-ink">{title}</h3>
          <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
            {typeHelp[post.type]}
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{post.description}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Posted by</p>
          <p className="text-sm font-extrabold leading-5 text-slate-800">{post.postedBy}</p>
        </div>
        <StaffTypeBadge staffType={post.staffType} isAide={isAide} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {actionButtons.map((button) => (
          <button
            key={button.label}
            type="button"
            onClick={button.onClick}
            disabled={button.disabled}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center text-sm font-extrabold text-slate-700 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50 disabled:bg-slate-100 disabled:text-slate-400"
          >
            {button.label}
          </button>
        ))}
        {onResolve && (
          <button
            type="button"
            onClick={onResolve}
            className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-center text-sm font-extrabold text-emerald-700 shadow-sm"
          >
            Resolve
          </button>
        )}
        {onCancelShortShift && (
          <button
            type="button"
            onClick={onCancelShortShift}
            className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-center text-sm font-extrabold text-rose-700 shadow-sm"
          >
            Cancel Alert
          </button>
        )}
      </div>
    </article>
  );
}
