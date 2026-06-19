import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";
import type { ScheduleStatus, StaffMember } from "@/data/mockSchedule";

type StaffCardProps = {
  staff: StaffMember;
  currentStatus: ScheduleStatus;
  summary: {
    scheduled: number;
    available: number;
    wantsOff: number;
  };
};

export function StaffCard({ staff, currentStatus, summary }: StaffCardProps) {
  return (
    <article className="rounded-2xl border border-white bg-white/95 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-hospital-ink">{staff.name}</h3>
          <p className="mt-1 text-sm font-medium text-hospital-muted">{staff.usualShift}</p>
        </div>
        <StaffTypeBadge staffType={staff.staffType} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <StatusChip status={currentStatus} compact />
        <p className="text-right text-xs font-semibold text-slate-500">
          {summary.scheduled} scheduled • {summary.available} available • {summary.wantsOff} wants off
        </p>
      </div>
    </article>
  );
}
