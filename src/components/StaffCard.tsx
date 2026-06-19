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
          <h3 className="text-base font-bold leading-6 text-hospital-ink">{staff.name}</h3>
          <p className="mt-1 text-sm font-medium text-hospital-muted">{staff.usualShift}</p>
        </div>
        <StaffTypeBadge staffType={staff.staffType} />
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3">
        <StatusChip status={currentStatus} compact />
        <p className="text-xs font-semibold leading-5 text-slate-500">
          {summary.scheduled} scheduled • {summary.available} available • {summary.wantsOff} wants off
        </p>
      </div>
    </article>
  );
}
