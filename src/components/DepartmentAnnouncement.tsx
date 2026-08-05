"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Megaphone } from "lucide-react";
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
  return (
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
            <div className="mt-2">
              <h3 className="break-words text-lg font-black leading-6 text-hospital-ink">
                {announcement.title}
              </h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-700">
                {announcement.message}
              </p>
              <p className="mt-3 text-xs font-bold leading-5 text-slate-500">
                Updated {formatShiftStatusTime(announcement.updated_at, timezone)} by {announcement.updated_by_name}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
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
    <section className="rounded-[2rem] border border-amber-100 bg-amber-50/90 p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
          <Megaphone size={21} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-wide text-amber-700">Department-wide</p>
          <h2 className="mt-1 text-xl font-black leading-tight text-hospital-ink">Announcement Board</h2>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            This announcement appears on every employee schedule.
          </p>
        </div>
      </div>

      {announcement && (
        <p className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
          Last updated {formatShiftStatusTime(announcement.updated_at, timezone)} by {announcement.updated_by_name}
        </p>
      )}

      <form onSubmit={saveAnnouncement} className="mt-4 grid gap-3">
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
