"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import {
  formatIcuAirway,
  formatIcuDeviceSummary,
  formatIcuLastUpdated,
  formatIcuSettings,
  getIcuSnapshotCounts
} from "@/lib/icu-command-center/utils";
import { createClient } from "@/lib/supabase/client";
import { useOfficialVentCount } from "@/lib/shift-status/use-official-vent-count";
import {
  formatShiftStatusTime,
  officialVentSourceLabel
} from "@/lib/shift-status/utils";

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
  "ventilator_outcome",
  "discontinued_at",
  "discontinued_by_staff_profile_id",
  "is_active",
  "created_by_staff_profile_id",
  "updated_by_staff_profile_id",
  "created_at",
  "updated_at"
].join(", ");
const baseIcuPatientSelect = [
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
const optionalIcuColumns = ["ventilator_outcome", "discontinued_at", "discontinued_by_staff_profile_id"];

type IcuReadOnlyProps = {
  departmentId: string;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  timezone?: string;
};

export function IcuSnapshotCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/80 px-3 py-3 text-center shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-cyan-700">{label}</p>
      <p className="mt-1 text-3xl font-black leading-none text-hospital-ink">{value}</p>
    </div>
  );
}

export function IcuReadOnlyCard({ record }: { record: IcuPatientRecord }) {
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

type IcuLoadError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type IcuReadOnlyRecord = IcuPatientRecord & {
  updated_by_name?: string | null;
};

function isMissingOptionalIcuColumn(error: IcuLoadError | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();

  return error?.code === "42703" || optionalIcuColumns.some((column) => message.includes(column));
}

function logIcuLoadError(context: string, departmentId: string, error: IcuLoadError) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error("ICU snapshot load failed", {
    context,
    departmentId,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint
  });
}

function normalizeIcuRecord(record: Partial<IcuPatientRecord>): IcuReadOnlyRecord {
  return {
    id: record.id ?? "",
    department_id: record.department_id ?? "",
    bed: record.bed ?? "",
    device_type: record.device_type ?? "vent",
    airway_size: record.airway_size ?? null,
    airway_at: record.airway_at ?? null,
    airway_location: record.airway_location ?? null,
    vent_mode: record.vent_mode ?? null,
    rate: record.rate ?? null,
    tidal_volume: record.tidal_volume ?? null,
    peep: record.peep ?? null,
    fio2: record.fio2 ?? null,
    ps: record.ps ?? null,
    t_high: record.t_high ?? null,
    t_low: record.t_low ?? null,
    p_high: record.p_high ?? null,
    p_low: record.p_low ?? null,
    percent_min_vol: record.percent_min_vol ?? null,
    ipap: record.ipap ?? null,
    epap: record.epap ?? null,
    cpap: record.cpap ?? null,
    flow: record.flow ?? null,
    is_critical_vent: Boolean(record.is_critical_vent),
    ventilator_outcome: record.ventilator_outcome ?? null,
    discontinued_at: record.discontinued_at ?? null,
    discontinued_by_staff_profile_id: record.discontinued_by_staff_profile_id ?? null,
    is_active: record.is_active ?? true,
    created_by_staff_profile_id: record.created_by_staff_profile_id ?? null,
    updated_by_staff_profile_id: record.updated_by_staff_profile_id ?? null,
    created_at: record.created_at ?? "",
    updated_at: record.updated_at ?? record.created_at ?? ""
  };
}

async function attachUpdatedByNames(records: IcuReadOnlyRecord[], supabase: ReturnType<typeof createClient>) {
  const staffIds = Array.from(new Set(records.map((record) => record.updated_by_staff_profile_id).filter(Boolean)));

  if (staffIds.length === 0) {
    return records;
  }

  const { data, error } = await supabase.from("staff_profiles").select("id, display_name").in("id", staffIds);

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("ICU snapshot updater names unavailable", {
        code: error.code,
        message: error.message
      });
    }
    return records;
  }

  const namesById = new Map((data ?? []).map((staff) => [staff.id, staff.display_name]));

  return records.map((record) => ({
    ...record,
    updated_by_name: record.updated_by_staff_profile_id ? namesById.get(record.updated_by_staff_profile_id) ?? null : null
  }));
}

export function latestIcuSnapshotRecord(records: IcuReadOnlyRecord[]) {
  return records
    .filter((record) => record.is_active)
    .sort(
      (left, right) =>
        new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime()
    )[0];
}

export function formatIcuSnapshotDateTime(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).format(new Date(value));
}

export function useIcuPatients(departmentId: string) {
  const [records, setRecords] = useState<IcuReadOnlyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRecords = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("icu_patients")
      .select(icuPatientSelect)
      .eq("department_id", departmentId)
      .eq("is_active", true)
      .order("bed", { ascending: true });

    if (loadError) {
      logIcuLoadError("icu_patients.active_read", departmentId, loadError);

      if (isMissingOptionalIcuColumn(loadError)) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("icu_patients")
          .select(baseIcuPatientSelect)
          .eq("department_id", departmentId)
          .eq("is_active", true)
          .order("bed", { ascending: true });

        setLoading(false);

        if (!fallbackError) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("ICU snapshot loaded with legacy column fallback. Apply the latest ICU migrations to restore full lifecycle fields.", {
              departmentId
            });
          }
          const fallbackRecords = ((fallbackData ?? []) as Partial<IcuPatientRecord>[]).map(normalizeIcuRecord);
          setRecords(await attachUpdatedByNames(fallbackRecords, supabase));
          return;
        }

        logIcuLoadError("icu_patients.active_read_fallback", departmentId, fallbackError);
      } else {
        setLoading(false);
      }

      setRecords([]);
      setError("Could not load ICU snapshot.");
      return;
    }

    setLoading(false);
    const normalizedRecords = ((data ?? []) as Partial<IcuPatientRecord>[]).map(normalizeIcuRecord);
    setRecords(await attachUpdatedByNames(normalizedRecords, supabase));
  }, [departmentId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadRecords();
    });
  }, [loadRecords]);

  useEffect(() => {
    let refreshTimer: number | undefined;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void loadRecords(false);
      }, 200);
    };
    const interval = window.setInterval(refresh, 60_000);
    const supabase = createClient();
    const channel = supabase
      .channel(`icu-readonly-${departmentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "icu_patients",
          filter: `department_id=eq.${departmentId}`
        },
        refresh
      )
      .subscribe();

    return () => {
      window.clearTimeout(refreshTimer);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [departmentId, loadRecords]);

  return { records, loading, error, reload: loadRecords };
}

export function IcuReadOnlyPage({
  departmentId,
  title = "ICU Snapshot",
  subtitle = "View ICU respiratory devices and settings.",
  backHref = "/",
  backLabel = "Back",
  timezone = "America/Los_Angeles"
}: IcuReadOnlyProps) {
  const { records, loading, error, reload } = useIcuPatients(departmentId);
  const counts = useMemo(() => getIcuSnapshotCounts(records), [records]);
  const {
    update: officialVent,
    loading: officialVentLoading,
    error: officialVentError
  } = useOfficialVentCount(departmentId, timezone);

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
            <IcuSnapshotCard label="Vents" value={officialVent?.vent_count ?? "—"} />
            <IcuSnapshotCard label="HFNC" value={counts.hfnc} />
            <IcuSnapshotCard label="BiPAP" value={counts.bipap} />
            <IcuSnapshotCard label="Critical Vents" value={counts.criticalVents} />
          </div>
          <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-center text-xs font-bold leading-5 text-slate-500">
            {officialVent ? (
              <>
                <p>
                  Vents source: {officialVentSourceLabel(officialVent.source)} {"\u00b7"}{" "}
                  {formatShiftStatusTime(officialVent.created_at, timezone)}
                </p>
                <p>Vents updated by: {officialVent.updated_by_name ?? "Unknown"}</p>
              </>
            ) : (
              <p className="text-rose-700">
                {officialVentLoading
                  ? "Loading official vent count..."
                  : officialVentError || "No official vent update for this shift."}
              </p>
            )}
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
