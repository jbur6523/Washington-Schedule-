"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, FileText, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { canCreateLeadCommunication } from "@/lib/auth/access";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { formatShiftStatusTime } from "@/lib/shift-status/utils";

type LeadPreview = { id: string; note_text: string; created_by_name: string | null; updated_at: string; priority: string };

// Read-only previews share the full boards' department and active-record filters.
// Polling covers reconnects; realtime updates keep an open dashboard current.
function useBoardPreview<T>(departmentId: string, table: "lead_communication_notes" | "rt_aide_notes", revision = 0, enabled = true) {
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

export function LeadNotePreview({ authContext, timezone, onOpen, onOpenAide, newCount, revision }: {
  authContext: AuthenticatedUserContext; timezone: string; onOpen: () => void; onOpenAide: () => void; newCount: number; revision: number;
}) {
  const [activeTab, setActiveTab] = useState<"lead" | "aide">("lead");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  return <section aria-label="Communication Boards" className={`${boardPanelClass} flex flex-col`}>
    <div role="tablist" aria-label="Communication boards" className="mb-4 flex border-b border-slate-200">
      {(["lead", "aide"] as const).map((tab, index) => {
        const Icon = tab === "lead" ? FileText : Users;
        return <button key={tab} ref={(element) => { tabs.current[index] = element; }} type="button" role="tab"
          id={`${id}-${tab}-tab`} aria-controls={`${id}-${tab}-panel`} aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1}
          onClick={() => setActiveTab(tab)}
          onKeyDown={(event) => {
            let next: number;
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") next = 1 - index;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = 1;
            else return;
            event.preventDefault();
            setActiveTab(next === 0 ? "lead" : "aide");
            tabs.current[next]?.focus();
          }}
          className={`flex min-h-11 flex-1 flex-wrap items-center justify-center gap-2 border-b-2 px-2 pb-2 text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${activeTab === tab ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:bg-slate-50"}`}>
          <Icon size={20} aria-hidden="true" />{tab === "lead" ? "Lead Note" : "Aide Board"}
          {tab === "lead" && newCount > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">{newCount} new</span>}
        </button>;
      })}
    </div>
    {(["lead", "aide"] as const).map(tab => <div key={tab} role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}-tab`} hidden={activeTab !== tab} tabIndex={0} className={activeTab === tab ? "flex flex-1 flex-col" : undefined}>
      {activeTab === tab && <BoardNoteContent authContext={authContext} timezone={timezone} onOpen={tab === "lead" ? onOpen : onOpenAide} revision={revision} board={tab} />}
    </div>)}
  </section>;
}

function BoardNoteContent({ authContext, timezone, onOpen, revision, board }: {
  authContext: AuthenticatedUserContext; timezone: string; onOpen: () => void; revision: number; board: "lead" | "aide";
}) {
  const isLead = board === "lead";
  const { rows, loading, error } = useBoardPreview<LeadPreview>(authContext.departmentId, isLead ? "lead_communication_notes" : "rt_aide_notes", revision);
  const note = rows[0];
  const canCreate = isLead ? canCreateLeadCommunication(authContext) : authContext.role === "admin" || authContext.role === "lead" || authContext.operationsRole === "command_center";
  const label = isLead ? "lead" : "aide";
  return <>
    <div className={`min-h-28 flex-1 rounded-lg p-4 text-sm leading-6 ${note?.priority === "urgent" ? "bg-rose-50 text-rose-900" : isLead ? "bg-blue-50/70 text-slate-700" : "bg-purple-50 text-slate-700"}`}>
      {note?.priority === "urgent" && <p className="mb-1 text-xs font-bold">Urgent</p>}
      <p className="line-clamp-4 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{loading ? `Loading ${label} note…` : error ? `${isLead ? "Lead" : "Aide"} note unavailable.` : note?.note_text ?? `No current ${label} notes.`}</p>
    </div>
    {note && <p className="mt-3 text-xs text-slate-500">Updated {formatShiftStatusTime(note.updated_at, timezone)}{note.created_by_name ? ` · ${note.created_by_name}` : ""}</p>}
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      {canCreate && <button type="button" onClick={onOpen} className={boardTextActionClass}><Plus size={14} aria-hidden="true" />Add note</button>}
      <button type="button" onClick={onOpen} aria-label={`View All ${isLead ? "Lead" : "Aide"} Communication Board notes`} className={boardTextActionClass}>View All <ArrowRight size={14} aria-hidden="true" /></button>
    </div>
  </>;
}
