"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, Bed, Plus, RefreshCw, Save, Trash2, Wind } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { IcuDeviceType, IcuPatientRecord, IcuVentMode } from "@/lib/icu-command-center/types";
import {
  airwayLocationOptions,
  airwaySizeOptions,
  formatIcuAirway,
  formatIcuDeviceSummary,
  formatIcuLastUpdated,
  formatIcuSettings,
  getIcuSnapshotCounts,
  icuAirwayLocationLabels,
  icuBedOptions,
  icuDeviceLabels,
  icuVentModeLabels,
  ventModeOptions
} from "@/lib/icu-command-center/utils";
import { createClient } from "@/lib/supabase/client";

type IcuCommandCenterClientProps = {
  authContext: AuthenticatedUserContext;
};

type IcuPatientForm = {
  bed: string;
  device_type: IcuDeviceType | "";
  airway_size: string;
  airway_at: string;
  airway_location: string;
  vent_mode: IcuVentMode | "";
  rate: string;
  tidal_volume: string;
  peep: string;
  fio2: string;
  ps: string;
  t_high: string;
  t_low: string;
  p_high: string;
  p_low: string;
  percent_min_vol: string;
  ipap: string;
  epap: string;
  cpap: string;
  flow: string;
  is_critical_vent: boolean;
};

const emptyForm: IcuPatientForm = {
  bed: "",
  device_type: "",
  airway_size: "",
  airway_at: "",
  airway_location: "",
  vent_mode: "",
  rate: "",
  tidal_volume: "",
  peep: "",
  fio2: "",
  ps: "",
  t_high: "",
  t_low: "",
  p_high: "",
  p_low: "",
  percent_min_vol: "",
  ipap: "",
  epap: "",
  cpap: "",
  flow: "",
  is_critical_vent: false
};

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

function numericOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function formFromRecord(record: IcuPatientRecord): IcuPatientForm {
  return {
    bed: record.bed,
    device_type: record.device_type,
    airway_size: record.airway_size ?? "",
    airway_at: record.airway_at ?? "",
    airway_location: record.airway_location ?? "",
    vent_mode: record.vent_mode ?? "",
    rate: record.rate?.toString() ?? "",
    tidal_volume: record.tidal_volume?.toString() ?? "",
    peep: record.peep?.toString() ?? "",
    fio2: record.fio2?.toString() ?? "",
    ps: record.ps?.toString() ?? "",
    t_high: record.t_high?.toString() ?? "",
    t_low: record.t_low?.toString() ?? "",
    p_high: record.p_high?.toString() ?? "",
    p_low: record.p_low?.toString() ?? "",
    percent_min_vol: record.percent_min_vol?.toString() ?? "",
    ipap: record.ipap?.toString() ?? "",
    epap: record.epap?.toString() ?? "",
    cpap: record.cpap?.toString() ?? "",
    flow: record.flow?.toString() ?? "",
    is_critical_vent: record.is_critical_vent
  };
}

function cleanPayload(form: IcuPatientForm, authContext: AuthenticatedUserContext) {
  const deviceType = form.device_type;

  return {
    department_id: authContext.departmentId,
    bed: form.bed,
    device_type: deviceType,
    airway_size: deviceType === "vent" ? form.airway_size || null : null,
    airway_at: deviceType === "vent" ? form.airway_at.trim() || null : null,
    airway_location: deviceType === "vent" ? form.airway_location || null : null,
    vent_mode: deviceType === "vent" ? form.vent_mode || null : null,
    rate: deviceType === "vent" || deviceType === "bipap" ? numericOrNull(form.rate) : null,
    tidal_volume: deviceType === "vent" ? numericOrNull(form.tidal_volume) : null,
    peep: deviceType === "vent" ? numericOrNull(form.peep) : null,
    fio2: deviceType === "vent" || deviceType === "bipap" || deviceType === "hfnc" ? numericOrNull(form.fio2) : null,
    ps: deviceType === "vent" ? numericOrNull(form.ps) : null,
    t_high: deviceType === "vent" ? numericOrNull(form.t_high) : null,
    t_low: deviceType === "vent" ? numericOrNull(form.t_low) : null,
    p_high: deviceType === "vent" ? numericOrNull(form.p_high) : null,
    p_low: deviceType === "vent" ? numericOrNull(form.p_low) : null,
    percent_min_vol: deviceType === "vent" ? numericOrNull(form.percent_min_vol) : null,
    ipap: deviceType === "bipap" ? numericOrNull(form.ipap) : null,
    epap: deviceType === "bipap" ? numericOrNull(form.epap) : null,
    cpap: deviceType === "cpap" ? numericOrNull(form.cpap) : null,
    flow: deviceType === "hfnc" ? numericOrNull(form.flow) : null,
    is_critical_vent: deviceType === "vent" ? form.is_critical_vent : false,
    updated_by_staff_profile_id: authContext.staffProfileId
  };
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/80 px-3 py-3 text-center shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-cyan-700">{label}</p>
      <p className="mt-1 text-3xl font-black leading-none text-hospital-ink">{value}</p>
    </div>
  );
}

function IcuNumberInput({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
      />
    </label>
  );
}

function IcuPatientCard({
  record,
  onEdit,
  onDiscontinue
}: {
  record: IcuPatientRecord;
  onEdit: () => void;
  onDiscontinue: () => void;
}) {
  const airway = formatIcuAirway(record);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      className="cursor-pointer rounded-3xl border border-white bg-white/95 p-4 text-left shadow-soft active:scale-[0.99]"
    >
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

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          className="min-h-11 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDiscontinue();
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 text-sm font-black text-rose-700"
        >
          <Trash2 size={16} />
          Remove
        </button>
      </div>
    </article>
  );
}

export function IcuCommandCenterClient({ authContext }: IcuCommandCenterClientProps) {
  const [records, setRecords] = useState<IcuPatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<IcuPatientRecord | null>(null);
  const [form, setForm] = useState<IcuPatientForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const counts = useMemo(() => getIcuSnapshotCounts(records), [records]);
  const recentlyUpdated = useMemo(
    () => [...records].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 3),
    [records]
  );

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("icu_patients")
      .select(icuPatientSelect)
      .eq("department_id", authContext.departmentId)
      .eq("is_active", true)
      .order("bed", { ascending: true });

    setLoading(false);

    if (loadError) {
      setRecords([]);
      setError("Could not load ICU Command Center.");
      return;
    }

    setRecords((data ?? []) as unknown as IcuPatientRecord[]);
  }, [authContext.departmentId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadRecords();
    });
  }, [loadRecords]);

  const openAdd = () => {
    setEditingRecord(null);
    setForm(emptyForm);
    setFormOpen(true);
    setMessage("");
    setError("");
  };

  const openEdit = (record: IcuPatientRecord) => {
    setEditingRecord(record);
    setForm(formFromRecord(record));
    setFormOpen(true);
    setMessage("");
    setError("");
  };

  const savePatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!form.bed || !form.device_type) {
      setError("Bed and device are required.");
      return;
    }

    if (form.device_type === "vent" && !form.vent_mode) {
      setError("Vent Mode is required for Vent patients.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = cleanPayload(form, authContext);
    const result = editingRecord
      ? await supabase
          .from("icu_patients")
          .update(payload)
          .eq("id", editingRecord.id)
          .eq("department_id", authContext.departmentId)
      : await supabase.from("icu_patients").insert({
          ...payload,
          created_by_staff_profile_id: authContext.staffProfileId
        });

    setSaving(false);

    if (result.error) {
      setError(
        result.error.code === "23505"
          ? "That ICU bed already has an active record."
          : "Unable to save ICU patient."
      );
      return;
    }

    setFormOpen(false);
    setEditingRecord(null);
    setForm(emptyForm);
    setMessage(editingRecord ? "ICU patient updated." : "ICU patient added.");
    await loadRecords();
  };

  const discontinuePatient = async (record: IcuPatientRecord) => {
    const confirmed = window.confirm(`Remove ${record.bed} from active ICU tracking?`);
    if (!confirmed) {
      return;
    }

    setMessage("");
    setError("");
    const supabase = createClient();
    const { error: removeError } = await supabase
      .from("icu_patients")
      .update({
        is_active: false,
        updated_by_staff_profile_id: authContext.staffProfileId
      })
      .eq("id", record.id)
      .eq("department_id", authContext.departmentId);

    if (removeError) {
      setError("Unable to remove ICU patient.");
      return;
    }

    setMessage(`${record.bed} removed from active ICU tracking.`);
    await loadRecords();
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
          <h1 className="mt-2 text-3xl font-black text-hospital-ink">ICU Command Center</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Track ICU respiratory devices and settings.</p>
          <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">
            Use bed/room only. Do not enter patient names, MRNs, DOBs, diagnoses, or clinical notes.
          </p>
        </section>

        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">ICU Snapshot</p>
              <h2 className="mt-1 text-xl font-black text-hospital-ink">Active Devices</h2>
            </div>
            <button
              type="button"
              onClick={() => void loadRecords()}
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <StatCard label="Vents" value={counts.vents} />
            <StatCard label="HFNC" value={counts.hfnc} />
            <StatCard label="BiPAP" value={counts.bipap} />
            <StatCard label="Critical Vents" value={counts.criticalVents} />
          </div>
        </section>

        <button
          type="button"
          onClick={openAdd}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-base font-black text-white shadow-md shadow-cyan-900/20"
        >
          <Plus size={18} />
          Add Patient
        </button>

        {message && (
          <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Bed size={18} className="text-cyan-700" />
            <h2 className="text-2xl font-black text-hospital-ink">Active ICU Patients</h2>
          </div>
          {loading && (
            <p className="rounded-3xl border border-slate-100 bg-white/95 px-4 py-5 text-center text-sm font-bold text-slate-500 shadow-soft">
              Loading ICU patients...
            </p>
          )}
          {!loading && records.length === 0 && (
            <p className="rounded-3xl border border-slate-100 bg-white/95 px-4 py-5 text-center text-sm font-bold text-slate-500 shadow-soft">
              No active ICU respiratory devices.
            </p>
          )}
          {!loading &&
            records.map((record) => (
              <IcuPatientCard
                key={record.id}
                record={record}
                onEdit={() => openEdit(record)}
                onDiscontinue={() => void discontinuePatient(record)}
              />
            ))}
        </section>

        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <Wind size={18} className="text-cyan-700" />
            <h2 className="text-xl font-black text-hospital-ink">Recently Updated</h2>
          </div>
          <div className="mt-3 space-y-2">
            {recentlyUpdated.length === 0 ? (
              <p className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                Updates will appear here after ICU entries are saved.
              </p>
            ) : (
              recentlyUpdated.map((record) => (
                <div key={record.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-sm font-black text-hospital-ink">
                    {record.bed} - {formatIcuDeviceSummary(record)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">Updated {formatIcuLastUpdated(record.updated_at)}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <Link
          href="/"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
        >
          Back to Schedule
        </Link>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="icu-form-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white bg-white p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">ICU Command Center</p>
                <h2 id="icu-form-title" className="mt-1 text-2xl font-black text-hospital-ink">
                  {editingRecord ? "Edit Patient" : "Add Patient"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
              >
                Close
              </button>
            </div>

            <form onSubmit={savePatient} className="mt-4 space-y-4">
              <div className="grid gap-3">
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Bed</span>
                  <select
                    value={form.bed}
                    onChange={(event) => setForm({ ...form, bed: event.target.value })}
                    required
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  >
                    <option value="">Select bed</option>
                    {icuBedOptions.map((bedOption) => (
                      <option key={bedOption} value={bedOption}>
                        {bedOption}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Device</span>
                  <select
                    value={form.device_type}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        device_type: event.target.value as IcuDeviceType | "",
                        is_critical_vent: event.target.value === "vent" ? form.is_critical_vent : false
                      })
                    }
                    required
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  >
                    <option value="">Select device</option>
                    {(["vent", "bipap", "cpap", "hfnc"] as IcuDeviceType[]).map((device) => (
                      <option key={device} value={device}>
                        {icuDeviceLabels[device]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {form.device_type === "vent" && (
                <>
                  <section className="rounded-3xl border border-cyan-100 bg-cyan-50/60 p-3">
                    <h3 className="text-sm font-black text-hospital-ink">Airway</h3>
                    <div className="mt-3 grid gap-3">
                      <label className="block">
                        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Airway size</span>
                        <select
                          value={form.airway_size}
                          onChange={(event) => setForm({ ...form, airway_size: event.target.value })}
                          className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                        >
                          <option value="">Select size</option>
                          {airwaySizeOptions.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </label>
                      <IcuNumberInput
                        label="At"
                        value={form.airway_at}
                        onChange={(value) => setForm({ ...form, airway_at: value })}
                        placeholder="Example: 23"
                      />
                      <label className="block">
                        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Location</span>
                        <select
                          value={form.airway_location}
                          onChange={(event) => setForm({ ...form, airway_location: event.target.value })}
                          className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                        >
                          <option value="">Select location</option>
                          {airwayLocationOptions.map((location) => (
                            <option key={location} value={location}>
                              {icuAirwayLocationLabels[location]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-3">
                    <h3 className="text-sm font-black text-hospital-ink">Vent Settings</h3>
                    <label className="mt-3 block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Vent Mode</span>
                      <select
                        value={form.vent_mode}
                        onChange={(event) => setForm({ ...form, vent_mode: event.target.value as IcuVentMode | "" })}
                        required
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                      >
                        <option value="">Select mode</option>
                        {ventModeOptions.map((mode) => (
                          <option key={mode} value={mode}>
                            {icuVentModeLabels[mode]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {["apvcmv", "scmv", "pcmv"].includes(form.vent_mode) && (
                        <>
                          <IcuNumberInput label="Rate" value={form.rate} onChange={(value) => setForm({ ...form, rate: value })} />
                          <IcuNumberInput label="Tidal Volume" value={form.tidal_volume} onChange={(value) => setForm({ ...form, tidal_volume: value })} />
                          <IcuNumberInput label="PEEP" value={form.peep} onChange={(value) => setForm({ ...form, peep: value })} />
                          <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                        </>
                      )}
                      {form.vent_mode === "spont" && (
                        <>
                          <IcuNumberInput label="PS" value={form.ps} onChange={(value) => setForm({ ...form, ps: value })} />
                          <IcuNumberInput label="PEEP" value={form.peep} onChange={(value) => setForm({ ...form, peep: value })} />
                          <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                        </>
                      )}
                      {form.vent_mode === "aprv" && (
                        <>
                          <IcuNumberInput label="Rate" value={form.rate} onChange={(value) => setForm({ ...form, rate: value })} />
                          <IcuNumberInput label="T-High" value={form.t_high} onChange={(value) => setForm({ ...form, t_high: value })} />
                          <IcuNumberInput label="T-Low" value={form.t_low} onChange={(value) => setForm({ ...form, t_low: value })} />
                          <IcuNumberInput label="P-High" value={form.p_high} onChange={(value) => setForm({ ...form, p_high: value })} />
                          <IcuNumberInput label="P-Low" value={form.p_low} onChange={(value) => setForm({ ...form, p_low: value })} />
                          <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                        </>
                      )}
                      {form.vent_mode === "asv" && (
                        <>
                          <IcuNumberInput label="% Min Vol" value={form.percent_min_vol} onChange={(value) => setForm({ ...form, percent_min_vol: value })} />
                          <IcuNumberInput label="PEEP" value={form.peep} onChange={(value) => setForm({ ...form, peep: value })} />
                          <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                        </>
                      )}
                    </div>
                    <label className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-100 bg-white px-3 py-3 text-sm font-black text-hospital-ink">
                      <input
                        type="checkbox"
                        checked={form.is_critical_vent}
                        onChange={(event) => setForm({ ...form, is_critical_vent: event.target.checked })}
                        className="h-5 w-5 accent-rose-600"
                      />
                      Critical Vent
                    </label>
                  </section>
                </>
              )}

              {form.device_type === "bipap" && (
                <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-3">
                  <h3 className="text-sm font-black text-hospital-ink">BiPAP Settings</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <IcuNumberInput label="Rate" value={form.rate} onChange={(value) => setForm({ ...form, rate: value })} />
                    <IcuNumberInput label="IPAP" value={form.ipap} onChange={(value) => setForm({ ...form, ipap: value })} />
                    <IcuNumberInput label="EPAP" value={form.epap} onChange={(value) => setForm({ ...form, epap: value })} />
                    <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                  </div>
                </section>
              )}

              {form.device_type === "cpap" && (
                <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-3">
                  <h3 className="text-sm font-black text-hospital-ink">CPAP Settings</h3>
                  <div className="mt-3">
                    <IcuNumberInput label="CPAP" value={form.cpap} onChange={(value) => setForm({ ...form, cpap: value })} />
                  </div>
                </section>
              )}

              {form.device_type === "hfnc" && (
                <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-3">
                  <h3 className="text-sm font-black text-hospital-ink">HFNC Settings</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <IcuNumberInput label="FiO2" value={form.fio2} onChange={(value) => setForm({ ...form, fio2: value })} />
                    <IcuNumberInput label="Flow" value={form.flow} onChange={(value) => setForm({ ...form, flow: value })} />
                  </div>
                </section>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} />
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
