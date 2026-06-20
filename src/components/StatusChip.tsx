import type { CoverageIntensity, ScheduleStatus } from "@/data/mockSchedule";

type StatusChipProps = {
  status: ScheduleStatus;
  intensity?: CoverageIntensity;
  compact?: boolean;
};

const statusClasses: Record<ScheduleStatus, string> = {
  Scheduled: "border-sky-200 bg-sky-100 text-sky-700",
  Available: "border-emerald-200 bg-emerald-100 text-emerald-700",
  "Wants Off": "border-amber-200 bg-amber-100 text-amber-800",
  "Short Shift": "border-amber-200 bg-amber-100 text-amber-800",
  "Switch Requested": "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700"
};

export function StatusChip({ status, intensity, compact = false }: StatusChipProps) {
  const classes =
    status === "Short Shift" && intensity === "critical"
      ? "border-red-300 bg-red-600 text-white"
      : statusClasses[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border font-bold ${classes} ${
        compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      {status}
    </span>
  );
}
