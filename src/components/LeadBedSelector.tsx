"use client";

import { Bed, Check, LayoutGrid } from "lucide-react";
import { useState } from "react";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import { icuDeviceLabels } from "@/lib/icu-command-center/utils";

const areas = ["C Pod", "D Pod", "E Pod", "IMC A", "IMC B", "ED", "OR", "Other"] as const;
type Area = typeof areas[number];
const starts: Partial<Record<Area, number>> = { "C Pod": 220, "D Pod": 230, "E Pod": 240, "IMC A": 200, "IMC B": 210 };
const fieldClass = "mt-1 min-h-11 w-full rounded-2xl border-2 border-slate-500 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-200";

export function areaForBed(bed: string): Area | "" {
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

export function LeadBedSelector({
  bed,
  onChange,
  records,
  editingId,
  roomOptions,
  variant = "select",
  onAreaChange,
  allowOccupiedSelection = false
}: {
  variant?: "select" | "cards";
  onAreaChange?: (area: string) => void;
  bed: string;
  onChange: (bed: string) => void;
  records: IcuPatientRecord[];
  editingId?: string;
  roomOptions?: readonly string[];
  allowOccupiedSelection?: boolean;
}) {
  const [area, setArea] = useState<Area | "">(() => areaForBed(bed));
  const start = area ? starts[area] : undefined;
  const numbered = area === "ED" || area === "OR";
  const selectOptions = start === undefined
    ? []
    : roomOptions?.filter(option => areaForBed(option) === area) ?? Array.from({ length: 10 }, (_, index) => {
      const room = start + index;
      return area.startsWith("IMC") ? `IMC - ${room}` : `${area[0]}${room}`;
    });
  if (variant === "cards") return <>
    <fieldset className="min-w-0 border-b border-slate-200 pb-5">
      <legend className="mb-3 flex items-center gap-2 text-lg font-black text-hospital-ink"><LayoutGrid size={21} className="text-teal-700" />Select Area</legend>
      <div className="grid grid-cols-4 gap-2">
        {areas.map(value => <button key={value} type="button" aria-pressed={area === value}
          onClick={() => { setArea(value); onAreaChange?.(value); onChange(""); }}
          className={`flex min-h-11 items-center justify-center gap-1 rounded-full border px-1 text-xs font-bold sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${area === value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
          {area === value && <Check size={14} aria-hidden="true" />}{value}
        </button>)}
      </div>
    </fieldset>
    <fieldset className="min-w-0 border-b border-slate-200 pb-5">
      <legend className="mb-3 flex w-full items-center justify-between gap-2 text-lg font-black text-hospital-ink">
        <span className="flex items-center gap-2"><Bed size={21} className="text-teal-700" />Select Room</span>
        {area && <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800">{area} Rooms</span>}
      </legend>
      {!area ? <p className="text-sm text-slate-500">Select an area to see its rooms.</p> : start !== undefined ? <div className="grid grid-cols-3 gap-2 min-[360px]:grid-cols-4">
        {selectOptions.map(value => {
          const room = value.match(/\d+$/)?.[0] ?? value;
          const occupied = records.find(record => record.is_active && record.id !== editingId && record.bed === value);
          // Include the selected existing record in its occupied status.
          const assigned = records.find(record => record.is_active && record.bed === value);
          return <button key={value} type="button" aria-label={`Room ${room} - ${assigned ? icuDeviceLabels[assigned.device_type] : "Available"}`}
            aria-pressed={bed === value} disabled={Boolean(occupied) && !allowOccupiedSelection} onClick={() => onChange(value)}
            className={`relative min-h-20 min-w-0 rounded-2xl border-2 p-2 text-left disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${bed === value ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}>
            <span className="block text-lg font-black text-hospital-ink">{room}</span>
            {bed === value && <Check size={17} className="absolute right-1 top-1 rounded-full bg-teal-700 p-0.5 text-white" aria-hidden="true" />}
            <span className={`mt-1 block break-words rounded-md py-0.5 text-[10px] font-bold leading-tight sm:px-1 sm:text-xs ${assigned ? "bg-sky-50 text-sky-900" : "bg-emerald-50 text-emerald-800"}`}>{assigned ? icuDeviceLabels[assigned.device_type] : "Available"}</span>
          </button>;
        })}
        {selectOptions.length === 0 && <p className="col-span-full text-sm text-slate-500">No configured rooms in this area.</p>}
      </div> : <label className="block text-sm font-bold text-slate-700">{area === "Other" ? "Location" : "Room number"}
        <input required className={fieldClass} inputMode={numbered ? "numeric" : "text"} maxLength={numbered ? 17 : 20} pattern={numbered ? "[0-9]+" : undefined}
          placeholder={numbered ? "Enter room number" : "Enter location"} value={numbered ? bed.replace(/^(ED|OR) /, "") : bed}
          onChange={event => onChange(numbered && event.target.value ? `${area} ${event.target.value}` : event.target.value)} />
      </label>}
    </fieldset>
  </>;
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
        {selectOptions.map(value => {
          const room = value.match(/\d+$/)?.[0] ?? value;
          const occupiedRecord = records.find(record => record.is_active && record.id !== editingId && record.bed === value);
          const unavailable = Boolean(occupiedRecord) && !allowOccupiedSelection;
          const occupiedLabel = occupiedRecord
            ? allowOccupiedSelection ? icuDeviceLabels[occupiedRecord.device_type] : "Occupied"
            : "";
          return <option key={value} value={value} disabled={unavailable}>{room}{occupiedLabel ? ` - ${occupiedLabel}` : ""}</option>;
        })}
      </select> : <input required className={fieldClass} inputMode={numbered ? "numeric" : "text"}
        maxLength={numbered ? 17 : 20} pattern={numbered ? "[0-9]+" : undefined}
        placeholder={numbered ? "Enter room number" : "Enter location"}
        value={numbered ? bed.replace(/^(ED|OR) /, "") : bed}
        onChange={event => onChange(numbered && event.target.value ? `${area} ${event.target.value}` : event.target.value)} />}
    </label>}
  </>;
}
