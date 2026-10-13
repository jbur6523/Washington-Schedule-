"use client";

import { useMemo } from "react";
import Link from "next/link";
import { FileText, Wind } from "lucide-react";
import {
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
  rawIcuError
}: DirectorDashboardIcuSummaryViewProps) {
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

      <Link
        href="/director/icu-report"
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-700 bg-white px-4 text-sm font-black text-cyan-700 shadow-sm"
      >
        <FileText size={17} aria-hidden="true" />
        ICU Report
      </Link>
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
