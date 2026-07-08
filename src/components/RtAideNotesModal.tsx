"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, MessageSquareText, Send, X } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

const maxNoteLength = 500;
const rtAideNoteColumns =
  "id, department_id, note_text, priority, status, created_by_staff_profile_id, created_by_name, acknowledged_at, acknowledged_by_staff_profile_id, acknowledged_by_name, response_text, responded_at, responded_by_staff_profile_id, responded_by_name, closed_at, closed_by_staff_profile_id, closed_by_name, created_at, updated_at";

type RtAideNoteStatus = "new" | "acknowledged" | "responded" | "closed";
type RtAideNotePriority = "normal" | "urgent";

type RtAideNoteRow = {
  id: string;
  department_id: string;
  note_text: string;
  priority: RtAideNotePriority;
  status: RtAideNoteStatus;
  created_by_staff_profile_id: string | null;
  created_by_name: string | null;
  acknowledged_at: string | null;
  acknowledged_by_staff_profile_id: string | null;
  acknowledged_by_name: string | null;
  response_text: string | null;
  responded_at: string | null;
  responded_by_staff_profile_id: string | null;
  responded_by_name: string | null;
  closed_at: string | null;
  closed_by_staff_profile_id: string | null;
  closed_by_name: string | null;
  created_at: string;
  updated_at: string;
};

type StaffOption = {
  id: string;
  display_name: string;
};

type RtAideNotesModalProps = {
  authContext: AuthenticatedUserContext;
  open: boolean;
  onClose: () => void;
  onNotesChanged?: () => void;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function statusLabel(status: RtAideNoteStatus) {
  if (status === "new") return "New";
  if (status === "acknowledged") return "Acknowledged";
  if (status === "responded") return "Responded";
  return "Closed";
}

function statusClass(status: RtAideNoteStatus) {
  if (status === "new") {
    return "bg-pink-50 text-pink-700 border-pink-100";
  }

  if (status === "acknowledged") {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }

  if (status === "responded") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }

  return "bg-slate-100 text-slate-600 border-slate-200";
}

export function RtAideNotesModal({ authContext, open, onClose, onNotesChanged }: RtAideNotesModalProps) {
  const [notes, setNotes] = useState<RtAideNoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [priority, setPriority] = useState<RtAideNotePriority>("normal");
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [addedByStaffProfileId, setAddedByStaffProfileId] = useState("");
  const [manualAddedByName, setManualAddedByName] = useState("");
  const [useManualAddedBy, setUseManualAddedBy] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [expandedResponseNoteId, setExpandedResponseNoteId] = useState<string | null>(null);
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canCreateNotes =
    authContext.role === "admin" || authContext.role === "lead" || authContext.operationsRole === "command_center";
  const canResolveNotes = authContext.role === "admin" || authContext.operationsRole === "aide";
  const hasNoteText = noteText.trim().length > 0;
  const selectedAddedBy = useMemo(
    () => staffOptions.find((staff) => staff.id === addedByStaffProfileId) ?? null,
    [addedByStaffProfileId, staffOptions]
  );
  const addedByName = useManualAddedBy ? manualAddedByName.trim() : selectedAddedBy?.display_name ?? "";
  const canSendNewNote = canCreateNotes && hasNoteText && Boolean(authContext.staffProfileId) && addedByName.length > 0;

  const activeNotes = useMemo(() => notes.filter((note) => note.status !== "closed"), [notes]);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("rt_aide_notes")
      .select(rtAideNoteColumns)
      .eq("department_id", authContext.departmentId)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(50);

    if (loadError) {
      setNotes([]);
      setError("Unable to load RT Aide Notes.");
      setLoading(false);
      return;
    }

    setNotes((data ?? []) as RtAideNoteRow[]);
    setLoading(false);
  }, [authContext.departmentId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    queueMicrotask(() => {
      void loadNotes();
    });
  }, [loadNotes, open]);

  useEffect(() => {
    if (!open || !canCreateNotes) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      const { data, error: optionsError } = await supabase
        .from("staff_profiles")
        .select("id, display_name")
        .eq("department_id", authContext.departmentId)
        .eq("is_active", true)
        .in("assigned_role", ["admin", "lead"])
        .eq("operations_role", "none")
        .order("display_name", { ascending: true });

      if (optionsError) {
        setStaffOptions([]);
        return;
      }

      const options = (data ?? []) as StaffOption[];
      setStaffOptions(options);
      setAddedByStaffProfileId((current) => {
        if (current && options.some((staff) => staff.id === current)) {
          return current;
        }

        if (authContext.staffProfileId && options.some((staff) => staff.id === authContext.staffProfileId)) {
          return authContext.staffProfileId;
        }

        return "";
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authContext.departmentId, authContext.staffProfileId, canCreateNotes, open]);

  const notifyChanged = () => {
    onNotesChanged?.();
  };

  const sendNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSendNewNote || !authContext.staffProfileId) {
      setError("Select who added this note before sending.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: insertError } = await supabase.from("rt_aide_notes").insert({
      department_id: authContext.departmentId,
      note_text: noteText.trim(),
      priority,
      status: "new",
      created_by_staff_profile_id: authContext.staffProfileId,
      created_by_name: addedByName
    });

    setSaving(false);

    if (insertError) {
      setError("Unable to send note.");
      return;
    }

    setNoteText("");
    setPriority("normal");
    setManualAddedByName("");
    setUseManualAddedBy(false);
    if (authContext.staffProfileId && staffOptions.some((staff) => staff.id === authContext.staffProfileId)) {
      setAddedByStaffProfileId(authContext.staffProfileId);
    }
    setMessage("Note sent to RT Aides.");
    await loadNotes();
    notifyChanged();
  };

  const acknowledgeNote = async (note: RtAideNoteRow) => {
    if (!canResolveNotes || !authContext.staffProfileId || note.status !== "new") {
      return;
    }

    setBusyNoteId(note.id);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("rt_aide_notes")
      .update({
        status: "acknowledged",
        acknowledged_at: new Date().toISOString(),
        acknowledged_by_staff_profile_id: authContext.staffProfileId,
        acknowledged_by_name: authContext.displayName
      })
      .eq("id", note.id)
      .eq("department_id", authContext.departmentId)
      .eq("status", "new");

    setBusyNoteId(null);

    if (updateError) {
      setError("Unable to acknowledge note.");
      return;
    }

    setMessage("Note acknowledged.");
    await loadNotes();
    notifyChanged();
  };

  const sendResponse = async (note: RtAideNoteRow) => {
    if (!canResolveNotes || !authContext.staffProfileId) {
      return;
    }

    const responseText = (responseDrafts[note.id] ?? "").trim();
    if (!responseText) {
      return;
    }

    setBusyNoteId(note.id);
    setError("");
    setMessage("");

    const now = new Date().toISOString();
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("rt_aide_notes")
      .update({
        status: "responded",
        response_text: responseText,
        responded_at: now,
        responded_by_staff_profile_id: authContext.staffProfileId,
        responded_by_name: authContext.displayName,
        acknowledged_at: note.acknowledged_at ?? now,
        acknowledged_by_staff_profile_id: note.acknowledged_by_staff_profile_id ?? authContext.staffProfileId,
        acknowledged_by_name: note.acknowledged_by_name ?? authContext.displayName
      })
      .eq("id", note.id)
      .eq("department_id", authContext.departmentId)
      .neq("status", "closed");

    setBusyNoteId(null);

    if (updateError) {
      setError("Unable to send response.");
      return;
    }

    setResponseDrafts((current) => ({ ...current, [note.id]: "" }));
    setExpandedResponseNoteId((current) => (current === note.id ? null : current));
    setMessage("Note sent.");
    await loadNotes();
    notifyChanged();
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-4 py-4 sm:items-center">
      <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
              <MessageSquareText size={22} />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Shared Notes</p>
              <h2 className="text-2xl font-black text-hospital-ink">RT Aide Notes</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">Leave notes or questions for RT Aides.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600"
            aria-label="Close RT Aide Notes"
          >
            <X size={18} />
          </button>
        </div>

        {canCreateNotes && (
          <form onSubmit={sendNote} className="mt-5 rounded-3xl border border-cyan-100 bg-cyan-50/50 p-4">
            <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500" htmlFor="rt-aide-note">
              Note
            </label>
            <textarea
              id="rt-aide-note"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value.slice(0, maxNoteLength))}
              placeholder="Example: Please order HMEs."
              maxLength={maxNoteLength}
              className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
              <span>No patient information.</span>
              <span>{noteText.length}/{maxNoteLength}</span>
            </div>

            <div className="mt-4">
              <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500" htmlFor="rt-aide-added-by">
                Added by
              </label>
              {useManualAddedBy ? (
                <div className="mt-2 space-y-2">
                  <input
                    id="rt-aide-added-by"
                    value={manualAddedByName}
                    onChange={(event) => setManualAddedByName(event.target.value.slice(0, 80))}
                    placeholder="Enter name"
                    className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setUseManualAddedBy(false);
                      setManualAddedByName("");
                    }}
                    className="text-sm font-extrabold text-cyan-700 underline decoration-cyan-200 underline-offset-4"
                  >
                    Choose from lead list
                  </button>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <select
                    id="rt-aide-added-by"
                    value={addedByStaffProfileId}
                    onChange={(event) => setAddedByStaffProfileId(event.target.value)}
                    className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  >
                    <option value="">Select lead adding note</option>
                    {staffOptions.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.display_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setUseManualAddedBy(true);
                      setAddedByStaffProfileId("");
                    }}
                    className="text-sm font-extrabold text-cyan-700 underline decoration-cyan-200 underline-offset-4"
                  >
                    Not listed? Type name manually
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["normal", "urgent"] as RtAideNotePriority[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPriority(option)}
                  className={`min-h-11 rounded-2xl border px-3 text-sm font-extrabold capitalize ${
                    priority === option
                      ? "border-cyan-200 bg-cyan-700 text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={!canSendNewNote || saving}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={16} />
              {saving ? "Sending..." : "Send Note"}
            </button>
          </form>
        )}

        {message && (
          <p role="status" className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-black text-hospital-ink">Recent Notes</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-600">
              {activeNotes.length}
            </span>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-500">
              Loading RT Aide Notes...
            </div>
          ) : activeNotes.length === 0 ? (
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-500">
              No RT Aide notes right now.
            </div>
          ) : (
            activeNotes.map((note) => {
              const responseDraft = responseDrafts[note.id] ?? "";
              const canAcknowledge = canResolveNotes && note.status === "new";
              const canSendResponse = canResolveNotes && responseDraft.trim().length > 0 && busyNoteId !== note.id;

              return (
                <article key={note.id} className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-md shadow-slate-900/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusClass(note.status)}`}>
                        {statusLabel(note.status)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
                          note.priority === "urgent" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {note.priority === "urgent" ? "Urgent" : "Normal"}
                      </span>
                    </div>
                    <span className="text-right text-xs font-bold text-slate-400">{formatDateTime(note.created_at)}</span>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold leading-6 text-hospital-ink">
                    {note.note_text}
                  </p>
                  <p className="mt-3 text-xs font-bold text-slate-500">
                    Created by: {note.created_by_name ?? "Unknown"}
                  </p>

                  {note.response_text && (
                    <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">
                        Note from {note.responded_by_name ?? "Aide"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-emerald-950">
                        {note.response_text}
                      </p>
                      <p className="mt-2 text-xs font-bold text-emerald-700">
                        {formatDateTime(note.responded_at)}
                      </p>
                    </div>
                  )}

                  {note.acknowledged_at && (
                    <div className="mt-3 border-t border-slate-100 pt-3 text-emerald-800">
                      <div className="flex items-center gap-2 text-sm font-extrabold">
                        <CheckCircle2 size={17} />
                        <span>Acknowledged by {note.acknowledged_by_name ?? "Unknown"}</span>
                      </div>
                      <p className="mt-1 pl-7 text-xs font-bold text-emerald-700">{formatDateTime(note.acknowledged_at)}</p>
                    </div>
                  )}

                  {canResolveNotes && (
                    <div className="mt-4 space-y-3">
                      {canAcknowledge && (
                        <button
                          type="button"
                          onClick={() => void acknowledgeNote(note)}
                          disabled={busyNoteId === note.id}
                          className="inline-flex min-h-11 w-auto items-center justify-start gap-2 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-3.5 text-left text-sm font-black text-emerald-800 shadow-sm transition duration-150 active:scale-[0.98] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="h-5 w-5 shrink-0 rounded-md border-2 border-emerald-500 bg-white" />
                          {busyNoteId === note.id ? "Acknowledging..." : "Acknowledge"}
                        </button>
                      )}

                      {expandedResponseNoteId === note.id ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500" htmlFor={`rt-aide-response-${note.id}`}>
                            Add Note
                          </label>
                          <textarea
                            id={`rt-aide-response-${note.id}`}
                            value={responseDraft}
                            onChange={(event) =>
                              setResponseDrafts((current) => ({
                                ...current,
                                [note.id]: event.target.value.slice(0, maxNoteLength)
                              }))
                            }
                            placeholder="Add optional note..."
                            maxLength={maxNoteLength}
                            className="mt-2 min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                          />
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                            <span>No patient information.</span>
                            <span>{responseDraft.length}/{maxNoteLength}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedResponseNoteId(null);
                                setResponseDrafts((current) => ({ ...current, [note.id]: "" }));
                              }}
                              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 transition duration-150 active:scale-[0.98]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void sendResponse(note)}
                              disabled={!canSendResponse}
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20 transition duration-150 active:scale-[0.98] active:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busyNoteId === note.id ? "Sending..." : "Send Note"}
                            </button>
                          </div>
                        </div>
                      ) : !note.response_text ? (
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedResponseNoteId(note.id);
                            setResponseDrafts((current) => ({ ...current, [note.id]: current[note.id] ?? "" }));
                          }}
                          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-pink-100 bg-pink-50 px-4 text-sm font-black text-pink-700 transition duration-150 active:scale-[0.98]"
                        >
                          + Add Note
                        </button>
                      ) : null}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
