import type { ScheduleStatus } from "@/data/mockSchedule";

type StatusChipProps = {
  status: ScheduleStatus;
  compact?: boolean;
};

const statusClasses: Record<ScheduleStatus, string> = {
  Scheduled: "border-sky-200 bg-sky-100 text-sky-700",
  Available: "border-emerald-200 bg-emerald-100 text-emerald-700",
  "Wants off": "border-orange-200 bg-orange-100 text-orange-800",
  "Need covered ASAP": "border-rose-200 bg-rose-100 text-rose-700",
  "Urgent coverage": "border-red-200 bg-red-100 text-red-700",
  "Switch requested": "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700"
};

export function StatusChip({ status, compact = false }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${statusClasses[status]} ${
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      {status}
    </span>
  );
}
