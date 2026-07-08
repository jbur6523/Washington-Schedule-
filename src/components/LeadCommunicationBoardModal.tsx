"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, MessageSquareText, Send, X } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

const maxNoteLength = 500;
const notesPageSize = 10;
const leadNoteColumns =
  "id, department_id, note_text, priority, status, created_by_staff_profile_id, created_by_name, reviewed_at, reviewed_by_staff_profile_id, reviewed_by_name, follow_up_text, followed_up_at, followed_up_by_staff_profile_id, followed_up_by_name, closed_at, closed_by_staff_profile_id, closed_by_name, created_at, updated_at";

type LeadNoteStatus = "new" | "reviewed" | "closed";
type LeadNotePriority = "normal" | "urgent";
type LeadBoardContext = "lead" | "director" | "icu";

type LeadCommunicationNoteRow = {
  id: string;
  department_id: string;
  note_text: string;
  priority: LeadNotePriority;
  status: LeadNoteStatus;
  created_by_staff_profile_id: string | null;
  created_by_name: string | null;
  reviewed_at: string | null;
  reviewed_by_staff_profile_id: string | null;
  reviewed_by_name: string | null;
  follow_up_text: string | null;
  followed_up_at: string | null;
  followed_up_by_staff_profile_id: string | null;
  followed_up_by_name: string | null;
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

type LeadCommunicationBoardModalProps = {
  authContext: AuthenticatedUserContext;
  open: boolean;
  onClose: () => void;
  onNotesChanged?: () => void;
  context: LeadBoardContext;
};

export async function fetchLeadCommunicationNewCount(departmentId: string) {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("lead_communication_notes")
    .select("id", { count: "exact", head: true })
    .eq("department_id", departmentId)
    .eq("status", "new");

  if (error) {
    return 0;
  }

  return count ?? 0;
}

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

function statusLabel(status: LeadNoteStatus) {
  if (status === "new") return "New";
  if (status === "reviewed") return "Reviewed";
  return "Closed";
}

function statusClass(status: LeadNoteStatus) {
  if (status === "new") {
    return "bg-sky-50 text-sky-700 border-sky-100";
  }

  if (status === "reviewed") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }

  return "bg-slate-100 text-slate-600 border-slate-200";
}

function priorityCardClass(priority: LeadNotePriority) {
  if (priority === "urgent") {
    return "border-red-300 bg-red-100/80 shadow-red-900/5";
  }

  return "border-blue-200 bg-blue-50 shadow-blue-900/5";
}

function priorityChipClass(priority: LeadNotePriority) {
  if (priority === "urgent") {
    return "border border-red-300 bg-red-200 text-red-900";
  }

  return "border border-blue-200 bg-blue-100 text-blue-800";
}

function contextSubtitle(context: LeadBoardContext) {
  if (context === "director") {
    return "Share notes or updates for RT leads.";
  }

  if (context === "icu") {
    return "Send ICU updates for RT leads.";
  }

  return "Shared notes for RT leads.";
}

export function LeadCommunicationBoardModal({
  authContext,
  open,
  onClose,
  onNotesChanged,
  context
}: LeadCommunicationBoardModalProps) {
  const [notes, setNotes] = useState<LeadCommunicationNoteRow[]>([]);
  const [visibleNoteCount, setVisibleNoteCount] = useState(notesPageSize);
  const [activeNoteCount, setActiveNoteCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [priority, setPriority] = useState<LeadNotePriority>("normal");
  const [leadOptions, setLeadOptions] = useState<StaffOption[]>([]);
  const [addedByStaffProfileId, setAddedByStaffProfileId] = useState("");
  const [manualAddedByName, setManualAddedByName] = useState("");
  const [useManualAddedBy, setUseManualAddedBy] = useState(false);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
  const [expandedFollowUpNoteId, setExpandedFollowUpNoteId] = useState<string | null>(null);
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canCreateNotes =
    authContext.role === "admin" ||
    authContext.role === "lead" ||
    authContext.operationsRole === "director" ||
    authContext.operationsRole === "icu_command_center" ||
    authContext.operationsRole === "command_center";
  const canReviewNotes = authContext.role === "admin" || authContext.role === "lead";
  const selectedAddedBy = useMemo(
    () => leadOptions.find((staff) => staff.id === addedByStaffProfileId) ?? null,
    [addedByStaffProfileId, leadOptions]
  );
  const defaultAddedByName = context === "lead" ? selectedAddedBy?.display_name ?? "" : authContext.displayName;
  const addedByName = useManualAddedBy ? manualAddedByName.trim() : defaultAddedByName;
  const canSendNewNote = canCreateNotes && noteText.trim().length > 0 && Boolean(authContext.staffProfileId) && addedByName.length > 0;
  const visibleNotes = notes;
  const hasMoreNotes = activeNoteCount > visibleNotes.length;

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const notesQuery = supabase
      .from("lead_communication_notes")
      .select(leadNoteColumns)
      .eq("department_id", authContext.departmentId)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .range(0, visibleNoteCount - 1);

    const countQuery = supabase
      .from("lead_communication_notes")
      .select("id", { count: "exact", head: true })
      .eq("department_id", authContext.departmentId)
      .neq("status", "closed");

    const { data, error: loadError } = await notesQuery;
    const { count, error: countError } = await countQuery;

    if (loadError || countError) {
      setNotes([]);
      setActiveNoteCount(0);
      setError("Unable to load Lead Communication Board.");
      setLoading(false);
      return;
    }

    setNotes((data ?? []) as LeadCommunicationNoteRow[]);
    setActiveNoteCount(count ?? 0);
    setLoading(false);
  }, [authContext.departmentId, visibleNoteCount]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => {
      setVisibleNoteCount(notesPageSize);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    queueMicrotask(() => {
      void loadNotes();
    });
  }, [loadNotes, open]);

  useEffect(() => {
    if (!open || context !== "lead" || !canCreateNotes) {
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
        setLeadOptions([]);
        return;
      }

      const options = (data ?? []) as StaffOption[];
      setLeadOptions(options);
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
  }, [authContext.departmentId, authContext.staffProfileId, canCreateNotes, context, open]);

  const notifyChanged = () => {
    onNotesChanged?.();
  };

  const sendNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSendNewNote || !authContext.staffProfileId) {
      setError("Add who created this note before sending.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: insertError } = await supabase.from("lead_communication_notes").insert({
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
    if (context === "lead" && authContext.staffProfileId && leadOptions.some((staff) => staff.id === authContext.staffProfileId)) {
      setAddedByStaffProfileId(authContext.staffProfileId);
    }
    setMessage("Note sent to RT leads.");
    await loadNotes();
    notifyChanged();
  };

  const markReviewed = async (note: LeadCommunicationNoteRow) => {
    if (!canReviewNotes || !authContext.staffProfileId || note.status !== "new") {
      return;
    }

    setBusyNoteId(note.id);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("lead_communication_notes")
      .update({
        status: "reviewed",
        reviewed_at: new Date().toISOString(),
        reviewed_by_staff_profile_id: authContext.staffProfileId,
        reviewed_by_name: authContext.displayName
      })
      .eq("id", note.id)
      .eq("department_id", authContext.departmentId)
      .eq("status", "new");

    setBusyNoteId(null);

    if (updateError) {
      setError("Unable to mark note reviewed.");
      return;
    }

    setMessage("Note marked reviewed.");
    await loadNotes();
    notifyChanged();
  };

  const sendFollowUp = async (note: LeadCommunicationNoteRow) => {
    if (!canReviewNotes || !authContext.staffProfileId) {
      return;
    }

    const followUpText = (followUpDrafts[note.id] ?? "").trim();
    if (!followUpText) {
      setError("Add a follow-up note before sending.");
      return;
    }

    setBusyNoteId(note.id);
    setError("");
    setMessage("");

    const now = new Date().toISOString();
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("lead_communication_notes")
      .update({
        status: "reviewed",
        follow_up_text: followUpText,
        followed_up_at: now,
        followed_up_by_staff_profile_id: authContext.staffProfileId,
        followed_up_by_name: authContext.displayName,
        reviewed_at: note.reviewed_at ?? now,
        reviewed_by_staff_profile_id: note.reviewed_by_staff_profile_id ?? authContext.staffProfileId,
        reviewed_by_name: note.reviewed_by_name ?? authContext.displayName
      })
      .eq("id", note.id)
      .eq("department_id", authContext.departmentId)
      .neq("status", "closed");

    setBusyNoteId(null);

    if (updateError) {
      setError("Unable to send follow-up note.");
      return;
    }

    setFollowUpDrafts((current) => ({ ...current, [note.id]: "" }));
    setExpandedFollowUpNoteId((current) => (current === note.id ? null : current));
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
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">
              <MessageSquareText size={22} />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-blue-700">Shared Notes</p>
              <h2 className="text-2xl font-black text-hospital-ink">Lead Communication Board</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">{contextSubtitle(context)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600"
            aria-label="Close Lead Communication Board"
          >
            <X size={18} />
          </button>
        </div>

        {canCreateNotes && (
          <form onSubmit={sendNote} className="mt-5 rounded-3xl border border-blue-100 bg-blue-50/50 p-4">
            <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500" htmlFor="lead-communication-note">
              Note
            </label>
            <textarea
              id="lead-communication-note"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value.slice(0, maxNoteLength))}
              placeholder="Add note for RT leads..."
              maxLength={maxNoteLength}
              className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-hospital-ink outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
              <span>No patient information.</span>
              <span>{noteText.length}/{maxNoteLength}</span>
            </div>

            <div className="mt-4">
              <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500" htmlFor="lead-communication-added-by">
                Added by
              </label>
              {context === "lead" && !useManualAddedBy ? (
                <div className="mt-2 space-y-2">
                  <select
                    id="lead-communication-added-by"
                    value={addedByStaffProfileId}
                    onChange={(event) => setAddedByStaffProfileId(event.target.value)}
                    className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select lead adding note</option>
                    {leadOptions.map((staff) => (
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
                    className="text-sm font-extrabold text-blue-700 underline decoration-blue-200 underline-offset-4"
                  >
                    Not listed? Type name manually
                  </button>
                </div>
              ) : useManualAddedBy ? (
                <div className="mt-2 space-y-2">
                  <input
                    id="lead-communication-added-by"
                    value={manualAddedByName}
                    onChange={(event) => setManualAddedByName(event.target.value.slice(0, 80))}
                    placeholder="Enter name"
                    className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setUseManualAddedBy(false);
                      setManualAddedByName("");
                    }}
                    className="text-sm font-extrabold text-blue-700 underline decoration-blue-200 underline-offset-4"
                  >
                    {context === "lead" ? "Choose from lead list" : "Use current name"}
                  </button>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <p className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-black text-hospital-ink">
                    {authContext.displayName}
                  </p>
                  <button
                    type="button"
                    onClick={() => setUseManualAddedBy(true)}
                    className="text-sm font-extrabold text-blue-700 underline decoration-blue-200 underline-offset-4"
                  >
                    Not listed? Type name manually
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["normal", "urgent"] as LeadNotePriority[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPriority(option)}
                  className={`min-h-11 rounded-2xl border px-3 text-sm font-extrabold capitalize ${
                    priority === option
                      ? "border-blue-200 bg-blue-700 text-white"
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
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 text-sm font-black text-white shadow-md shadow-blue-900/20 disabled:cursor-not-allowed disabled:opacity-60"
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
              {activeNoteCount}
            </span>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-500">
              Loading Lead Communication Board...
            </div>
          ) : visibleNotes.length === 0 ? (
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-500">
              No Lead Communication Board notes right now.
            </div>
          ) : (
            <>
              {visibleNotes.map((note) => {
                const followUpDraft = followUpDrafts[note.id] ?? "";
                const canMarkReviewed = canReviewNotes && note.status === "new";
                const canSendFollowUp = canReviewNotes && followUpDraft.trim().length > 0 && busyNoteId !== note.id;

                return (
                  <article key={note.id} className={`rounded-[1.75rem] border p-4 shadow-md ${priorityCardClass(note.priority)}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusClass(note.status)}`}>
                          {statusLabel(note.status)}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${priorityChipClass(note.priority)}`}>
                          {note.priority === "urgent" ? "Urgent" : "Normal"}
                        </span>
                      </div>
                      <span className="text-right text-xs font-bold text-slate-500">{formatDateTime(note.created_at)}</span>
                    </div>

                    <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-white/80 px-3 py-3 text-sm font-bold leading-6 text-hospital-ink">
                      {note.note_text}
                    </p>
                    <p className="mt-3 text-xs font-bold text-slate-600">
                      Created by: {note.created_by_name ?? "Unknown"}
                    </p>

                    {note.follow_up_text && (
                      <div className="mt-3 rounded-2xl border border-blue-100 bg-white/80 px-3 py-3">
                        <p className="text-xs font-extrabold uppercase tracking-wide text-blue-700">
                          Follow-up from {note.followed_up_by_name ?? "Lead"}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-hospital-ink">
                          {note.follow_up_text}
                        </p>
                        <p className="mt-2 text-xs font-bold text-blue-700">{formatDateTime(note.followed_up_at)}</p>
                      </div>
                    )}

                    {note.reviewed_at && (
                      <div className="mt-3 border-t border-slate-200/70 pt-3 text-emerald-800">
                        <div className="flex items-center gap-2 text-sm font-extrabold">
                          <CheckCircle2 size={17} />
                          <span>Reviewed by {note.reviewed_by_name ?? "Unknown"}</span>
                        </div>
                        <p className="mt-1 pl-7 text-xs font-bold text-emerald-700">{formatDateTime(note.reviewed_at)}</p>
                      </div>
                    )}

                    {canReviewNotes && (
                      <div className="mt-4 space-y-3">
                        {canMarkReviewed && (
                          <button
                            type="button"
                            onClick={() => void markReviewed(note)}
                            disabled={busyNoteId === note.id}
                            className="inline-flex min-h-11 w-auto items-center justify-start gap-2 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-3.5 text-left text-sm font-black text-emerald-800 shadow-sm transition duration-150 active:scale-[0.98] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <CheckCircle2 size={17} />
                            {busyNoteId === note.id ? "Reviewing..." : "Mark Reviewed"}
                          </button>
                        )}

                        {expandedFollowUpNoteId === note.id ? (
                          <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-3">
                            <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500" htmlFor={`lead-follow-up-${note.id}`}>
                              Add Note
                            </label>
                            <textarea
                              id={`lead-follow-up-${note.id}`}
                              value={followUpDraft}
                              onChange={(event) =>
                                setFollowUpDrafts((current) => ({
                                  ...current,
                                  [note.id]: event.target.value.slice(0, maxNoteLength)
                                }))
                              }
                              placeholder="Add follow-up note..."
                              maxLength={maxNoteLength}
                              className="mt-2 min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-hospital-ink outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                              <span>No patient information.</span>
                              <span>{followUpDraft.length}/{maxNoteLength}</span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedFollowUpNoteId(null);
                                  setFollowUpDrafts((current) => ({ ...current, [note.id]: "" }));
                                }}
                                className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 transition duration-150 active:scale-[0.98]"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void sendFollowUp(note)}
                                disabled={!canSendFollowUp}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 text-sm font-black text-white shadow-md shadow-blue-900/20 transition duration-150 active:scale-[0.98] active:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {busyNoteId === note.id ? "Sending..." : "Send Note"}
                              </button>
                            </div>
                          </div>
                        ) : !note.follow_up_text ? (
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedFollowUpNoteId(note.id);
                              setFollowUpDrafts((current) => ({ ...current, [note.id]: current[note.id] ?? "" }));
                            }}
                            className="inline-flex min-h-11 w-auto items-center justify-center rounded-2xl border border-blue-200 bg-white px-3.5 text-sm font-black text-blue-700 shadow-sm transition duration-150 active:scale-[0.98]"
                          >
                            + Add Note
                          </button>
                        ) : null}
                      </div>
                    )}
                  </article>
                );
              })}
            </>
          )}

          {hasMoreNotes && (
            <button
              type="button"
              onClick={() => setVisibleNoteCount((current) => current + notesPageSize)}
              disabled={loading}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Load More
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
