"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Baby,
  Bed,
  Bone,
  CalendarCheck,
  ClipboardList,
  Droplet,
  Heart,
  Stethoscope,
  Users,
  Wind,
  X
} from "lucide-react";
import { boardPanelClass, boardTextActionClass } from "@/components/LeadBoardPreviews";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { activeRentalStatuses } from "@/lib/rental-management/status";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";
import {
  fetchLatestCanonicalShiftStatusUpdate,
  fetchLatestCanonicalVentStatusUpdate
} from "@/lib/shift-status/client-queries";
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
import { readSessionRvu, type SessionRvu } from "@/lib/shift-status/session-rvu";

function SummaryMetricRow({ label, value, helperText, valueClassName = "text-hospital-ink", children }: {
  label: string; value: string | number; helperText?: string; valueClassName?: string; children?: ReactNode;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-100 py-2 last:border-0">
    <h3 className="text-base font-semibold text-slate-700">{label}{helperText && <span className="ml-1 text-sm font-semibold"> · {helperText}</span>}</h3>
    <p data-testid="operational-summary-value" aria-label={`${label}: ${value === "—" ? "Unavailable" : value}`} className={`text-2xl font-bold tabular-nums ${valueClassName}`}>{value}</p>
    {children && <div className="w-full">{children}</div>}
  </div>;
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

function ShiftNotePreview({ note, loading, unavailable, onViewMore }: {
  note: string; loading: boolean; unavailable: boolean; onViewMore: () => void;
}) {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    const measure = () => setTruncated(Boolean(note) && element.scrollHeight > element.clientHeight + 1);
    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [note, loading, unavailable]);

  return (
    <div className="mt-2 h-20 min-w-0">
      <div className="flex h-10 items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-700">Shift Note</h3>
        {truncated && <button type="button" aria-label="View more of shift note" aria-haspopup="dialog" onClick={onViewMore} className={boardTextActionClass}>View more</button>}
      </div>
      <p ref={textRef} className="line-clamp-2 whitespace-pre-wrap break-words text-sm font-semibold leading-5 text-slate-700 [overflow-wrap:anywhere]">
        {loading ? "Loading shift note…" : unavailable ? "Shift note unavailable." : note || "No shift note for the latest update."}
      </p>
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
  timezone,
  children
}: {
  authContext: AuthenticatedUserContext;
  timezone: string;
  children?: ReactNode;
}) {
  const [updates, setUpdates] = useState<ShiftStatusUpdate[]>([]);
  const [latestVentUpdate, setLatestVentUpdate] = useState<ShiftStatusUpdate | null>(null);
  const [activeRentalCount, setActiveRentalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [shiftError, setShiftError] = useState("");
  const [rentalError, setRentalError] = useState("");
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
      const [shiftResult, ventResult, rentalResult] = await Promise.all([
        fetchLatestCanonicalShiftStatusUpdate(supabase, authContext.departmentId),
        fetchLatestCanonicalVentStatusUpdate(supabase, authContext.departmentId),
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
        setLatestVentUpdate(null);
        setShiftError("Shift metrics unavailable.");
        return;
      }

      setLatestVentUpdate(ventResult.error ? null : ventResult.data);
      setUpdates(shiftResult.data ? [shiftResult.data] : []);
      setShiftError(ventResult.error ? "Shift metrics unavailable." : "");
    },
    [authContext.departmentId]
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

  const resolved = useMemo(() => {
    const latest = updates[0] ?? null;
    const counts = procedureCounts(latest);

    return {
      latest,
      counts,
      totalProcedures: latest ? procedureTotal(counts) : null
    };
  }, [updates]);

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
  const ventCount = latestVentUpdate?.vent_count ?? "—";
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
        <div data-testid="operational-summary-grid" className={`grid grid-cols-1 gap-5 md:grid-cols-2 ${children ? "lg:grid-cols-3" : ""}`}>
          <section aria-labelledby="staffing-heading" className={boardPanelClass}>
            <h2 id="staffing-heading" className="mb-4 flex items-center gap-3 text-lg font-bold text-hospital-ink"><Users size={24} className="text-blue-600" aria-hidden="true" />Staffing</h2>
            <SummaryMetricRow label="Staff Needed" value={staffNeeded} helperText={staffNeededRvu} />
            <SummaryMetricRow label="Staff On Shift" value={staffOnShift} valueClassName={resolved.latest ? resolved.latest.rts_on < resolved.latest.rts_required ? "text-red-700" : "text-green-700" : undefined} />
            <ShiftNotePreview note={shiftNote} loading={loading} unavailable={Boolean(shiftError) && !resolved.latest} onViewMore={() => setShiftNoteOpen(true)} />
          </section>
          <section aria-labelledby="respiratory-heading" className={boardPanelClass}>
            <h2 id="respiratory-heading" className="mb-4 flex items-center gap-3 text-lg font-bold text-hospital-ink"><Wind size={24} className="text-blue-600" aria-hidden="true" />Respiratory Load</h2>
            <SummaryMetricRow label="Vent Count" value={ventCount} />
            <SummaryMetricRow label="BiPAP Count" value={bipapCount} />
            <SummaryMetricRow label="Active Rentals" value={rentalCount} />
            <SummaryMetricRow label="Procedures" value={procedures} />
            {hasProcedureDetails && <div className="mt-1 text-right"><button type="button" onClick={() => setProceduresOpen(true)} className={boardTextActionClass}>View Procedures</button></div>}
          </section>
          {children}
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
