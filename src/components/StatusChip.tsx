import type { ScheduleStatus } from "@/data/mockSchedule";

type StatusChipProps = {
  status: ScheduleStatus;
  compact?: boolean;
};

const statusClasses: Record<ScheduleStatus, string> = {
  Scheduled: "border-sky-200 bg-sky-100 text-sky-700",
  Available: "border-emerald-200 bg-emerald-100 text-emerald-700",
  "Wants off": "border-amber-200 bg-amber-100 text-amber-800",
  "Need covered ASAP": "border-red-200 bg-red-100 text-red-700",
  "Urgent coverage": "border-rose-200 bg-rose-100 text-rose-700",
  "Switch requested": "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700"
};

export function StatusChip({ status, compact = false }: StatusChipProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border font-bold ${statusClasses[status]} ${
        compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      {status}
    </span>
  );
}
