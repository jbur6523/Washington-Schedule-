"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { canCreateLeadCommunication } from "@/lib/auth/access";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { formatShiftStatusTime } from "@/lib/shift-status/utils";

type LeadPreview = { id: string; note_text: string; created_by_name: string | null; updated_at: string; priority: string };

// Read-only previews share the full boards' department and active-record filters.
// Polling covers reconnects; realtime updates keep an open dashboard current.
function useBoardPreview<T>(departmentId: string, table: "lead_communication_notes", revision = 0, enabled = true) {
  const [state, setState] = useState<{ rows: T[]; loading: boolean; error: boolean }>({ rows: [], loading: true, error: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let request = 0;
    const supabase = createClient();
    const load = async () => {
      const currentRequest = ++request;
      try {
        const query = supabase.from(table).select("id, note_text, created_by_name, updated_at, priority").eq("department_id", departmentId).neq("status", "closed").order("created_at", { ascending: false }).limit(1);
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
