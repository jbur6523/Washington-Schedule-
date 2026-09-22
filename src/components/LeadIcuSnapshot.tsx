"use client";

import { BarChart3, Plus } from "lucide-react";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import { formatIcuAirway, formatIcuDeviceSummary, formatIcuSettings, supportsIcuStandby } from "@/lib/icu-command-center/utils";
import { activeVentModifierLabels, ventCardTone } from "@/lib/icu-command-center/vent-status";
import { compareIcuBeds, icuRoomGroup, icuRoomGroups } from "@/lib/icu-command-center/rooms";

export function LeadIcuSnapshot({ records, loading, error, message, busy, onAdd, onDiscontinue }: {
  records: IcuPatientRecord[]; loading: boolean; error: string; message: string; busy: boolean;
  onAdd: () => void; onDiscontinue: (record: IcuPatientRecord) => void;
}) {
  return <section aria-labelledby="lead-icu-heading" className="border-t border-slate-200 pt-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="lead-icu-heading" className="flex items-center gap-2 text-xl font-bold text-hospital-ink"><BarChart3 size={23} className="text-blue-600" aria-hidden="true" />ICU Snapshot</h2><p className="mt-1 text-sm text-slate-600">Active respiratory support by unit. Manage devices directly from here.</p></div>
      <button type="button" onClick={onAdd} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"><Plus size={18} aria-hidden="true" />Add Device</button>
    </div>
    {message && <p role="status" className="mb-3 text-sm font-semibold text-emerald-800">{message}</p>}
    {error && <p role="alert" className="mb-3 text-sm font-semibold text-rose-700">{error}</p>}
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      {icuRoomGroups.map(group => {
        const active = records.filter(record => record.is_active && icuRoomGroup(record.bed) === group.id).sort((a, b) => compareIcuBeds(a.bed, b.bed));
        return <section key={group.id} aria-labelledby={`lead-icu-${group.id}`} className="min-w-0 overflow-hidden rounded-lg border border-slate-200">
          <h3 id={`lead-icu-${group.id}`} className="bg-blue-50 px-3 py-3 font-bold text-hospital-ink">{group.label}<span className="ml-2 text-sm font-medium text-slate-600">({active.length} active {active.length === 1 ? "room" : "rooms"})</span></h3>
          <div className="overflow-x-auto"><table aria-label={`${group.label} active devices`} className="block w-full text-left text-sm sm:table sm:min-w-[460px]">
            <thead className="hidden sm:table-header-group bg-slate-50 text-xs text-slate-600"><tr>{["Room Number", "Device (Settings)", "Status", "Action"].map(label => <th key={label} scope="col" className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead>
            <tbody className="block sm:table-row-group divide-y divide-slate-100">
              {active.map(record => {
                const statuses = record.device_type === "vent" ? [...(record.is_critical_vent ? ["Critical"] : []), ...activeVentModifierLabels(record)] : supportsIcuStandby(record.device_type) && record.is_standby ? ["Standby"] : [];
                const tone = ventCardTone(record);
                const statusClass = tone === "critical" ? "bg-rose-50 text-rose-800" : tone === "standby" || record.is_standby ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-blue-800";
                return <tr key={record.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:table-row">
                  <th scope="row" className="col-span-2 px-3 pb-1 pt-3 sm:py-3 align-top font-semibold text-slate-800">{record.bed}</th>
                  <td className="col-start-1 row-start-2 min-w-0 px-3 py-2 align-top text-slate-700 sm:py-3"><p className="font-semibold">{formatIcuDeviceSummary(record)}</p>{formatIcuAirway(record) && <p className="text-xs">{formatIcuAirway(record)}</p>}<p className="mt-1 leading-5">{formatIcuSettings(record)}</p>{record.notes?.trim() && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">Note: {record.notes}</p>}</td>
                  <td className="col-start-1 row-start-3 px-3 pb-3 align-top sm:py-3"><div className="flex flex-wrap gap-1">{statuses.length ? statuses.map(status => <span key={status} className={`rounded px-2 py-1 text-xs font-semibold ${statusClass}`}>{status}</span>) : <span className="text-slate-400">—</span>}</div></td>
                  <td className="col-start-2 row-start-2 row-span-2 px-3 py-2 align-top sm:py-3"><button type="button" disabled={busy} onClick={() => onDiscontinue(record)} aria-label={`Discontinue ${record.bed}`} className="min-h-11 rounded-md border border-rose-200 px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Discontinue</button></td>
                </tr>;
              })}
              {!active.length && <tr className="block sm:table-row"><td colSpan={4} className="px-3 py-5 text-center text-slate-500">{loading ? "Loading devices…" : error ? "Device list unavailable." : "No active respiratory devices."}</td></tr>}
            </tbody>
          </table></div>
        </section>;
      })}
    </div>
  </section>;
}
