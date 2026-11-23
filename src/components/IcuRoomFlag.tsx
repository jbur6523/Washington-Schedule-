"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import type { SaveRoundingAction } from "@/lib/icu-command-center/rounding";

type Props = { record: IcuPatientRecord; saving: boolean; onSave: SaveRoundingAction };

function FlagNoteEditor({ record, saving, onSave, onClose }: Props & { onClose: () => void }) {
  const [note, setNote] = useState(record.rounding_data?.flag?.note ?? "");
  const [version] = useState(record.updated_at);
  return <form aria-label={`Room flag for ${record.bed}`} className="mt-2 space-y-2 rounded-xl border border-rose-200 bg-white p-2"
    onSubmit={async event => { event.preventDefault(); if (!saving && await onSave("flag", { active: true, note: note.trim() }, version)) onClose(); }}>
    <label className="block text-xs font-bold">Flag note (optional)
      <input maxLength={200} value={note} onChange={event => setNote(event.target.value)} disabled={saving} placeholder="Difficult Airway, Impending Intubation" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm" />
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-rose-700 px-2 text-xs font-bold text-white disabled:opacity-50">Save note</button>
      <button type="button" disabled={saving} onClick={async () => { if (await onSave("flag", { active: false, note: "" }, version)) onClose(); }} className="min-h-10 rounded-lg border border-rose-200 px-2 text-xs font-bold text-rose-800">Remove flag</button>
      <button type="button" disabled={saving} onClick={onClose} className="min-h-10 px-2 text-xs font-bold">Close</button>
    </div>
  </form>;
}

export function IcuRoomFlag({ record, saving, onSave, roomClass }: Props & { roomClass: string }) {
  const [editing, setEditing] = useState(false);
  const flagged = Boolean(record.rounding_data?.flag?.active);
  return <>
    <div className="flex items-center gap-1">
      <p className={`min-w-0 break-words text-3xl font-black uppercase tracking-wide ${flagged ? "text-red-700" : roomClass}`}>{record.bed}</p>
      <button type="button" aria-label={`Room flag for ${record.bed}`} aria-pressed={flagged} aria-expanded={editing} disabled={saving}
        title={flagged ? record.rounding_data?.flag?.note || "Room flagged" : "Flag this room"}
        onClick={async () => { if (flagged) setEditing(!editing); else if (await onSave("flag", { active: true, note: "" }, record.updated_at)) setEditing(true); }}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">
        <Flag size={16} aria-hidden="true" fill={flagged ? "currentColor" : "none"} className={flagged ? "" : "opacity-35"} />
      </button>
    </div>
    {flagged && record.rounding_data?.flag?.note && <p className="mt-1 break-words text-xs font-bold text-red-700">{record.rounding_data.flag.note}</p>}
    {editing && <FlagNoteEditor record={record} saving={saving} onSave={onSave} onClose={() => setEditing(false)} />}
  </>;
}
