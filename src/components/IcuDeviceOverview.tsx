import { Activity, AirVent, Cloud, TriangleAlert, Waves, Wind } from "lucide-react";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import { getIcuSnapshotCounts } from "@/lib/icu-command-center/utils";
import { compareIcuBeds } from "@/lib/icu-command-center/rooms";

export function IcuDeviceOverview({ records, lastUpdated }: { records: IcuPatientRecord[]; lastUpdated: string }) {
  const active = records.filter(record => record.is_active).sort((a, b) => compareIcuBeds(a.bed, b.bed));
  const counts = getIcuSnapshotCounts(active);
  return (
    <div className="mt-4 rounded-3xl border-2 border-sky-300 bg-gradient-to-br from-cyan-50 to-sky-50 px-3 py-5 sm:px-5">
      <p className="text-center text-sm font-extrabold uppercase tracking-wide text-slate-600">Total Vents</p>
      <p className="mt-1 text-center text-5xl font-black tabular-nums text-hospital-ink">{counts.vents}</p>
      <div aria-hidden="true" className="my-4 flex items-center text-sky-300"><span className="h-px flex-1 bg-sky-200" /><Activity size={28} /><span className="h-px flex-1 bg-sky-200" /></div>
      <dl className="grid grid-cols-3 gap-x-2 gap-y-5 text-center">
        {[
          { label: "Vents", value: counts.vents - counts.criticalVents, Icon: Wind, critical: false, rooms: active.filter(record => record.device_type === "vent" && !record.is_critical_vent) },
          { label: "Critical", value: counts.criticalVents, Icon: TriangleAlert, critical: true, rooms: active.filter(record => record.device_type === "vent" && record.is_critical_vent) },
          { label: "BiPAP", value: counts.bipap, Icon: AirVent, critical: false, rooms: active.filter(record => record.device_type === "bipap") },
          { label: "HFNC", value: counts.hfnc, Icon: Waves, critical: false, rooms: active.filter(record => record.device_type === "hfnc") },
          { label: "Cool Aerosol", value: active.filter(record => record.device_type === "cool_aerosol").length, Icon: Cloud, critical: false, rooms: active.filter(record => record.device_type === "cool_aerosol") }
        ].map(({ label, value, Icon, critical, rooms }) => <div key={label} className="min-w-0">
          <div aria-hidden="true" className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full sm:h-12 sm:w-12 ${critical ? "bg-rose-100 text-rose-800" : "bg-sky-100 text-sky-800"}`}><Icon size={24} /></div>
          <dt className="text-xs font-bold text-slate-600 sm:text-sm">{label}</dt>
          <dd className={`mt-1 text-3xl font-black tabular-nums ${critical ? "text-rose-800" : "text-hospital-ink"}`}>{value}</dd>
          <dd aria-label={`${label} rooms`} className="mt-2 grid grid-cols-3 gap-x-0.5 gap-y-1 text-[10px] sm:text-xs font-bold leading-5 text-slate-700">
            {rooms.length ? rooms.map(record => <span key={record.id} className="min-w-0 break-words">{record.bed}</span>) : <span className="col-span-3 text-slate-400">—</span>}
          </dd>
        </div>)}
      </dl>
      <p className="mt-4 border-t border-sky-200 pt-3 text-center text-xs font-bold text-slate-600">Last updated: {lastUpdated}</p>
    </div>
  );
}
