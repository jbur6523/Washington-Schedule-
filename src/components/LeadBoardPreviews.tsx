"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { canCreateLeadCommunication } from "@/lib/auth/access";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { IcuDeviceType } from "@/lib/icu-command-center/types";
import { icuDeviceLabels } from "@/lib/icu-command-center/utils";
import { formatShiftStatusTime } from "@/lib/shift-status/utils";

type LeadPreview = { id: string; note_text: string; created_by_name: string | null; updated_at: string; priority: string };
type IcuPreview = { id: string; bed: string; device_type: IcuDeviceType; notes: string | null; is_standby: boolean };

// Read-only previews share the full boards' department and active-record filters.
// Polling covers reconnects; realtime updates keep an open dashboard current.
function useBoardPreview<T>(departmentId: string, table: "lead_communication_notes" | "icu_patients", revision = 0, enabled = true) {
  const [state, setState] = useState<{ rows: T[]; loading: boolean; error: boolean }>({ rows: [], loading: true, error: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let request = 0;
    const supabase = createClient();
    const load = async () => {
      const currentRequest = ++request;
      try {
        const query = table === "lead_communication_notes"
          ? supabase.from(table).select("id, note_text, created_by_name, updated_at, priority").eq("department_id", departmentId).neq("status", "closed").order("created_at", { ascending: false }).limit(1)
          : supabase.from(table).select("id, bed, device_type, notes, is_standby").eq("department_id", departmentId).eq("is_active", true).order("bed", { ascending: true }).limit(6);
        const { data, error } = await query;
        if (!cancelled && currentRequest === request) setState({ rows: error ? [] : (data ?? []) as unknown as T[], loading: false, error: Boolean(error) });
      } catch {
        if (!cancelled && currentRequest === request) setState({ rows: [], loading: false, error: true });
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const channel = supabase.channel(`lead-preview:${table}:${departmentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `department_id=eq.${departmentId}` }, () => void load()).subscribe();
    return () => { cancelled = true; window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [departmentId, table, revision, enabled]);
  return state;
}

export const boardTextActionClass = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600";
export const boardPanelClass = "min-w-0 rounded-xl border border-slate-200 bg-white p-5";

export function LeadNotePreview({ authContext, timezone, onOpen, newCount, revision }: {
  authContext: AuthenticatedUserContext; timezone: string; onOpen: () => void; newCount: number; revision: number;
}) {
  const { rows, loading, error } = useBoardPreview<LeadPreview>(authContext.departmentId, "lead_communication_notes", revision);
  const note = rows[0];
  return <section aria-labelledby="lead-note-title" className={`${boardPanelClass} flex flex-col`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 id="lead-note-title" className="flex items-center gap-3 text-lg font-bold text-hospital-ink"><FileText className="text-blue-600" size={24} aria-hidden="true" />Lead Note</h2>
      {newCount > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">{newCount} new</span>}
    </div>
    <div className={`flex-1 rounded-lg p-4 text-sm leading-6 ${note?.priority === "urgent" ? "bg-rose-50 text-rose-900" : "bg-blue-50/70 text-slate-700"}`}>
      {note?.priority === "urgent" && <p className="mb-1 text-xs font-bold">Urgent</p>}
      <p className="line-clamp-4 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{loading ? "Loading lead note…" : error ? "Lead note unavailable." : note?.note_text ?? "No current lead notes."}</p>
    </div>
    {note && <p className="mt-3 text-xs text-slate-500">Updated {formatShiftStatusTime(note.updated_at, timezone)}{note.created_by_name ? ` · ${note.created_by_name}` : ""}</p>}
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      {canCreateLeadCommunication(authContext) && <button type="button" onClick={onOpen} className={boardTextActionClass}><Plus size={14} aria-hidden="true" />Add note</button>}
      <button type="button" onClick={onOpen} aria-label="View All Lead Communication Board notes" className={boardTextActionClass}>View All <ArrowRight size={14} aria-hidden="true" /></button>
    </div>
  </section>;
}

export function IcuSnapshotPreview({ departmentId, enabled = true }: { departmentId: string; enabled?: boolean }) {
  const { rows, loading, error } = useBoardPreview<IcuPreview>(departmentId, "icu_patients", 0, enabled);
  return <section aria-labelledby="icu-preview-heading" className="border-t border-slate-200 pt-4">
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 id="icu-preview-heading" className="text-lg font-bold text-hospital-ink">ICU Snapshot</h2>
      <Link href="/command-center/icu-snapshot" aria-label="View All ICU Snapshot" className={boardTextActionClass}>View All <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
    <table className="w-full table-fixed text-left text-sm">
      <caption className="sr-only">Current ICU respiratory devices and notes, up to six rooms</caption>
      <thead className="bg-slate-100/80 text-xs text-slate-500"><tr><th scope="col" className="w-1/4 px-3 py-2 font-semibold">Room Number</th><th scope="col" className="w-1/4 px-3 py-2 font-semibold">Device</th><th scope="col" className="px-3 py-2 font-semibold">Notes</th></tr></thead>
      <tbody className="divide-y divide-slate-100 text-slate-700">
        {rows.map(row => <tr key={row.id}><td className="px-3 py-2 align-top font-medium">{row.bed}</td><td className="px-3 py-2 align-top">{icuDeviceLabels[row.device_type] ?? row.device_type}{row.is_standby && <span className="block text-xs text-slate-500">Standby</span>}</td><td className="break-words px-3 py-2 [overflow-wrap:anywhere]"><span className="line-clamp-2 whitespace-pre-wrap">{row.notes || "—"}</span></td></tr>)}
        {!rows.length && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">{!enabled ? "ICU Snapshot requires Command Center access." : loading ? "Loading ICU snapshot…" : error ? "ICU snapshot unavailable." : "No active ICU records."}</td></tr>}
      </tbody>
    </table>
  </section>;
}
