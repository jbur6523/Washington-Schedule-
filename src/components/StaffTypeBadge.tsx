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
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border font-extrabold ${classes} ${
        compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
      title={staffType}
    >
      {label}
    </span>
  );
}
