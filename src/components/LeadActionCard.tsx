import { ChevronRight, type LucideIcon } from "lucide-react";

export const leadActionCardClass =
  "group relative flex h-full min-h-[5.5rem] w-full items-center gap-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3.5 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 active:translate-y-0";

export function LeadActionCardContent({
  icon: Icon,
  title,
  description,
  accentClass,
  iconClass,
  secondaryText,
  badge
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  accentClass: string;
  iconClass: string;
  secondaryText?: string;
  badge?: string;
}) {
  return (
    <>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${accentClass}`} />
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ${iconClass}`}
      >
        <Icon size={21} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-black leading-5 text-hospital-ink sm:text-lg">
          {title}
        </span>
        <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-500 sm:text-sm">
          {description}
        </span>
        {secondaryText && (
          <span className="mt-0.5 block text-[11px] font-extrabold leading-4 text-amber-700">
            {secondaryText}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2 self-center">
        {badge && (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
            {badge}
          </span>
        )}
        <ChevronRight
          data-testid="lead-action-chevron"
          size={20}
          aria-hidden="true"
          className="text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600"
        />
      </span>
    </>
  );
}
