import { ArrowRightLeft, ClipboardList, SearchCheck } from "lucide-react";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import type { ShiftPost } from "@/data/mockSchedule";

type ShiftPostCardProps = {
  post: ShiftPost;
  onDemoAction: () => void;
};

const typeIcon = {
  "Open to Switch": ArrowRightLeft,
  "Short Shift / Available to Pick Up": SearchCheck,
  "Need Covered ASAP": ClipboardList
};

export function ShiftPostCard({ post, onDemoAction }: ShiftPostCardProps) {
  const Icon = typeIcon[post.type];

  return (
    <article className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Icon size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
              {post.day} • {post.shiftTime}
            </p>
            <StatusChip status={post.status} compact />
          </div>
          <h3 className="mt-2 text-lg font-black text-hospital-ink">{post.type}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{post.description}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Posted by</p>
          <p className="truncate text-sm font-extrabold text-slate-800">{post.postedBy}</p>
        </div>
        <StaffTypeBadge staffType={post.staffType} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {["I can cover", "Offer switch", "Details"].map((label) => (
          <button
            key={label}
            type="button"
            onClick={onDemoAction}
            className="rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50"
          >
            {label}
          </button>
        ))}
      </div>
    </article>
  );
}
