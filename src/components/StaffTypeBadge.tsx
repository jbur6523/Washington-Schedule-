import type { StaffType } from "@/data/mockSchedule";

type StaffTypeBadgeProps = {
  staffType: StaffType;
  compact?: boolean;
};

export function StaffTypeBadge({ staffType, compact = false }: StaffTypeBadgeProps) {
  const label = staffType === "Full-time" ? "FT" : "PD";
  const classes =
    staffType === "Full-time"
      ? "border-purple-200 bg-purple-100 text-purple-700"
      : "border-amber-200 bg-amber-100 text-amber-800";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${classes} ${
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
      title={staffType}
    >
      {label}
    </span>
  );
}
