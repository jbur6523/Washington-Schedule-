import Link from "next/link";
import { CalendarDays, ChevronDown, ClipboardList, Users } from "lucide-react";
import { CommandCenterTabs } from "@/components/CommandCenterTabs";
import { formatOneDecimal, rtsNeededFromRvus } from "@/lib/metrics/rvu-staffing";
import { defaultCustomHistoryDates, type ShiftHistoryFilters } from "@/lib/shift-history/filters";
import type { ShiftHistoryRecord } from "@/lib/shift-history/types";
import { clinicalShiftTimeLabel } from "@/lib/shift-status/reporting-window";
import { procedureCounts, procedureTotal } from "@/lib/shift-status/procedures";
import { formatShiftStatusNumber, formatShiftStatusTime, shiftTypeLabel, updatedByName } from "@/lib/shift-status/utils";

const rangeOptions = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "1 Week" },
  { value: "30d", label: "1 Month" },
  { value: "custom", label: "Custom" }
] as const;

const shiftOptions = [
  { value: "all", label: "All Shifts" },
  { value: "day", label: "Day" },
  { value: "night", label: "Night" }
] as const;

function filterHref(filters: ShiftHistoryFilters, next: Partial<ShiftHistoryFilters>) {
  const merged = { ...filters, ...next };
  const query = new URLSearchParams({ range: merged.range, shift: merged.shift });
  if (merged.range === "custom" && merged.from && merged.to) {
    query.set("from", merged.from);
    query.set("to", merged.to);
  }
  if (merged.page > 1) query.set("page", String(merged.page));
  return `/command-center/history?${query}`;
}

function fullShiftDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00Z`));
}

function historyValue(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : formatShiftStatusNumber(value);
}

function StaffingValues({ record, compact = false }: { record: ShiftHistoryRecord; compact?: boolean }) {
  const calculated = record.rvu_total === null || record.rvu_total === undefined
    ? record.rts_required
    : rtsNeededFromRvus(record.rvu_total);
  const values = [
    ["Staff On Shift", formatShiftStatusNumber(record.rts_on)],
    ["Staff Needed", formatOneDecimal(calculated)],
    ["RVUs", record.rvu_total === null || record.rvu_total === undefined ? "Unavailable" : formatShiftStatusNumber(record.rvu_total)]
  ];

  return (
    <div className={`grid grid-cols-3 ${compact ? "gap-2" : "gap-3"}`}>
      {values.map(([label, value]) => (
        <div key={label} className={`${compact ? "py-1" : "rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm"}`}>
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`${compact ? "text-lg" : "mt-1 text-2xl"} font-black text-hospital-ink`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function ShiftDetails({ record, timezone }: { record: ShiftHistoryRecord; timezone: string }) {
  const counts = procedureCounts(record);
  const total = procedureTotal(counts);
  const procedureLabels = [
    ["C-Sections", counts.cSections],
    ["Vaginal Deliveries", counts.vaginalDelivery],
    ["CABG", counts.cabg],
    ["Bronchs", counts.bronchs],
    ["Sputum Inductions", counts.sputumInductions],
    ["MRI", counts.other]
  ] as const;

  return (
    <div className="space-y-4 border-t border-slate-200 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
      <StaffingValues record={record} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Vents", historyValue(record.vent_count)], ["BiPAPs", historyValue(record.bipap_count)], ["Procedures", String(total)]].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-100 px-3 py-2">
            <p className="text-[10px] font-extrabold uppercase text-slate-500">{label}</p>
            <p className="text-lg font-black text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      <section aria-label="Staff On Shift roster">
        <h3 className="flex items-center gap-2 text-base font-black text-hospital-ink"><Users size={17} /> Staff On Shift</h3>
        {record.roster?.phone_list_roster_entries.length ? (
          <ol className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-3">
            {record.roster.phone_list_roster_entries.map((entry) => (
              <li key={entry.id} className="py-2.5">
                <p className="text-sm font-extrabold text-slate-800">{entry.staff_display_name}</p>
                <p className="mt-0.5 text-xs font-bold text-slate-500">
                  {entry.area_labels.length ? entry.area_labels.join(" · ") : "Area not entered"}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 rounded-2xl bg-slate-100 px-3 py-3 text-sm font-bold text-slate-500">Roster was not captured for this shift.</p>
        )}
      </section>

      <section aria-label="Procedures">
        <h3 className="flex items-center gap-2 text-base font-black text-hospital-ink"><ClipboardList size={17} /> Procedures · {total}</h3>
        {(total > 0 || counts.note?.trim()) && (
          <div className="mt-2 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-3 text-sm font-bold leading-6 text-slate-700">
            {procedureLabels.filter(([, value]) => value > 0).map(([label, value]) => `${label} ${value}`).join(" · ")}
            {counts.note?.trim() && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">Other Procedures: {counts.note.trim()}</p>}
          </div>
        )}
      </section>

      {record.shift_note?.trim() && (
        <section aria-label="Shift Note" className="rounded-2xl border border-teal-100 bg-teal-50/70 px-3 py-3">
          <h3 className="text-sm font-black text-teal-900">Shift Note</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-700">{record.shift_note.trim()}</p>
        </section>
      )}

      <p className="text-xs font-bold text-slate-500">
        Last updated by {updatedByName(record)} · {formatShiftStatusTime(record.updated_at, timezone)}
      </p>
    </div>
  );
}

function ShiftCard({ record, timezone, defaultExpanded }: { record: ShiftHistoryRecord; timezone: string; defaultExpanded: boolean }) {
  const counts = procedureCounts(record);
  const total = procedureTotal(counts);

  return (
    <details open={defaultExpanded} className="group overflow-hidden rounded-3xl border border-slate-300 bg-white/95 shadow-md">
      <summary className="cursor-pointer list-none px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-700 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-hospital-ink">{fullShiftDate(record.shift_date, timezone)}</h2>
            <p className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${record.shift_type === "day" ? "bg-amber-100 text-amber-900" : "bg-indigo-100 text-indigo-900"}`}>
              {shiftTypeLabel(record.shift_type)} · {clinicalShiftTimeLabel(record.shift_type)}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-extrabold text-cyan-800">
            View Shift <ChevronDown size={16} className="transition group-open:rotate-180" />
          </span>
        </div>
        {!defaultExpanded && (
          <div className="mt-3">
            <StaffingValues record={record} compact />
            <p className="mt-2 text-xs font-bold text-slate-500">Vents {historyValue(record.vent_count)} · Procedures {total}</p>
          </div>
        )}
      </summary>
      <ShiftDetails record={record} timezone={timezone} />
    </details>
  );
}

export function ShiftHistory({
  records,
  filters,
  timezone,
  hasPrevious,
  hasNext,
  filterError,
  loadError
}: {
  records: ShiftHistoryRecord[];
  filters: ShiftHistoryFilters;
  timezone: string;
  hasPrevious: boolean;
  hasNext: boolean;
  filterError: string;
  loadError: boolean;
}) {
  const customDefaults = defaultCustomHistoryDates(new Date(), timezone);

  return (
    <main className="min-h-screen px-4 py-5 sm:py-7">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="text-center">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
          <h1 className="mt-1 text-3xl font-black text-hospital-ink lg:text-4xl">Shift History</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Review previous shift staffing, workload, procedures, and assignments.</p>
          <CommandCenterTabs />
        </header>

        <section aria-label="History filters" className="rounded-3xl border border-slate-300 bg-white/95 p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-2">
            <fieldset>
              <legend className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Time</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {rangeOptions.map((option) => (
                  <Link key={option.value} href={filterHref(filters, { range: option.value, page: 1 })} aria-current={filters.range === option.value ? "true" : undefined} className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${filters.range === option.value ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{option.label}</Link>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Shift</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {shiftOptions.map((option) => (
                  <Link key={option.value} href={filterHref(filters, { shift: option.value, page: 1 })} aria-current={filters.shift === option.value ? "true" : undefined} className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${filters.shift === option.value ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{option.label}</Link>
                ))}
              </div>
            </fieldset>
          </div>
          {filters.range === "custom" && (
            <form method="get" className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="range" value="custom" />
              <input type="hidden" name="shift" value={filters.shift} />
              <label className="text-xs font-extrabold uppercase text-slate-500">From<input required type="date" name="from" defaultValue={filters.from || customDefaults.from} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800" /></label>
              <label className="text-xs font-extrabold uppercase text-slate-500">To<input required type="date" name="to" defaultValue={filters.to || customDefaults.to} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800" /></label>
              <button type="submit" className="min-h-11 rounded-xl bg-cyan-700 px-5 text-sm font-black text-white">Apply</button>
            </form>
          )}
        </section>

        {(filterError || loadError) && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{filterError || "Shift History could not be loaded. Please retry."}</p>}

        {!filterError && !loadError && records.length === 0 ? (
          <section className="rounded-3xl border border-slate-300 bg-white/95 p-8 text-center shadow-sm">
            <CalendarDays className="mx-auto text-slate-400" size={30} />
            <p className="mt-3 text-base font-black text-slate-700">No saved shifts match these filters.</p>
          </section>
        ) : (
          <section aria-label="Shift records" className="space-y-3">
            {records.map((record) => <ShiftCard key={record.id} record={record} timezone={timezone} defaultExpanded={filters.range === "24h"} />)}
          </section>
        )}

        {(hasPrevious || hasNext) && (
          <nav aria-label="History pages" className="flex items-center justify-between gap-3">
            {hasPrevious ? <Link href={filterHref(filters, { page: filters.page - 1 })} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-700">Previous</Link> : <span />}
            <span className="text-xs font-bold text-slate-500">Page {filters.page}</span>
            {hasNext ? <Link href={filterHref(filters, { page: filters.page + 1 })} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-700">Next</Link> : <span />}
          </nav>
        )}
      </div>
    </main>
  );
}
