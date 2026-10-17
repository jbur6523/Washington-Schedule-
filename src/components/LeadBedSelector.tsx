"use client";

import { useState } from "react";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";

const areas = ["C Pod", "D Pod", "E Pod", "IMC A", "IMC B", "ED", "OR", "Other"] as const;
type Area = typeof areas[number];
const starts: Partial<Record<Area, number>> = { "C Pod": 220, "D Pod": 230, "E Pod": 240, "IMC A": 200, "IMC B": 210 };
const fieldClass = "mt-1 min-h-11 w-full rounded-2xl border-2 border-slate-500 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-200";

function areaForBed(bed: string): Area | "" {
  if (!bed) return "";
  if (/^C22\d$/.test(bed)) return "C Pod";
  if (/^D23\d$/.test(bed)) return "D Pod";
  if (/^E24\d$/.test(bed)) return "E Pod";
  if (/^IMC - 20\d$/.test(bed)) return "IMC A";
  if (/^IMC - 21\d$/.test(bed)) return "IMC B";
  if (/^ED \d+$/.test(bed)) return "ED";
  if (/^OR \d+$/.test(bed)) return "OR";
  return "Other";
}

export function LeadBedSelector({ bed, onChange, records, editingId }: {
  bed: string;
  onChange: (bed: string) => void;
  records: IcuPatientRecord[];
  editingId?: string;
}) {
  const [area, setArea] = useState<Area | "">(() => areaForBed(bed));
  const start = area ? starts[area] : undefined;
  const numbered = area === "ED" || area === "OR";
  return <>
    <label className="block">
      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Select bed</span>
      <select required className={fieldClass} value={area} onChange={event => { setArea(event.target.value as Area | ""); onChange(""); }}>
        <option value="">Select area</option>
        {areas.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    {area && <label className="block">
      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{area === "Other" ? "Location" : "Bed"}</span>
      {start !== undefined ? <select required className={fieldClass} value={bed} onChange={event => onChange(event.target.value)}>
        <option value="">Select room</option>
        {Array.from({ length: 10 }, (_, index) => {
          const room = start + index;
          const value = area.startsWith("IMC") ? `IMC - ${room}` : `${area[0]}${room}`;
          const occupied = records.some(record => record.is_active && record.id !== editingId && record.bed === value);
          return <option key={value} value={value} disabled={occupied}>{room}{occupied ? " - Occupied" : ""}</option>;
        })}
      </select> : <input required className={fieldClass} inputMode={numbered ? "numeric" : "text"}
        maxLength={numbered ? 17 : 20} pattern={numbered ? "[0-9]+" : undefined}
        placeholder={numbered ? "Enter room number" : "Enter location"}
        value={numbered ? bed.replace(/^(ED|OR) /, "") : bed}
        onChange={event => onChange(numbered && event.target.value ? `${area} ${event.target.value}` : event.target.value)} />}
    </label>}
  </>;
}
