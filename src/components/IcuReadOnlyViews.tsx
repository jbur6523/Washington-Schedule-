"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowLeft, RefreshCw, Wind, X } from "lucide-react";
import type { IcuPatientRecord, IcuSnapshotCounts } from "@/lib/icu-command-center/types";
import {
  formatIcuAirway,
  formatIcuDeviceSummary,
  formatIcuLastUpdated,
  formatIcuSettings,
  getIcuSnapshotCounts
} from "@/lib/icu-command-center/utils";
import { createClient } from "@/lib/supabase/client";

const icuPatientSelect = [
  "id",
  "department_id",
  "bed",
  "device_type",
  "airway_size",
  "airway_at",
  "airway_location",
  "vent_mode",
  "rate",
  "tidal_volume",
  "peep",
  "fio2",
  "ps",
  "t_high",
  "t_low",
  "p_high",
  "p_low",
  "percent_min_vol",
  "ipap",
  "epap",
  "cpap",
  "flow",
  "is_critical_vent",
  "is_active",
  "created_by_staff_profile_id",
  "updated_by_staff_profile_id",
  "created_at",
  "updated_at"
].join(", ");

type IcuReadOnlyProps = {
  departmentId: string;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
};

function SnapshotCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/80 px-3 py-3 text-center shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-cyan-700">{label}</p>
      <p className="mt-1 text-3xl font-black leading-none text-hospital-ink">{value}</p>
    </div>
  );
}

function IcuReadOnlyCard({ record }: { record: IcuPatientRecord }) {
  const airway = formatIcuAirway(record);

  return (
    <article className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">{record.bed}</p>
          <h3 className="mt-1 text-xl font-black text-hospital-ink">{formatIcuDeviceSummary(record)}</h3>
          {airway && <p className="mt-1 text-sm font-black text-slate-700">{airway}</p>}
          <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{formatIcuSettings(record)}</p>
          <p className="mt-2 text-xs font-bold text-slate-400">Updated {formatIcuLastUpdated(record.updated_at)}</p>
        </div>
        {record.is_critical_vent && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700">
            <AlertTriangle size={13} />
            Critical
          </span>
        )}
      </div>
    </article>
  );
}

function useIcuPatients(departmentId: string) {
  const [records, setRecords] = useState<IcuPatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("icu_patients")
      .select(icuPatientSelect)
      .eq("department_id", departmentId)
      .eq("is_active", true)
      .order("bed", { ascending: true });

    setLoading(false);

    if (loadError) {
      setRecords([]);
      setError("Could not load ICU snapshot.");
      return;
    }

    setRecords((data ?? []) as unknown as IcuPatientRecord[]);
  }, [departmentId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadRecords();
    });
  }, [loadRecords]);

  return { records, loading, error, reload: loadRecords };
}

export function DirectorIcuSnapshotSection({
  departmentId,
  onCountsChange
}: {
  departmentId: string;
  onCountsChange?: (counts: IcuSnapshotCounts) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const { records, loading, error, reload } = useIcuPatients(departmentId);
  const counts = useMemo(() => getIcuSnapshotCounts(records), [records]);

  useEffect(() => {
    if (!loading && !error) {
      onCountsChange?.(counts);
    }
  }, [counts, error, loading, onCountsChange]);

  return (
    <section className="rounded-[2rem] border border-white/80 bg-white/95 p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Wind size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black leading-tight text-hospital-ink">ICU Snapshot</h2>
          <p className="mt-0.5 text-sm font-bold leading-5 text-slate-500">Active ICU respiratory devices.</p>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <SnapshotCard label="Vents" value={counts.vents} />
        <SnapshotCard label="HFNC" value={counts.hfnc} />
        <SnapshotCard label="BiPAP" value={counts.bipap} />
        <SnapshotCard label="Critical Vents" value={counts.criticalVents} />
      </div>

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
            role="dialog"
            aria-modal="true"
            aria-labelledby="director-icu-detail-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white bg-slate-50 p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Read-only report</p>
                <h2 id="director-icu-detail-title" className="mt-1 text-2xl font-black text-hospital-ink">
                  ICU Detail
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
              >
                <X size={16} />
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {loading && <p className="rounded-2xl bg-white px-3 py-4 text-sm font-bold text-slate-500">Loading ICU detail...</p>}
              {!loading && records.length === 0 && (
                <p className="rounded-2xl bg-white px-3 py-4 text-center text-sm font-bold text-slate-500">
                  No active ICU respiratory devices.
                </p>
              )}
              {!loading && records.map((record) => <IcuReadOnlyCard key={record.id} record={record} />)}
            </div>

            <button
              type="button"
              onClick={() => void reload()}
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

export function IcuReadOnlyPage({
  departmentId,
  title = "ICU Snapshot",
  subtitle = "View ICU respiratory devices and settings.",
  backHref = "/",
  backLabel = "Back"
}: IcuReadOnlyProps) {
  const { records, loading, error, reload } = useIcuPatients(departmentId);
  const counts = useMemo(() => getIcuSnapshotCounts(records), [records]);

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Read-only report</p>
          <h1 className="mt-2 text-3xl font-black text-hospital-ink">{title}</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">{subtitle}</p>
        </section>

        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-cyan-700" />
              <h2 className="text-xl font-black text-hospital-ink">ICU Snapshot</h2>
            </div>
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <SnapshotCard label="Vents" value={counts.vents} />
            <SnapshotCard label="HFNC" value={counts.hfnc} />
            <SnapshotCard label="BiPAP" value={counts.bipap} />
            <SnapshotCard label="Critical Vents" value={counts.criticalVents} />
          </div>
        </section>

        {error && (
          <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}

        <section className="space-y-3">
          <h2 className="text-2xl font-black text-hospital-ink">Active ICU Entries</h2>
          {loading && (
            <p className="rounded-3xl border border-slate-100 bg-white/95 px-4 py-5 text-center text-sm font-bold text-slate-500 shadow-soft">
              Loading ICU entries...
            </p>
          )}
          {!loading && records.length === 0 && (
            <p className="rounded-3xl border border-slate-100 bg-white/95 px-4 py-5 text-center text-sm font-bold text-slate-500 shadow-soft">
              No active ICU respiratory devices.
            </p>
          )}
          {!loading && records.map((record) => <IcuReadOnlyCard key={record.id} record={record} />)}
        </section>

        <Link
          href={backHref}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
      </div>
    </main>
  );
}
