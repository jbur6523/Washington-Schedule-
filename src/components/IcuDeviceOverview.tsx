import { AirVent, Cloud, Cylinder, TriangleAlert, Waves, Wind } from "lucide-react";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import { filterDashboardPatients, type DashboardDevice } from "@/lib/icu-command-center/dashboard";
import { compareIcuBeds } from "@/lib/icu-command-center/rooms";
const categories = [
  { label: "Vents", filter: "Noncritical Vent", Icon: Wind },
  { label: "Critical", filter: "Critical", Icon: TriangleAlert },
  { label: "BiPAP", filter: "BiPAP", Icon: AirVent },
  { label: "HFNC", filter: "HFNC", Icon: Waves },
  { label: "Cool Aerosol", filter: "Cool Aerosol", Icon: Cloud },
  { label: "Oxygen Device", filter: "Oxygen Device", Icon: Cylinder }
] as const;
export function IcuDeviceOverview({ records, lastUpdated, onFilter, selected }: {
  records: IcuPatientRecord[]; lastUpdated: string; onFilter?: (device: DashboardDevice) => void; selected?: DashboardDevice;
}) {
  return <section aria-label="ICU Snapshot" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-black text-hospital-ink">ICU Snapshot <span className="text-sm font-medium text-slate-500">/ Active Devices</span></h2>
      <p className="text-xs text-slate-500">Last updated: {lastUpdated}</p>
    </div>
    <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3">
      {categories.map(({ label, filter, Icon }) => {
        const rooms = filterDashboardPatients(records, "All", filter).sort((a,b) => compareIcuBeds(a.bed,b.bed));
        const critical = filter === "Critical";
        return <button type="button" key={filter} onClick={() => onFilter?.(filter)} aria-pressed={selected === filter}
          aria-label={`Filter ${label}: ${rooms.length}`} className={`min-w-0 rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${selected === filter ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200"} ${critical ? "bg-rose-50 text-rose-900" : "bg-teal-50/60 text-hospital-ink"}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">{label}</span><Icon size={20} aria-hidden="true" className={critical ? "text-rose-700" : "text-teal-700"} /></div>
          <p className="mt-1 text-3xl font-black tabular-nums">{rooms.length}</p>
          <div aria-label={`${label} rooms`} className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium leading-5 text-slate-600">{rooms.length ? rooms.map(record => <span key={record.id}>{record.bed}</span>) : "—"}</div>
        </button>;
      })}
    </div>
  </section>;
}
