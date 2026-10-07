"use client";

import { useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import { formatIcuSettings } from "@/lib/icu-command-center/utils";

export type SaveModality = (modality: "hfnc" | "bipap", settings: Record<string, number | null>, activate: boolean, version: string) => Promise<boolean>;

export function IcuModalityActions({ record, saving, onSave }: { record: IcuPatientRecord; saving: boolean; onSave: SaveModality }) {
  const [panel, setPanel] = useState<"edit" | "switch" | null>(null);
  const [version, setVersion] = useState(record.updated_at);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  if (record.device_type !== "hfnc" && record.device_type !== "bipap") return null;
  const modality = record.device_type === "hfnc" ? "bipap" : "hfnc";
  const label = modality === "hfnc" ? "HFNC" : "BiPAP";
  const profile = record.rounding_data?.modalities?.[modality];
  const fields = modality === "hfnc" ? [["flow", "Flow (L/min)"], ["fio2", "FiO₂ (%)"]] : [["ipap", "IPAP"], ["epap", "EPAP"], ["rate", "Rate"], ["fio2", "FiO₂ (%)"]];
  const buttonClass = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border-2 border-sky-700 bg-white px-3 text-xs font-extrabold text-sky-900 disabled:opacity-50";
  const open = (mode: "edit" | "switch") => {
    setVersion(record.updated_at);
    setDraft(Object.fromEntries(fields.map(([key]) => [key, String(profile?.[key as keyof typeof profile] ?? "")])));
    setError("");
    setPanel(mode);
  };
  return <div className="mt-2 print:hidden">
    <div className="flex flex-wrap items-center gap-2">
      {profile ? <>
        <button type="button" disabled={saving || !!panel} onClick={() => open("switch")} className={buttonClass}><ArrowLeftRight size={15} />Switch to {label}</button>
        <button type="button" disabled={saving || !!panel} onClick={() => open("edit")} className="min-h-10 px-2 text-xs font-bold text-sky-900 underline underline-offset-2">Edit saved {label}</button>
      </> : <button type="button" disabled={saving || !!panel} onClick={() => open("edit")} className={buttonClass}><Plus size={15} />Add additional</button>}
    </div>
    {panel && <form aria-label={`${panel === "switch" ? "Switch to" : "Save additional"} ${label}`} className="mt-2 space-y-3 rounded-2xl border-2 border-sky-600 bg-sky-50 p-3" onSubmit={async event => {
      event.preventDefault();
      setError("");
      const values = Object.fromEntries(fields.map(([key]) => [key, draft[key]?.trim() ? Number(draft[key]) : null]));
      if (await onSave(modality, values, panel === "switch", version)) setPanel(null);
      else setError("Could not save. This patient may have changed; close and reopen to review the latest settings.");
    }}>
      <p className="text-sm font-extrabold text-slate-900">{panel === "switch" ? `Switch to ${label}?` : `${label} settings`}</p>
      {panel === "switch" ? <p className="text-sm font-bold text-slate-800">{formatIcuSettings({ ...profile, device_type: modality } as IcuPatientRecord)}</p> : <>
        <p className="text-xs text-slate-700">Save for later. Current support stays {record.device_type === "hfnc" ? "HFNC" : "BiPAP"}.</p>
        <div className="grid grid-cols-2 gap-3">{fields.map(([key, name]) => <label key={key} className="text-xs font-bold text-slate-800">{name}<input type="number" min="0" max={key === "fio2" ? 100 : undefined} step="any" value={draft[key] ?? ""} disabled={saving} onChange={e => setDraft({ ...draft, [key]: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border-2 border-slate-500 bg-white px-3 text-sm text-slate-900" /></label>)}</div>
      </>}
      {error && <p role="alert" className="text-sm font-bold text-rose-800">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || version !== record.updated_at} className="min-h-11 rounded-xl bg-cyan-700 px-4 text-xs font-extrabold text-white disabled:opacity-50">{saving ? "Saving…" : panel === "switch" ? `Switch to ${label}` : "Save modality"}</button>
        <button type="button" disabled={saving} onClick={() => setPanel(null)} className={buttonClass}>Cancel</button>
      </div>
      {version !== record.updated_at && <p role="alert" className="text-sm text-rose-800">This patient changed. Cancel and reopen to review the latest settings.</p>}
    </form>}
  </div>;
}
