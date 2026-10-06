"use client";

import { useState } from "react";
import { Activity, AlertTriangle, ClipboardList } from "lucide-react";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import { activeSbt, sbtFailureReasons, type SaveRoundingAction } from "@/lib/icu-command-center/rounding";

export function IcuRoundingActions({ record, saving, onSave }: { record: IcuPatientRecord; saving: boolean; onSave: SaveRoundingAction }) {
  const [panel, setPanel] = useState<"sbt" | "critical" | "procedure" | null>(null);
  const [editingVersion, setEditingVersion] = useState(record.updated_at);
  const [result, setResult] = useState("");
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [flolan, setFlolan] = useState(false);
  const [proned, setProned] = useState(false);
  const [criticalOther, setCriticalOther] = useState(false);
  const [procedure, setProcedure] = useState("");
  const [trachType, setTrachType] = useState("");
  const [size, setSize] = useState("");
  const [xlt, setXlt] = useState(false);
  const [date, setDate] = useState("");
  const active = activeSbt(record);
  const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-hospital-ink";
  const choiceClass = "flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold";
  const needsOther = (panel === "sbt" && result === "Fail" && reason === "Other") || (panel === "critical" && criticalOther) || (panel === "procedure" && procedure === "Other");
  const valid = (!needsOther || Boolean(other.trim())) && (panel === "sbt" ? result === "Pass" || (result === "Fail" && Boolean(reason)) : panel === "procedure" ? Boolean(procedure) && (procedure !== "Trach" || Boolean(trachType && size)) : true);

  return <div className="mt-3">
    <div className="grid grid-cols-3 gap-2" aria-label={`Quick actions for ${record.bed}`}>
      {([
        ["sbt", "SBT", Activity, active], ["critical", "Critical", AlertTriangle, record.is_critical_vent], ["procedure", "Procedure", ClipboardList, false]
      ] as const).map(([key, label, Icon, highlighted]) => <button key={key} type="button"
        disabled={saving || (key === "sbt" && record.device_type !== "vent")}
        title={key === "sbt" && record.device_type !== "vent" ? "SBT applies to ventilated patients" : undefined}
        aria-expanded={panel === key} aria-pressed={key === "procedure" ? undefined : highlighted}
        onClick={() => {
          setEditingVersion(record.updated_at);
          setPanel(panel === key ? null : key); setResult(""); setReason(""); setProcedure(""); setTrachType(""); setSize(""); setXlt(false); setDate("");
          setFlolan(record.is_flolan); setProned(record.is_prone); setCriticalOther(Boolean(record.rounding_data?.criticalOther));
          setOther(key === "critical" ? record.rounding_data?.criticalOther ?? "" : "");
        }}
        className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-bold disabled:opacity-50 ${highlighted ? key === "critical" ? "border-rose-300 bg-rose-100 text-rose-800" : "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-white text-slate-700"}`}>
        <Icon size={16} aria-hidden="true" />{label}
      </button>)}
    </div>
    {panel && <form aria-label={`${panel === "sbt" ? "SBT" : panel === "critical" ? "Critical" : "Procedure"} for ${record.bed}`} className="mt-2 space-y-3 rounded-2xl border border-cyan-100 bg-slate-50 p-3"
      onSubmit={async event => {
        event.preventDefault(); if (!valid || saving) return;
        const payload = panel === "sbt" ? { result, reason, other } : panel === "critical" ? { flolan, proned, other: criticalOther ? other : "" } : { name: procedure, other, trachType, size, xlt, date };
        if (await onSave(panel, payload, editingVersion)) setPanel(null);
      }}>
      <p className="text-sm font-black text-hospital-ink">{panel === "sbt" ? "Document SBT" : panel === "critical" ? "Critical status" : "Record procedure"}</p>
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
      {needsOther && <label className="block text-xs font-bold">{panel === "procedure" ? "Procedure description" : "Other reason"}<input required maxLength={200} value={other} onChange={e => setOther(e.target.value)} disabled={saving} className={inputClass} /></label>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || !valid} className="min-h-11 rounded-xl bg-cyan-700 px-4 text-xs font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        <button type="button" disabled={saving} onClick={() => setPanel(null)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">Cancel</button>
        {panel === "critical" && record.is_critical_vent && <button type="button" disabled={saving} onClick={async () => { if (await onSave("critical", { flolan: false, proned: false, other: "" }, editingVersion)) setPanel(null); }} className="min-h-11 rounded-xl px-3 text-xs font-bold text-rose-700">Turn Critical off</button>}
      </div>
    </form>}
  </div>;
}
