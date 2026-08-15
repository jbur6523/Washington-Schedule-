import { ClipboardList, Users } from "lucide-react";
import { formatOneDecimal, rtsNeededFromRvus } from "@/lib/metrics/rvu-staffing";
import type { ShiftHistoryRecord } from "@/lib/shift-history/types";
import { clinicalShiftTimeLabel } from "@/lib/shift-status/reporting-window";
import { procedureCounts, procedureTotal } from "@/lib/shift-status/procedures";
import { formatShiftStatusNumber, formatShiftStatusTime, shiftTypeLabel, updatedByName } from "@/lib/shift-status/utils";

export function fullShiftDate(value: string, timezone: string) {
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

export function ShiftRecordIdentity({ record, timezone }: { record: ShiftHistoryRecord; timezone: string }) {
  return (
    <div>
      <h2 className="text-lg font-black text-hospital-ink">{fullShiftDate(record.shift_date, timezone)}</h2>
      <p className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${record.shift_type === "day" ? "bg-amber-100 text-amber-900" : "bg-indigo-100 text-indigo-900"}`}>
        {shiftTypeLabel(record.shift_type)} · {clinicalShiftTimeLabel(record.shift_type)}
      </p>
    </div>
  );
}

export function ShiftStaffingValues({ record, compact = false }: { record: ShiftHistoryRecord; compact?: boolean }) {
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

export function ShiftRecordDetails({
  record,
  timezone,
  rosterState = "ready"
}: {
  record: ShiftHistoryRecord;
  timezone: string;
  rosterState?: "loading" | "error" | "ready";
}) {
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
      <ShiftStaffingValues record={record} />

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
        {rosterState === "loading" ? (
          <p className="mt-2 rounded-2xl bg-slate-100 px-3 py-3 text-sm font-bold text-slate-500">Loading captured roster...</p>
        ) : rosterState === "error" ? (
          <p role="alert" className="mt-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">Captured roster could not be loaded.</p>
        ) : record.roster?.phone_list_roster_entries.length ? (
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
