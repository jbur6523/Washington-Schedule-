"use client";
import { Activity, Check, ClipboardPlus, Gauge, Snowflake, Stethoscope, Wind, Cylinder, UserPlus } from "lucide-react";
import type { IcuDeviceType } from "@/lib/icu-command-center/types";
import { icuDeviceLabels, isOxygenDevice } from "@/lib/icu-command-center/utils";
import { treatmentOptions, treatmentFrequencies } from "@/lib/icu-command-center/rounding";
const devices = [
  ["vent", "Vent", Activity], ["bipap", "BiPAP", Gauge], ["cpap", "CPAP", Gauge],
  ["hfnc", "HFNC", Wind], ["cool_aerosol", "Cool Aerosol", Snowflake], ["oxygen", "Oxygen Device", Cylinder]
] as const;
export function IcuAddPatientSelections({ device, onDeviceChange, treatment, frequency, onTreatmentChange, onFrequencyChange, area, bed, updating }: {
  device: IcuDeviceType | ""; onDeviceChange: (device: string) => void;
  treatment: string; frequency: string; onTreatmentChange: (value: string) => void; onFrequencyChange: (value: string) => void;
  area: string; bed: string; updating: boolean;
}) {
  const selectedDevice = isOxygenDevice(device) ? "oxygen" : device;
  return <>
    <fieldset className="min-w-0 border-b border-slate-200 pb-5">
      <legend className="mb-3 flex items-center gap-2 text-lg font-black text-hospital-ink"><Stethoscope size={21} className="text-teal-700" />Select Device</legend>
      <div className="grid grid-cols-3 gap-2">
        {devices.map(([value, label, Icon]) => <button type="button" key={value} aria-pressed={selectedDevice === value} onClick={() => onDeviceChange(value)}
          className={`relative flex min-h-20 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 py-3 text-xs font-extrabold sm:text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${selectedDevice === value ? "border-teal-600 bg-teal-50 text-teal-950" : "border-slate-200 bg-slate-50/60 text-slate-700 hover:border-teal-300"}`}>
          <Icon size={26} strokeWidth={1.7} aria-hidden="true" />{label}
          {selectedDevice === value && <Check size={18} className="absolute right-1.5 top-1.5 rounded-full bg-teal-700 p-0.5 text-white" aria-hidden="true" />}
        </button>)}
      </div>
    </fieldset>
    <section aria-labelledby="add-treatment-label">
      <h3 id="add-treatment-label" className="mb-3 flex items-center gap-2 text-lg font-black text-hospital-ink"><ClipboardPlus size={21} className="text-teal-700" />Treatment</h3>
      <select aria-label="Treatment" value={treatment} onChange={event => onTreatmentChange(event.target.value)} className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-base text-slate-700 focus:outline-teal-700">
        <option value="">Select treatment</option>{treatmentOptions.map(value => <option key={value}>{value}</option>)}
      </select>
      {treatment && <label className="mt-3 block text-sm font-bold text-slate-700">Frequency
        <select required value={frequency} onChange={event => onFrequencyChange(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-base focus:outline-teal-700">
          <option value="">Select frequency</option>{treatmentFrequencies.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>}
    </section>
    <div role="status" className="flex items-start gap-2 rounded-2xl bg-teal-50 p-3 text-sm leading-6 text-teal-950">
      <UserPlus size={22} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
      <p>{updating ? "Updating" : "Adding to"} <strong>{area || "selected area"}</strong>{bed && <> · Room <strong>{bed.match(/\d+$/)?.[0] ?? bed}</strong></>}{device && <> · <strong>{icuDeviceLabels[device]}</strong></>}{treatment && <span className="block">{treatment}{frequency ? ` - ${frequency}` : " · select frequency"}</span>}</p>
    </div>
  </>;
}
