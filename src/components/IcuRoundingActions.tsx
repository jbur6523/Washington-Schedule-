"use client";

import { useState } from "react";
import { Activity, AlertTriangle, Check, ClipboardList, Pause, Stethoscope } from "lucide-react";
import { supportsIcuStandby } from "@/lib/icu-command-center/utils";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import { activeSbt, hasVentModality, treatmentOptions, treatmentFrequencies, sbtFailureReasons, type SaveRoundingAction } from "@/lib/icu-command-center/rounding";

export function IcuRoundingActions({ record, saving, onSave, onToggleStandby, onExtubate }: { record: IcuPatientRecord; saving: boolean; onSave: SaveRoundingAction; onToggleStandby?: () => void; onExtubate?: () => void }) {
  const [panel, setPanel] = useState<"sbt" | "critical" | "procedure" | "treatment" | null>(null);
  const [editingVersion, setEditingVersion] = useState(record.updated_at);
  const [result, setResult] = useState("");
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [flolan, setFlolan] = useState(false);
  const [proned, setProned] = useState(false);
  const [criticalOther, setCriticalOther] = useState(false);
  const [treatment, setTreatment] = useState("");
  const [frequency, setFrequency] = useState("");
  const hasVent = hasVentModality(record);
  const [procedure, setProcedure] = useState("");
  const [trachType, setTrachType] = useState("");
  const [size, setSize] = useState("");
  const [xlt, setXlt] = useState(false);
  const [date, setDate] = useState("");
  const active = activeSbt(record);
  const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-hospital-ink";
  const choiceClass = "flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold";
  const needsOther = (panel === "sbt" && result === "Fail" && reason === "Other") || (panel === "critical" && criticalOther) || (panel === "procedure" && procedure === "Other");
  const valid = (panel !== "critical" || hasVent) && (panel !== "treatment" || Boolean(treatment && frequency)) && (!needsOther || Boolean(other.trim())) && (panel === "sbt" ? result === "Pass" || (result === "Fail" && Boolean(reason)) : panel === "procedure" ? Boolean(procedure) && (procedure !== "Trach" || Boolean(trachType && size)) : true);

  return <div className="mt-3">
    <div className="flex flex-wrap gap-2" aria-label={`Quick actions for ${record.bed}`}>
      {([
        ["sbt", "SBT", Activity, active], ["treatment", "Treatment", Stethoscope, Boolean(record.rounding_data?.treatment)], ["procedure", "Procedure", ClipboardList, false], ["critical", "Critical Vent", AlertTriangle, record.is_critical_vent]
      ] as const).filter(([key]) => (key !== "critical" || hasVent) && (key !== "sbt" || record.device_type === "vent")).map(([key, label, Icon, highlighted]) => <button key={key} type="button"
        disabled={saving || (key === "sbt" && record.device_type !== "vent")}
        title={key === "sbt" && record.device_type !== "vent" ? "SBT applies to ventilated patients" : undefined}
        aria-expanded={panel === key} aria-pressed={key === "procedure" ? undefined : highlighted}
        onClick={() => {
          setEditingVersion(record.updated_at);
          setTreatment(record.rounding_data?.treatment?.name ?? ""); setFrequency(record.rounding_data?.treatment?.frequency ?? "");
          setPanel(panel === key ? null : key); setResult(""); setReason(""); setProcedure(""); setTrachType(""); setSize(""); setXlt(false); setDate("");
          setFlolan(record.is_flolan); setProned(record.is_prone); setCriticalOther(Boolean(record.rounding_data?.criticalOther));
          setOther(key === "critical" ? record.rounding_data?.criticalOther ?? "" : "");
        }}
        className={`inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 text-[10px] sm:flex-row sm:gap-1.5 sm:px-2 sm:text-xs font-extrabold shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:shadow-none print:bg-white print:text-black print:border-slate-600 ${
          key === "sbt" && record.device_type !== "vent"
            ? "border-slate-300 bg-slate-100 text-slate-500"
            : key === "sbt"
              ? highlighted ? "border-emerald-700 bg-emerald-200 text-emerald-950 ring-1 ring-inset ring-emerald-700" : "border-emerald-600 bg-emerald-100 text-emerald-950 hover:bg-emerald-200"
              : key === "critical"
                ? highlighted ? "border-rose-700 bg-rose-200 text-rose-950 ring-1 ring-inset ring-rose-700" : "border-rose-500 bg-rose-100 text-rose-950 hover:bg-rose-200"
                : "border-sky-600 bg-sky-100 text-sky-950 hover:bg-sky-200"
        }`}>
        {highlighted ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : <Icon size={16} strokeWidth={2.5} aria-hidden="true" />}{label}
      </button>)}
      {onToggleStandby && supportsIcuStandby(record.device_type) && <button type="button" onClick={onToggleStandby} disabled={saving} aria-pressed={record.is_standby}
        className={`inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 text-[10px] sm:flex-row sm:gap-1.5 sm:px-2 sm:text-xs font-extrabold shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60 print:bg-white print:text-black print:border-slate-600 ${record.is_standby ? "border-amber-700 bg-amber-200 text-amber-950 ring-1 ring-inset ring-amber-700" : "border-amber-600 bg-amber-50 text-amber-950 hover:bg-amber-100"}`}>
        <Pause size={16} strokeWidth={2.5} aria-hidden="true" />{record.is_standby ? "Off Standby" : "Standby"}
      </button>}
      {onExtubate && record.device_type === "vent" && <button type="button" onClick={onExtubate} disabled={saving}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-teal-600 bg-teal-50 px-2 text-[10px] font-extrabold text-teal-950 hover:bg-teal-100 disabled:opacity-60 sm:text-xs">
        Extubate
      </button>}
    </div>
    {panel && (panel !== "critical" || hasVent) && (panel !== "sbt" || record.device_type === "vent") && <form aria-label={`${panel === "sbt" ? "SBT" : panel === "critical" ? "Critical" : panel === "treatment" ? "Treatment" : "Procedure"} for ${record.bed}`} className="mt-2 space-y-3 rounded-2xl border border-cyan-100 bg-slate-50 p-3"
      onSubmit={async event => {
        event.preventDefault(); if (!valid || saving) return;
        const payload = panel === "sbt" ? { result, reason, other } : panel === "critical" ? { flolan, proned, other: criticalOther ? other : "" } : panel === "treatment" ? { name: treatment, frequency } : { name: procedure, other, trachType, size, xlt, date };
        if (await onSave(panel, payload, editingVersion)) setPanel(null);
      }}>
      <p className="text-sm font-black text-hospital-ink">{panel === "sbt" ? "Document SBT" : panel === "critical" ? "Critical status" : panel === "treatment" ? "Record treatment" : "Record procedure"}</p>
      {panel === "sbt" && <>
        {active && <p className="text-xs text-emerald-800">SBT is active on Pressure Support. No repeat Pass is needed.</p>}
        <div className="grid grid-cols-2 gap-2">{["Pass", "Fail"].map(value => <label key={value} className={choiceClass}><input type="radio" name={`sbt-${record.id}`} value={value} checked={result === value} onChange={() => setResult(value)} disabled={saving || (active && value === "Pass")} />{value}</label>)}</div>
        {result === "Fail" && <label className="block text-xs font-bold">Failure reason<select required value={reason} onChange={e => setReason(e.target.value)} disabled={saving} className={inputClass}><option value="">Select reason</option>{sbtFailureReasons.map(value => <option key={value}>{value}</option>)}</select></label>}
      </>}
      {panel === "critical" && <div className="grid gap-2 sm:grid-cols-3">{[
        { label: "Flolan", value: flolan, set: setFlolan }, { label: "Proned", value: proned, set: setProned }, { label: "Other", value: criticalOther, set: setCriticalOther }
      ].map(option => <label key={option.label} className={choiceClass}><input type="checkbox" checked={option.value} onChange={e => option.set(e.target.checked)} disabled={saving} />{option.label}</label>)}</div>}
      {panel === "procedure" && <>
        <label className="block text-xs font-bold">Procedure<select required value={procedure} onChange={e => setProcedure(e.target.value)} disabled={saving} className={inputClass}><option value="">Select procedure</option>{["Bronch", "CT", "MRI", "Trach", "Other"].map(value => <option key={value} disabled={value === "Trach" && record.device_type !== "vent"}>{value}</option>)}</select></label>
        {procedure === "Trach" && <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold">Type<select required value={trachType} onChange={e => setTrachType(e.target.value)} disabled={saving} className={inputClass}><option value="">Select type</option>{["Shiley", "Portex", "Other"].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-bold">Size<select required value={size} onChange={e => setSize(e.target.value)} disabled={saving} className={inputClass}><option value="">Select size</option>{[4,5,6,7,8].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className={choiceClass}><input type="checkbox" checked={xlt} onChange={e => setXlt(e.target.checked)} disabled={saving} />XLT</label>
          <label className="min-w-0 text-xs font-bold">Date (optional)<input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={saving} className={`${inputClass} min-w-0`} /></label>
        </div>}
      </>}
      {panel === "treatment" && <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-bold">Treatment<select required value={treatment} onChange={e => setTreatment(e.target.value)} disabled={saving} className={inputClass}><option value="">Select treatment</option>{treatmentOptions.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="block text-xs font-bold">Frequency<select required value={frequency} onChange={e => setFrequency(e.target.value)} disabled={saving} className={inputClass}><option value="">Select frequency</option>{treatmentFrequencies.map(value => <option key={value}>{value}</option>)}</select></label>
      </div>}
      {needsOther && <label className="block text-xs font-bold">{panel === "procedure" ? "Procedure description" : "Other reason"}<input required maxLength={200} value={other} onChange={e => setOther(e.target.value)} disabled={saving} className={inputClass} /></label>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || !valid} className="min-h-11 rounded-xl bg-cyan-700 px-4 text-xs font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        <button type="button" disabled={saving} onClick={() => setPanel(null)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">Cancel</button>
        {panel === "critical" && record.is_critical_vent && <button type="button" disabled={saving} onClick={async () => { if (await onSave("critical", { flolan: false, proned: false, other: "" }, editingVersion)) setPanel(null); }} className="min-h-11 rounded-xl px-3 text-xs font-bold text-rose-700">Turn Critical off</button>}
      </div>
    </form>}
  </div>;
}
