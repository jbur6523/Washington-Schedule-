"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Moon, Sun } from "lucide-react";
import {
  PROCEDURE_TYPES,
  dateLabel,
  type DailyProcedureMetric,
  type ProcedureShiftMetric
} from "@/lib/metrics/procedures";

const DAYS_PER_PAGE = 7;

function FullShiftBreakdown({ shift }: { shift: ProcedureShiftMetric | null }) {
  if (!shift) {
    return <p className="text-xs font-bold text-slate-400">No update submitted</p>;
  }

  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
      {PROCEDURE_TYPES.map((procedure) => (
        <div key={procedure.id}>
          <dt className="font-bold text-slate-500">{procedure.label}</dt>
          <dd className="font-black text-hospital-ink">{shift.counts[procedure.id]}</dd>
        </div>
      ))}
    </dl>
  );
}

function PositiveCategorySummary({ day }: { day: DailyProcedureMetric }) {
  const positiveCategories = PROCEDURE_TYPES.filter((procedure) => day.counts[procedure.id] > 0);

  if (positiveCategories.length === 0) {
    return day.day || day.night
      ? <p className="mt-1 text-xs font-bold text-slate-500">Submitted with zero procedures</p>
      : <p className="mt-1 text-xs font-bold text-slate-500">No procedure updates</p>;
  }

  return (
    <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
      {positiveCategories.map((procedure) => `${procedure.label} ${day.counts[procedure.id]}`).join(" · ")}
    </p>
  );
}

function MissingUpdateSummary({ day }: { day: DailyProcedureMetric }) {
  if (!day.day && !day.night) return null;
  if (!day.day) return <p className="mt-1 text-xs font-bold text-amber-700">Day update missing</p>;
  if (!day.night) return <p className="mt-1 text-xs font-bold text-amber-700">Night update missing</p>;
  return null;
}

function DailyRow({
  day,
  expanded,
  onToggle
}: {
  day: DailyProcedureMetric;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasUpdate = Boolean(day.day || day.night);
  const detailId = `procedure-day-${day.date}`;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
        className="flex min-h-11 w-full items-start justify-between gap-3 p-3 text-left sm:p-4"
      >
        <span className="min-w-0">
          <span className="block font-black text-hospital-ink">
            {dateLabel(day.date)}{hasUpdate ? ` — ${day.total} ${day.total === 1 ? "procedure" : "procedures"}` : ""}
          </span>
          <span className="mt-0.5 block text-xs font-extrabold text-slate-600">
            {hasUpdate ? `Day ${day.day?.total ?? "—"} · Night ${day.night?.total ?? "—"}` : "No procedure updates"}
          </span>
          {hasUpdate ? <PositiveCategorySummary day={day} /> : null}
          <MissingUpdateSummary day={day} />
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`mt-1 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded ? (
        <div id={detailId} className="grid gap-3 border-t border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-2 sm:p-4">
          <section aria-label={`${dateLabel(day.date)} Day shift detail`}>
            <h3 className="inline-flex items-center gap-1 text-xs font-extrabold uppercase text-cyan-800">
              <Sun size={13} aria-hidden="true" /> Day · {day.day ? `${day.day.total} total` : "missing"}
            </h3>
            <FullShiftBreakdown shift={day.day} />
          </section>
          <section aria-label={`${dateLabel(day.date)} Night shift detail`}>
            <h3 className="inline-flex items-center gap-1 text-xs font-extrabold uppercase text-violet-800">
              <Moon size={13} aria-hidden="true" /> Night · {day.night ? `${day.night.total} total` : "missing"}
            </h3>
            <FullShiftBreakdown shift={day.night} />
          </section>
        </div>
      ) : null}
    </article>
  );
}

export function ProcedureDailyDetail({
  days,
  isCurrentMonth
}: {
  days: DailyProcedureMetric[];
  isCurrentMonth: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(days.length / DAYS_PER_PAGE));
  const initialPage = isCurrentMonth ? pageCount - 1 : 0;
  const [page, setPage] = useState(initialPage);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const visibleDays = days.slice(page * DAYS_PER_PAGE, (page + 1) * DAYS_PER_PAGE);

  function changePage(nextPage: number) {
    setPage(nextPage);
    setExpandedDate(null);
  }

  const pageRange = visibleDays.length === 0
    ? "No tracked days"
    : `${dateLabel(visibleDays[0].date)}–${dateLabel(visibleDays.at(-1)?.date ?? visibleDays[0].date)}`;

  return (
    <section aria-labelledby="daily-procedure-detail-heading" className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <CalendarDays size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 id="daily-procedure-detail-heading" className="text-lg font-black text-hospital-ink">Daily Detail</h2>
            <span
              title="A submitted zero is reported data; a dash means no shift update was submitted."
              aria-label="A submitted zero is reported data; a dash means no shift update was submitted."
              className="text-slate-400"
            >
              <CircleHelp size={16} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-0.5 text-xs font-bold text-slate-500">Canonical Day and Night audit detail · 7 days per page</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-slate-50 p-2">
        <button
          type="button"
          onClick={() => changePage(page - 1)}
          disabled={page === 0}
          className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-extrabold text-slate-700 disabled:text-slate-300"
        >
          <ChevronLeft size={15} aria-hidden="true" /> Previous
        </button>
        <p className="text-center text-xs font-black text-slate-600">
          <span className="block">{pageRange}</span>
          <span className="font-bold text-slate-400">Page {page + 1} of {pageCount}</span>
        </p>
        <button
          type="button"
          onClick={() => changePage(page + 1)}
          disabled={page >= pageCount - 1}
          className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-extrabold text-slate-700 disabled:text-slate-300"
        >
          Next <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 space-y-2" aria-live="polite">
        {visibleDays.map((day) => (
          <DailyRow
            key={day.date}
            day={day}
            expanded={expandedDate === day.date}
            onToggle={() => setExpandedDate((current) => current === day.date ? null : day.date)}
          />
        ))}
        {visibleDays.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">No tracked days are available for this month.</p>
        ) : null}
      </div>
    </section>
  );
}
