"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { Megaphone, X } from "lucide-react";
import {
  announcementMessageLimit,
  announcementTitleLimit,
  type DepartmentAnnouncement,
  validateAnnouncementInput
} from "@/lib/announcements/types";
import { formatShiftStatusTime } from "@/lib/shift-status/utils";
import { createClient } from "@/lib/supabase/client";

const announcementSelect =
  "id, department_id, title, message, updated_by_staff_profile_id, updated_by_name, created_at, updated_at";

const focusableSelector =
  "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

function isDepartmentAnnouncement(value: unknown): value is DepartmentAnnouncement {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Partial<DepartmentAnnouncement>;
  return (
    typeof row.id === "string" &&
    typeof row.department_id === "string" &&
    typeof row.title === "string" &&
    typeof row.message === "string" &&
    typeof row.updated_by_name === "string" &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string"
  );
}

export function useDepartmentAnnouncement(departmentId: string, enabled = true) {
  const [announcement, setAnnouncement] = useState<DepartmentAnnouncement | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const loadAnnouncement = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("department_announcements")
      .select(announcementSelect)
      .eq("department_id", departmentId)
      .maybeSingle();

    if (loadError) {
      setError("Unable to load the department announcement.");
    } else {
      setAnnouncement(isDepartmentAnnouncement(data) ? data : null);
      setError("");
    }

    setLoading(false);
  }, [departmentId, enabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAnnouncement();
    }, 0);

    if (!enabled) {
      return () => window.clearTimeout(timer);
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`department-announcement:${departmentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "department_announcements",
          filter: `department_id=eq.${departmentId}`
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setAnnouncement(null);
            setError("");
            return;
          }

          setAnnouncement(isDepartmentAnnouncement(payload.new) ? payload.new : null);
          setError("");
        }
      )
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [departmentId, enabled, loadAnnouncement]);

  return {
    announcement,
    loading,
    error,
    refresh: loadAnnouncement,
    setAnnouncement
  };
}

function AnnouncementModal({
  open,
  titleId,
  closeLabel,
  onClose,
  children
}: {
  open: boolean;
  titleId: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 px-3 pb-3 pt-12 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="inline-flex min-w-0 items-center gap-2 text-amber-700">
            <Megaphone size={18} aria-hidden="true" />
            <span className="text-xs font-extrabold uppercase tracking-wide">Department-wide</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
            aria-label={closeLabel}
          >
            <X size={16} aria-hidden="true" />
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AnnouncementBoardCard({
  announcement,
  loading = false,
  error = "",
  timezone = "America/Los_Angeles"
}: {
  announcement: DepartmentAnnouncement | null;
  loading?: boolean;
  error?: string;
  timezone?: string;
}) {
  const [detailsAnnouncementId, setDetailsAnnouncementId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setDetailsAnnouncementId(null), []);

  return (
    <>
      <section
        aria-labelledby="department-announcement-heading"
        className="rounded-2xl border border-amber-100 bg-amber-50/90 px-3.5 py-3 shadow-soft"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-700 shadow-sm">
            <Megaphone size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="department-announcement-heading" className="text-sm font-black text-hospital-ink">
              Announcement Board
            </h2>

            {loading && <p className="mt-1 text-sm font-bold text-slate-500">Loading announcement...</p>}

            {!loading && error && (
              <p role="alert" className="mt-2 text-sm font-bold leading-5 text-rose-700">
                {error}
              </p>
            )}

            {!loading && !error && !announcement && (
              <p className="mt-1 text-sm font-bold leading-5 text-slate-500">
                There are no current announcements.
              </p>
            )}

            {!loading && !error && announcement && (
              <div className="mt-1.5">
                <h3 className="break-words text-base font-black leading-5 text-hospital-ink [overflow-wrap:anywhere]">
                  {announcement.title}
                </h3>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold leading-5 text-slate-500">
                    Updated {formatShiftStatusTime(announcement.updated_at, timezone)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDetailsAnnouncementId(announcement.id)}
                    className="inline-flex min-h-9 items-center justify-center rounded-xl bg-amber-600 px-3 text-xs font-extrabold text-white shadow-sm"
                  >
                    View Details
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <AnnouncementModal
        open={Boolean(announcement && detailsAnnouncementId === announcement.id)}
        titleId="announcement-details-title"
        closeLabel="Close announcement details"
        onClose={closeDetails}
      >
        {announcement && (
          <article>
            <h2
              id="announcement-details-title"
              className="break-words text-xl font-black leading-7 text-hospital-ink [overflow-wrap:anywhere]"
            >
              {announcement.title}
            </h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-700 [overflow-wrap:anywhere]">
              {announcement.message}
            </p>
            <p className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
              Last updated {formatShiftStatusTime(announcement.updated_at, timezone)} by {announcement.updated_by_name}
            </p>
          </article>
        )}
      </AnnouncementModal>
    </>
  );
}

export function DepartmentAnnouncementBoard({
  departmentId,
  timezone,
  enabled = true
}: {
  departmentId: string;
  timezone: string;
  enabled?: boolean;
}) {
  const { announcement, loading, error } = useDepartmentAnnouncement(departmentId, enabled);

  return (
    <AnnouncementBoardCard
      announcement={announcement}
      loading={loading}
      error={error}
      timezone={timezone}
    />
  );
}

export function DepartmentAnnouncementEditor({
  departmentId,
  timezone
}: {
  departmentId: string;
  timezone: string;
}) {
  const { announcement, loading, error: loadError, setAnnouncement } = useDepartmentAnnouncement(departmentId);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  return (
    <DepartmentAnnouncementEditorForm
      key={announcement?.updated_at ?? "empty"}
      announcement={announcement}
      loading={loading}
      loadError={loadError}
      timezone={timezone}
      setAnnouncement={setAnnouncement}
      success={success}
      actionError={actionError}
      setSuccess={setSuccess}
      setActionError={setActionError}
    />
  );
}

export function DepartmentAnnouncementManagerCard({
  departmentId,
  timezone
}: {
  departmentId: string;
  timezone: string;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const closeEditor = useCallback(() => setEditorOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        className="h-36 w-full rounded-3xl border border-amber-100 bg-amber-50/90 p-4 text-left shadow-soft transition duration-150 active:scale-[0.99]"
      >
        <span className="flex h-full items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-amber-700">
            <Megaphone size={24} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-black text-hospital-ink">Announcement Board</span>
            <span className="mt-1 block text-sm font-bold leading-5 text-slate-600">
              Create or update the department-wide employee announcement.
            </span>
            <span className="mt-2 inline-flex text-xs font-extrabold text-amber-700">Manage Announcement</span>
          </span>
        </span>
      </button>

      <AnnouncementModal
        open={editorOpen}
        titleId="announcement-editor-title"
        closeLabel="Close announcement editor"
        onClose={closeEditor}
      >
        <h2 id="announcement-editor-title" className="text-xl font-black text-hospital-ink">
          Manage Announcement
        </h2>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
          This announcement appears on every employee schedule.
        </p>
        <div className="mt-4">
          <DepartmentAnnouncementEditor departmentId={departmentId} timezone={timezone} />
        </div>
      </AnnouncementModal>
    </>
  );
}

function DepartmentAnnouncementEditorForm({
  announcement,
  loading,
  loadError,
  timezone,
  setAnnouncement,
  success,
  actionError,
  setSuccess,
  setActionError
}: {
  announcement: DepartmentAnnouncement | null;
  loading: boolean;
  loadError: string;
  timezone: string;
  setAnnouncement: (announcement: DepartmentAnnouncement | null) => void;
  success: string;
  actionError: string;
  setSuccess: (message: string) => void;
  setActionError: (message: string) => void;
}) {
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [message, setMessage] = useState(announcement?.message ?? "");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const saveAnnouncement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess("");
    setActionError("");

    const validated = validateAnnouncementInput(title, message);
    if ("error" in validated && validated.error) {
      setActionError(validated.error);
      return;
    }

    setSaving(true);
    const response = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated)
    });
    const result = await response.json().catch(() => null);
    setSaving(false);

    if (!response.ok || !isDepartmentAnnouncement(result?.announcement)) {
      setActionError(result?.message ?? "Unable to save the announcement.");
      return;
    }

    const wasUpdate = Boolean(announcement);
    setAnnouncement(result.announcement);
    setSuccess(wasUpdate ? "Announcement updated." : "Announcement saved.");
  };

  const clearAnnouncement = async () => {
    if (!announcement || !window.confirm("Clear the current department announcement?")) {
      return;
    }

    setClearing(true);
    setSuccess("");
    setActionError("");
    const response = await fetch("/api/announcements", { method: "DELETE" });
    const result = await response.json().catch(() => null);
    setClearing(false);

    if (!response.ok) {
      setActionError(result?.message ?? "Unable to clear the announcement.");
      return;
    }

    setAnnouncement(null);
    setTitle("");
    setMessage("");
    setSuccess("Announcement cleared.");
  };

  const busy = loading || saving || clearing;

  return (
    <section aria-label="Announcement editor">
      {announcement && (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
          Last updated {formatShiftStatusTime(announcement.updated_at, timezone)} by {announcement.updated_by_name}
        </p>
      )}

      <form onSubmit={saveAnnouncement} className={`${announcement ? "mt-4" : ""} grid gap-3`}>
        <label className="block">
          <span className="text-xs font-extrabold text-slate-700">Announcement title</span>
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setSuccess("");
              setActionError("");
            }}
            maxLength={announcementTitleLimit}
            disabled={busy}
            className="mt-1 min-h-11 w-full rounded-2xl border border-amber-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-amber-400 disabled:opacity-60"
          />
          <span className="mt-1 block text-right text-[11px] font-bold text-slate-500">
            {title.length}/{announcementTitleLimit}
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-extrabold text-slate-700">Announcement message</span>
          <textarea
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setSuccess("");
              setActionError("");
            }}
            maxLength={announcementMessageLimit}
            rows={6}
            disabled={busy}
            className="mt-1 min-h-32 w-full resize-y rounded-2xl border border-amber-200 bg-white px-3 py-2 text-sm font-bold leading-5 text-hospital-ink outline-none focus:border-amber-400 disabled:opacity-60"
          />
          <span className="mt-1 block text-right text-[11px] font-bold text-slate-500">
            {message.length}/{announcementMessageLimit.toLocaleString()}
          </span>
        </label>

        {(loadError || actionError) && (
          <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {actionError || loadError}
          </p>
        )}
        {success && (
          <p role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
            {success}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-2xl bg-amber-600 px-3 text-sm font-extrabold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving..." : announcement ? "Update Announcement" : "Save Announcement"}
          </button>
          <button
            type="button"
            onClick={() => void clearAnnouncement()}
            disabled={busy || !announcement}
            className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600 disabled:opacity-60"
          >
            {clearing ? "Clearing..." : "Clear Announcement"}
          </button>
        </div>
      </form>
    </section>
  );
}
