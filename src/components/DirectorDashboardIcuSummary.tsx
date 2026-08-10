"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Wind, X } from "lucide-react";
import {
  IcuReadOnlyCard,
  IcuSnapshotCard,
  latestIcuSnapshotRecord,
  useIcuPatients
} from "@/components/IcuReadOnlyViews";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import { getIcuSnapshotCounts } from "@/lib/icu-command-center/utils";
import {
  composeDirectorDashboardIcuSummary,
  type DirectorDashboardIcuSummaryModel
} from "@/lib/director-dashboard/icu-summary";
import { latestDirectorCardUpdate } from "@/lib/director-dashboard/update-metadata";
import type { OfficialVentCountUpdate } from "@/lib/shift-status/types";
import { formatShiftStatusTime } from "@/lib/shift-status/utils";

type DirectorIcuRecord = IcuPatientRecord & {
  updated_by_name?: string | null;
};

type DirectorDashboardIcuSummaryViewProps = {
  summary: DirectorDashboardIcuSummaryModel;
  officialVent: OfficialVentCountUpdate | null;
  officialVentLoading: boolean;
  officialVentError: string;
  timezone: string;
  records: DirectorIcuRecord[];
  rawIcuLoading: boolean;
  rawIcuError: string;
  onReload: () => void;
};

export function DirectorDashboardIcuSummaryView({
  summary,
  officialVent,
  officialVentLoading,
  officialVentError,
  timezone,
  records,
  rawIcuLoading,
  rawIcuError,
  onReload
}: DirectorDashboardIcuSummaryViewProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const latestSnapshotRecord = useMemo(
    () => latestIcuSnapshotRecord(records),
    [records]
  );
  const effectiveUpdate = useMemo(
    () =>
      latestDirectorCardUpdate(
        latestSnapshotRecord
          ? {
              updatedAt: latestSnapshotRecord.updated_at || latestSnapshotRecord.created_at,
              updatedBy: latestSnapshotRecord.updated_by_name
            }
          : null,
        officialVent
          ? {
              updatedAt: officialVent.created_at,
              updatedBy: officialVent.updated_by_name
            }
          : null
      ),
    [latestSnapshotRecord, officialVent]
  );

  useEffect(() => {
    if (!detailOpen) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDetailOpen(false);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [detailOpen]);

  return (
    <section
      aria-label="Leadership ICU Summary"
      className="rounded-[2rem] border border-white/80 bg-white/95 p-4 shadow-soft"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Wind size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black leading-tight text-hospital-ink">ICU Snapshot</h2>
          <p className="mt-0.5 text-sm font-bold leading-5 text-slate-500">
            Active ICU respiratory devices.
          </p>
        </div>
      </div>

      {rawIcuError && (
        <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
          {rawIcuError}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <IcuSnapshotCard label="Vents" value={summary.vents ?? "—"} />
        <IcuSnapshotCard label="HFNC" value={summary.hfnc} />
        <IcuSnapshotCard label="BiPAP" value={summary.bipap} />
        <IcuSnapshotCard label="Critical Vents" value={summary.criticalVents} />
      </div>

      {!officialVent && (
        <p className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-center text-xs font-bold text-slate-500">
          {officialVentLoading
            ? "Loading official vent count..."
            : officialVentError || "No vent count recorded yet."}
        </p>
      )}

      {effectiveUpdate && (
        <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-center text-xs font-bold leading-5 text-slate-500">
          <p>Last updated: {formatShiftStatusTime(effectiveUpdate.updatedAt, timezone)}</p>
          <p>Updated by: {effectiveUpdate.updatedBy}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-cyan-700 bg-white px-4 text-sm font-black text-cyan-700 shadow-sm"
      >
        View All
      </button>

      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="director-icu-detail-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white bg-slate-50 p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
                  Read-only report
                </p>
                <h2
                  id="director-icu-detail-title"
                  className="mt-1 text-2xl font-black text-hospital-ink"
                >
                  ICU Detail
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setDetailOpen(false)}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
              >
                <X size={16} />
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {rawIcuLoading && (
                <p className="rounded-2xl bg-white px-3 py-4 text-sm font-bold text-slate-500">
                  Loading ICU detail...
                </p>
              )}
              {!rawIcuLoading && records.length === 0 && (
                <p className="rounded-2xl bg-white px-3 py-4 text-center text-sm font-bold text-slate-500">
                  No active ICU respiratory devices.
                </p>
              )}
              {!rawIcuLoading &&
                records.map((record) => (
                  <IcuReadOnlyCard key={record.id} record={record} />
                ))}
            </div>

            <button
              type="button"
              onClick={onReload}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </section>
        </div>
      )}
    </section>
  );
}

export function DirectorDashboardIcuSummary({
  departmentId,
  officialVent,
  officialVentLoading,
  officialVentError,
  timezone
}: {
  departmentId: string;
  officialVent: OfficialVentCountUpdate | null;
  officialVentLoading: boolean;
  officialVentError: string;
  timezone: string;
}) {
  const {
    records,
    loading: rawIcuLoading,
    error: rawIcuError,
    reload
  } = useIcuPatients(departmentId);
  const rawIcuCounts = useMemo(() => getIcuSnapshotCounts(records), [records]);
  const summary = useMemo(
    () =>
      composeDirectorDashboardIcuSummary({
        officialVentCount: officialVent?.vent_count ?? null,
        rawIcuCounts
      }),
    [officialVent?.vent_count, rawIcuCounts]
  );

  return (
    <DirectorDashboardIcuSummaryView
      summary={summary}
      officialVent={officialVent}
      officialVentLoading={officialVentLoading}
      officialVentError={officialVentError}
      timezone={timezone}
      records={records}
      rawIcuLoading={rawIcuLoading}
      rawIcuError={rawIcuError}
      onReload={() => void reload()}
    />
  );
}
