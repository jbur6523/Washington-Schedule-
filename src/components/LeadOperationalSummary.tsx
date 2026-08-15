"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Baby,
  Bed,
  Bone,
  Building2,
  CalendarCheck,
  ClipboardList,
  Droplet,
  Heart,
  Stethoscope,
  User,
  Users,
  Wind,
  X
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { activeRentalStatuses } from "@/lib/rental-management/status";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";
import { fetchReportingWindowShiftStatusUpdates } from "@/lib/shift-status/client-queries";
import {
  procedureCounts,
  procedureTotal,
  type ProcedureCounts
} from "@/lib/shift-status/procedures";
import {
  formatShiftStatusNumber,
  formatShiftStatusTime,
  updatedByName
} from "@/lib/shift-status/utils";
import {
  latestReportingWindowUpdate,
  reportingWindowEndDelay,
  reportingWindowForInstant,
  type ShiftUpdateReportingWindow
} from "@/lib/shift-status/reporting-window";
import { readSessionRvu, type SessionRvu } from "@/lib/shift-status/session-rvu";

type SummaryMetricCardProps = {
  icon: ReactNode;
  label: string;
  value: string | number;
  iconClass: string;
  helperText?: string;
  children?: ReactNode;
};

function SummaryMetricCard({ icon, label, value, iconClass, helperText, children }: SummaryMetricCardProps) {
  return (
    <article
      data-testid="operational-summary-tile"
      className="flex h-full min-h-20 min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-3.5 py-2.5 shadow-sm"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ${iconClass}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[10px] font-extrabold uppercase leading-4 tracking-wide text-slate-500">
          {label}
        </h2>
        <p
          data-testid="operational-summary-value"
          aria-label={`${label}: ${value === "—" ? "Unavailable" : value}`}
          className="text-2xl font-black leading-none text-hospital-ink sm:text-3xl"
        >
          {value}
        </p>
        {helperText && (
          <p className="mt-1 text-[11px] font-bold leading-none text-slate-500">{helperText}</p>
        )}
      </div>
      {children && <div className="w-full min-[640px]:ml-auto min-[640px]:w-auto">{children}</div>}
    </article>
  );
}

function ProcedureDetailCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-3 text-center">
      <span className="mx-auto grid h-8 w-8 place-items-center rounded-xl bg-white text-cyan-700 shadow-sm">
        {icon}
      </span>
      <p className="mt-1.5 text-[11px] font-extrabold uppercase leading-4 text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-black leading-none text-hospital-ink">{value}</p>
    </div>
  );
}

function ProcedureDetailsModal({
  open,
  onClose,
  update,
  counts,
  loading,
  stale,
  timezone
}: {
  open: boolean;
  onClose: () => void;
  update: ShiftStatusUpdate | null;
  counts: ProcedureCounts;
  loading: boolean;
  stale: boolean;
  timezone: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-procedure-details-heading"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-white bg-white p-4 shadow-2xl sm:rounded-[2rem] sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700">
              <CalendarCheck size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Operational Summary</p>
              <h2 id="lead-procedure-details-heading" className="text-xl font-black text-hospital-ink">
                Scheduled Procedures
              </h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600"
            aria-label="Close procedure details"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
            Loading procedures...
          </p>
        ) : update ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2.5 min-[440px]:grid-cols-3">
              <ProcedureDetailCard icon={<Bed size={17} />} label="C-Sections" value={counts.cSections} />
              <ProcedureDetailCard icon={<Baby size={17} />} label="Vaginal Delivery" value={counts.vaginalDelivery} />
              <ProcedureDetailCard icon={<Heart size={17} />} label="CABG" value={counts.cabg} />
              <ProcedureDetailCard icon={<Stethoscope size={17} />} label="Bronchs" value={counts.bronchs} />
              <ProcedureDetailCard icon={<Droplet size={17} />} label="Sputum Inductions" value={counts.sputumInductions} />
              <ProcedureDetailCard icon={<Bone size={17} />} label="MRI" value={counts.other} />
            </div>
            {counts.note && (
              <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                Other note: {counts.note}
              </p>
            )}
            <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-center text-xs font-bold leading-5 text-slate-500">
              <p>Last updated: {formatShiftStatusTime(update.updated_at, timezone)}</p>
              <p>Updated by: {updatedByName(update)}</p>
            </div>
          </>
        ) : (
          <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold leading-6 text-slate-500">
            {stale
              ? "The current-shift procedure update has expired after 24 hours."
              : "No procedure update is available for the current shift."}
          </p>
        )}
      </section>
    </div>
  );
}

function ShiftNoteModal({
  open,
  onClose,
  note
}: {
  open: boolean;
  onClose: () => void;
  note: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open || !note) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [note, onClose, open]);

  if (!open || !note) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-shift-note-heading"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-white bg-white p-4 shadow-2xl sm:rounded-[2rem] sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700">
              <ClipboardList size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Operational Summary</p>
              <h2 id="lead-shift-note-heading" className="text-xl font-black text-hospital-ink">
                Shift Note
              </h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600"
            aria-label="Close shift note"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm font-bold leading-6 text-slate-700">
          {note}
        </p>
      </section>
    </div>
  );
}

export function LeadOperationalSummary({
  authContext,
  timezone
}: {
  authContext: AuthenticatedUserContext;
  timezone: string;
}) {
  const [updates, setUpdates] = useState<ShiftStatusUpdate[]>([]);
  const [activeRentalCount, setActiveRentalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [shiftError, setShiftError] = useState("");
  const [rentalError, setRentalError] = useState("");
  const [reportingWindow, setReportingWindow] = useState<ShiftUpdateReportingWindow>(() => reportingWindowForInstant());
  const [proceduresOpen, setProceduresOpen] = useState(false);
  const [shiftNoteOpen, setShiftNoteOpen] = useState(false);
  const [sessionRvu, setSessionRvu] = useState<SessionRvu | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSessionRvu(readSessionRvu()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadSummary = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      }

      const supabase = createClient();
      const [shiftResult, rentalResult] = await Promise.all([
        fetchReportingWindowShiftStatusUpdates(
          supabase,
          authContext.departmentId,
          reportingWindow
        ),
        supabase
          .from("rental_records")
          .select("id", { count: "exact", head: true })
          .eq("department_id", authContext.departmentId)
          .in("status", activeRentalStatuses)
      ]);

      setLoading(false);

      if (rentalResult.error) {
        setActiveRentalCount(null);
        setRentalError("Active rental count unavailable.");
      } else {
        setActiveRentalCount(rentalResult.count ?? 0);
        setRentalError("");
      }

      if (shiftResult.error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Lead operational summary load failed", shiftResult.error);
        }
        setUpdates([]);
        setShiftError("Shift metrics unavailable.");
        return;
      }

      if (shiftResult.usedLegacyProcedureSelect && process.env.NODE_ENV !== "production") {
        console.warn(
          "Lead operational summary loaded without vaginal_delivery_count; apply the latest Supabase migration to persist that count."
        );
      }

      setUpdates(shiftResult.data);
      setShiftError("");
    },
    [authContext.departmentId, reportingWindow]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSummary(true);
    }, 0);
    const interval = window.setInterval(() => {
      void loadSummary(false);
    }, 60_000);
    const supabase = createClient();
    const channel = supabase
      .channel(`lead-operational-summary-${authContext.departmentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shift_status_updates",
          filter: `department_id=eq.${authContext.departmentId}`
        },
        () => {
          void loadSummary(false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rental_records",
          filter: `department_id=eq.${authContext.departmentId}`
        },
        () => {
          void loadSummary(false);
        }
      )
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [authContext.departmentId, loadSummary]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUpdates([]);
      setLoading(true);
      setProceduresOpen(false);
      setShiftNoteOpen(false);
      setReportingWindow(reportingWindowForInstant(new Date()));
    }, reportingWindowEndDelay(reportingWindow) + 25);

    return () => window.clearTimeout(timer);
  }, [reportingWindow]);

  const resolved = useMemo(() => {
    const latest = latestReportingWindowUpdate(updates, reportingWindow);
    const counts = procedureCounts(latest);

    return {
      latest,
      counts,
      totalProcedures: latest ? procedureTotal(counts) : null
    };
  }, [reportingWindow, updates]);

  const availabilityNotes = [shiftError, rentalError].filter(Boolean);
  const staffNeeded = resolved.latest
    ? resolved.latest.rts_required.toFixed(1)
    : "—";
  const staffOnShift = resolved.latest
    ? formatShiftStatusNumber(resolved.latest.rts_on)
    : "—";
  const persistedRvu = resolved.latest?.rvu_total;
  const sessionFallbackRvu = resolved.latest
    && sessionRvu?.departmentId === authContext.departmentId
    && sessionRvu.shiftDate === resolved.latest.shift_date
    && sessionRvu.shiftType === resolved.latest.shift_type
    && sessionRvu.rtsNeeded === resolved.latest.rts_required
      ? sessionRvu.rvuCount
      : null;
  const staffNeededRvu = persistedRvu !== null && persistedRvu !== undefined
    ? `${formatShiftStatusNumber(persistedRvu)} RVUs`
    : sessionFallbackRvu !== null
      ? `${formatShiftStatusNumber(sessionFallbackRvu)} RVUs`
      : undefined;
  const bipapCount = resolved.latest?.bipap_count ?? "—";
  const ventCount = resolved.latest?.vent_count ?? "—";
  const rentalCount = activeRentalCount ?? "—";
  const procedures = resolved.totalProcedures ?? "—";
  const shiftNote = resolved.latest?.shift_note?.trim() ?? "";
  const hasProcedureDetails = resolved.totalProcedures !== null
    && (resolved.totalProcedures > 0 || Boolean(resolved.counts.note?.trim()));
  const closeProcedures = useCallback(() => setProceduresOpen(false), []);
  const closeShiftNote = useCallback(() => setShiftNoteOpen(false), []);

  return (
    <>
      <section aria-label="Operational Summary" className="space-y-2.5">
        <div
          data-testid="operational-summary-grid"
          className="grid auto-rows-fr grid-cols-1 gap-2 min-[380px]:grid-cols-2 lg:grid-cols-3"
        >
          <SummaryMetricCard
            icon={<User size={18} aria-hidden="true" />}
            label="Staff Needed"
            value={staffNeeded}
            iconClass="bg-teal-50 text-teal-700 ring-teal-100"
            helperText={staffNeededRvu}
          >
            {shiftNote && (
              <button
                type="button"
                onClick={() => setShiftNoteOpen(true)}
                className="inline-flex min-h-8 w-full items-center justify-center rounded-xl border border-teal-300 bg-white px-2.5 text-[11px] font-extrabold text-teal-700 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 min-[640px]:w-auto"
              >
                View Shift Note
              </button>
            )}
          </SummaryMetricCard>
          <SummaryMetricCard
            icon={<Users size={18} aria-hidden="true" />}
            label="Staff On Shift"
            value={staffOnShift}
            iconClass="bg-cyan-50 text-cyan-700 ring-cyan-100"
          />
          <SummaryMetricCard
            icon={<Wind size={18} aria-hidden="true" />}
            label="Vent Count"
            value={ventCount}
            iconClass="bg-sky-50 text-sky-700 ring-sky-100"
          />
          <SummaryMetricCard
            icon={<Activity size={18} aria-hidden="true" />}
            label="BiPAP Count"
            value={bipapCount}
            iconClass="bg-teal-50 text-teal-700 ring-teal-100"
          />
          <SummaryMetricCard
            icon={<Building2 size={18} aria-hidden="true" />}
            label="Active Rentals"
            value={rentalCount}
            iconClass="bg-emerald-50 text-emerald-700 ring-emerald-100"
          />
          <SummaryMetricCard
            icon={<CalendarCheck size={18} aria-hidden="true" />}
            label="Procedures"
            value={procedures}
            iconClass="bg-violet-50 text-violet-700 ring-violet-100"
          >
            {hasProcedureDetails && (
              <button
                type="button"
                onClick={() => setProceduresOpen(true)}
                className="inline-flex min-h-8 w-full items-center justify-center rounded-xl border border-violet-300 bg-white px-2.5 text-[11px] font-extrabold text-violet-700 shadow-sm transition hover:border-violet-400 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 min-[640px]:w-auto"
              >
                View Procedures
              </button>
            )}
          </SummaryMetricCard>
        </div>

        {availabilityNotes.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-2 text-center text-[11px] font-bold leading-4 text-slate-500">
            <p>Some operational metrics are currently unavailable.</p>
          </div>
        )}
      </section>

      <ProcedureDetailsModal
        open={proceduresOpen}
        onClose={closeProcedures}
        update={resolved.latest}
        counts={resolved.counts}
        loading={loading}
        stale={false}
        timezone={timezone}
      />
      <ShiftNoteModal
        open={shiftNoteOpen}
        onClose={closeShiftNote}
        note={shiftNote}
      />
    </>
  );
}
