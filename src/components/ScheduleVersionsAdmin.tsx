"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList, FileUp, Plus, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import {
  dayNameFromDate,
  displayStaffType,
  firstStaffProfile,
  formatShiftTime,
  standardTimesForShiftType,
  shiftTypeLabels,
  type ScheduleEntryRow,
  type ScheduleEntryStatus,
  type ScheduleVersionRow,
  type ScheduleVersionStatus,
  type ShiftShortageRow,
  type ShiftShortageSeverity,
  type ShiftType,
  type StaffProfileSummary
} from "@/lib/schedule/supabase-schedule";
import { StaffTypeBadge } from "@/components/StaffTypeBadge";
import { StatusChip } from "@/components/StatusChip";

type ScheduleVersionsAdminProps = {
  authContext: AuthenticatedUserContext;
};

type VersionForm = {
  id?: string;
  label: string;
  starts_on: string;
  ends_on: string;
  status: ScheduleVersionStatus;
};

type EntryForm = {
  id?: string;
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  staff_profile_id: string;
  entry_status: ScheduleEntryStatus;
};

type ShortageForm = {
  id?: string;
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  severity: ShiftShortageSeverity;
  message: string;
};

type BatchEntryRow = {
  lineNumber: number;
  shift_date: string;
  shift_type: ShiftType | "";
  shift_start: string;
  shift_end: string;
  raw_staff_name: string;
  staff_profile_id: string;
  entry_status: ScheduleEntryStatus | "";
  status: "ready" | "needs_review";
  issue: string;
};

const emptyVersionForm: VersionForm = {
  label: "",
  starts_on: "",
  ends_on: "",
  status: "draft"
};

const emptyEntryForm: EntryForm = {
  shift_date: "",
  shift_type: "day_shift",
  shift_start: "06:30",
  shift_end: "19:00",
  staff_profile_id: "",
  entry_status: "scheduled"
};

const emptyShortageForm: ShortageForm = {
  shift_date: "",
  shift_type: "day_shift",
  shift_start: "06:30",
  shift_end: "19:00",
  severity: "short",
  message: ""
};

const statusLabels: Record<ScheduleVersionStatus, string> = {
  draft: "Draft",
  review: "Review",
  published: "Published",
  archived: "Archived"
};

const entryStatusLabels: Record<ScheduleEntryStatus, string> = {
  scheduled: "Scheduled",
  available: "Available"
};

const shortageLabels: Record<ShiftShortageSeverity, string> = {
  short: "Short",
  urgent: "Urgent"
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeOptionalDate(value: string) {
  return value.trim() || null;
}

function versionToForm(version: ScheduleVersionRow): VersionForm {
  return {
    id: version.id,
    label: version.label,
    starts_on: version.starts_on ?? "",
    ends_on: version.ends_on ?? "",
    status: version.status
  };
}

function applyStandardShiftTimes<T extends { shift_type: ShiftType; shift_start: string; shift_end: string }>(
  form: T,
  shiftType: ShiftType
): T {
  const standardTimes = standardTimesForShiftType(shiftType);

  return {
    ...form,
    shift_type: shiftType,
    ...(standardTimes ?? {})
  };
}

function entryToForm(entry: ScheduleEntryRow): EntryForm {
  return {
    id: entry.id,
    shift_date: entry.shift_date,
    shift_type: entry.shift_type,
    shift_start: entry.shift_start.slice(0, 5),
    shift_end: entry.shift_end.slice(0, 5),
    staff_profile_id: entry.staff_profile_id ?? "",
    entry_status: entry.entry_status
  };
}

function shortageToForm(shortage: ShiftShortageRow): ShortageForm {
  return {
    id: shortage.id,
    shift_date: shortage.shift_date,
    shift_type: shortage.shift_type,
    shift_start: shortage.shift_start.slice(0, 5),
    shift_end: shortage.shift_end.slice(0, 5),
    severity: shortage.severity,
    message: shortage.message ?? ""
  };
}

export function ScheduleVersionsAdmin({ authContext }: ScheduleVersionsAdminProps) {
  const [versions, setVersions] = useState<ScheduleVersionRow[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [entries, setEntries] = useState<ScheduleEntryRow[]>([]);
  const [shortages, setShortages] = useState<ShiftShortageRow[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfileSummary[]>([]);
  const [versionForm, setVersionForm] = useState<VersionForm>(emptyVersionForm);
  const [entryForm, setEntryForm] = useState<EntryForm>(emptyEntryForm);
  const [shortageForm, setShortageForm] = useState<ShortageForm>(emptyShortageForm);
  const [batchText, setBatchText] = useState("");
  const [batchRows, setBatchRows] = useState<BatchEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;
  const selectedVersionCanEdit = Boolean(selectedVersion && ["draft", "review"].includes(selectedVersion.status));

  const staffById = useMemo(() => {
    return new Map(staffProfiles.map((profile) => [profile.id, profile]));
  }, [staffProfiles]);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const [{ data: department, error: departmentError }, { data: versionRows, error: versionsError }, { data: staffRows, error: staffError }] =
      await Promise.all([
        supabase
          .from("departments")
          .select("active_schedule_version_id")
          .eq("id", authContext.departmentId)
          .maybeSingle(),
        supabase
          .from("schedule_versions")
          .select("*")
          .eq("department_id", authContext.departmentId)
          .order("created_at", { ascending: false }),
        supabase
          .from("staff_profiles")
          .select("id, display_name, employment_type, home_assignment, is_active")
          .eq("department_id", authContext.departmentId)
          .eq("is_active", true)
          .order("display_name", { ascending: true })
      ]);

    if (departmentError || versionsError || staffError) {
      setError("Unable to load schedule builder data.");
      setLoading(false);
      return;
    }

    const nextVersions = (versionRows ?? []) as ScheduleVersionRow[];
    setActiveVersionId((department?.active_schedule_version_id as string | null | undefined) ?? null);
    setVersions(nextVersions);
    setStaffProfiles((staffRows ?? []) as StaffProfileSummary[]);
    setSelectedVersionId((current) => current || nextVersions[0]?.id || "");
    setLoading(false);
  }, [authContext.departmentId]);

  const loadVersionRows = useCallback(async () => {
    if (!selectedVersionId) {
      setEntries([]);
      setShortages([]);
      return;
    }

    const supabase = createClient();
    const [{ data: entryRows, error: entryError }, { data: shortageRows, error: shortageError }] = await Promise.all([
      supabase
        .from("schedule_entries")
        .select(
          "id, schedule_version_id, department_id, staff_profile_id, shift_date, day_of_week, shift_type, shift_start, shift_end, entry_status, staff_profiles(id, display_name, employment_type, home_assignment, is_active)"
        )
        .eq("schedule_version_id", selectedVersionId)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true }),
      supabase
        .from("shift_shortages")
        .select("*")
        .eq("schedule_version_id", selectedVersionId)
        .order("shift_date", { ascending: true })
        .order("shift_start", { ascending: true })
    ]);

    if (entryError || shortageError) {
      setError("Unable to load rows for this schedule version.");
      return;
    }

    setEntries((entryRows ?? []) as ScheduleEntryRow[]);
    setShortages((shortageRows ?? []) as ShiftShortageRow[]);
  }, [selectedVersionId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadVersions();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadVersions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVersionForm(selectedVersion ? versionToForm(selectedVersion) : emptyVersionForm);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedVersion]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadVersionRows();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadVersionRows]);

  const saveVersion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      department_id: authContext.departmentId,
      label: versionForm.label.trim(),
      starts_on: normalizeOptionalDate(versionForm.starts_on),
      ends_on: normalizeOptionalDate(versionForm.ends_on),
      status: versionForm.status,
      created_by: authContext.profileId
    };
    const supabase = createClient();
    const result = versionForm.id
      ? await supabase.from("schedule_versions").update(payload).eq("id", versionForm.id)
      : await supabase.from("schedule_versions").insert(payload).select("id").single();

    setSaving(false);

    if (result.error) {
      setError("Unable to save schedule version.");
      return;
    }

    const newId = versionForm.id || ((result.data as { id?: string } | null)?.id ?? "");
    setSuccess(versionForm.id ? "Schedule version updated." : "Schedule version created.");
    await loadVersions();
    if (newId) {
      setSelectedVersionId(newId);
    }
  };

  const publishVersion = async () => {
    if (!selectedVersion) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const versionUpdate = await supabase
      .from("schedule_versions")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: authContext.profileId
      })
      .eq("id", selectedVersion.id);

    if (versionUpdate.error) {
      setSaving(false);
      setError("Unable to publish schedule version.");
      return;
    }

    const departmentUpdate = await supabase
      .from("departments")
      .update({ active_schedule_version_id: selectedVersion.id })
      .eq("id", authContext.departmentId);

    setSaving(false);

    if (departmentUpdate.error) {
      setError("Published version, but could not set it active. Check department permissions.");
      return;
    }

    setSuccess("Schedule version published and set active.");
    await loadVersions();
  };

  const archiveVersion = async () => {
    if (!selectedVersion) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const result = await supabase.from("schedule_versions").update({ status: "archived" }).eq("id", selectedVersion.id);
    setSaving(false);

    if (result.error) {
      setError("Unable to archive schedule version.");
      return;
    }

    setSuccess("Schedule version archived.");
    await loadVersions();
  };

  const duplicateEntryIssue = (candidate: EntryForm) => {
    const duplicate = entries.find(
      (entry) =>
        entry.id !== candidate.id &&
        entry.staff_profile_id === candidate.staff_profile_id &&
        entry.shift_date === candidate.shift_date &&
        entry.shift_type === candidate.shift_type &&
        entry.entry_status === candidate.entry_status
    );

    return duplicate ? "Possible duplicate entry for this staff member, date, shift, and status." : "";
  };

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedVersion || !selectedVersionCanEdit) {
      setError("Only draft or review schedule versions can be edited.");
      return;
    }

    const duplicateIssue = duplicateEntryIssue(entryForm);
    if (duplicateIssue) {
      setError(duplicateIssue);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      schedule_version_id: selectedVersion.id,
      department_id: authContext.departmentId,
      staff_profile_id: entryForm.staff_profile_id,
      shift_date: entryForm.shift_date,
      day_of_week: dayNameFromDate(entryForm.shift_date),
      shift_type: entryForm.shift_type,
      shift_start: entryForm.shift_start,
      shift_end: entryForm.shift_end,
      entry_status: entryForm.entry_status
    };
    const supabase = createClient();
    const result = entryForm.id
      ? await supabase.from("schedule_entries").update(payload).eq("id", entryForm.id)
      : await supabase.from("schedule_entries").insert(payload);

    setSaving(false);

    if (result.error) {
      setError("Unable to save schedule entry.");
      return;
    }

    setEntryForm(emptyEntryForm);
    setSuccess(entryForm.id ? "Schedule entry updated." : "Schedule entry added.");
    await loadVersionRows();
  };

  const deleteEntry = async (entryId: string) => {
    if (!selectedVersionCanEdit) {
      return;
    }

    const supabase = createClient();
    const result = await supabase.from("schedule_entries").delete().eq("id", entryId);

    if (result.error) {
      setError("Unable to delete schedule entry.");
      return;
    }

    setSuccess("Schedule entry deleted.");
    await loadVersionRows();
  };

  const saveShortage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedVersion || !selectedVersionCanEdit) {
      setError("Only draft or review schedule versions can be edited.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      schedule_version_id: selectedVersion.id,
      department_id: authContext.departmentId,
      shift_date: shortageForm.shift_date,
      shift_type: shortageForm.shift_type,
      shift_start: shortageForm.shift_start,
      shift_end: shortageForm.shift_end,
      severity: shortageForm.severity,
      message: shortageForm.message.trim() || null
    };
    const supabase = createClient();
    const result = shortageForm.id
      ? await supabase.from("shift_shortages").update(payload).eq("id", shortageForm.id)
      : await supabase.from("shift_shortages").insert(payload);

    setSaving(false);

    if (result.error) {
      setError("Unable to save Short Shift alert.");
      return;
    }

    setShortageForm(emptyShortageForm);
    setSuccess(shortageForm.id ? "Short Shift alert updated." : "Short Shift alert added.");
    await loadVersionRows();
  };

  const deleteShortage = async (shortageId: string) => {
    if (!selectedVersionCanEdit) {
      return;
    }

    const supabase = createClient();
    const result = await supabase.from("shift_shortages").delete().eq("id", shortageId);

    if (result.error) {
      setError("Unable to delete Short Shift alert.");
      return;
    }

    setSuccess("Short Shift alert deleted.");
    await loadVersionRows();
  };

  const parseBatchRows = () => {
    const nameMap = new Map(staffProfiles.map((profile) => [normalizeName(profile.display_name), profile]));
    const parsed = batchText
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
      .filter(({ line }) => Boolean(line))
      .map(({ line, lineNumber }) => {
        const [shiftDate = "", rawShiftType = "", shiftStart = "", shiftEnd = "", rawStaffName = "", rawStatus = ""] =
          line.split("|").map((part) => part.trim());
        const shiftType = rawShiftType as ShiftType;
        const entryStatus = rawStatus as ScheduleEntryStatus;
        const matchedStaff = nameMap.get(normalizeName(rawStaffName));
        const issues: string[] = [];

        if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) {
          issues.push("Date must use YYYY-MM-DD");
        }

        if (!Object.keys(shiftTypeLabels).includes(shiftType)) {
          issues.push("Invalid shift type");
        }

        if (!shiftStart || !shiftEnd) {
          issues.push("Missing shift time");
        }

        if (!matchedStaff) {
          issues.push("Needs roster match");
        }

        if (!["scheduled", "available"].includes(entryStatus)) {
          issues.push("Status must be scheduled or available");
        }

        return {
          lineNumber,
          shift_date: shiftDate,
          shift_type: Object.keys(shiftTypeLabels).includes(shiftType) ? shiftType : "",
          shift_start: shiftStart,
          shift_end: shiftEnd,
          raw_staff_name: rawStaffName,
          staff_profile_id: matchedStaff?.id ?? "",
          entry_status: ["scheduled", "available"].includes(entryStatus) ? entryStatus : "",
          status: issues.length ? "needs_review" : "ready",
          issue: issues.join("; ")
        } satisfies BatchEntryRow;
      });

    setBatchRows(parsed);
    setError("");
    setSuccess("");
  };

  const updateBatchRowStaff = (lineNumber: number, staffProfileId: string) => {
    setBatchRows((currentRows) =>
      currentRows.map((row) => {
        if (row.lineNumber !== lineNumber) {
          return row;
        }

        const issues = row.issue
          .split("; ")
          .filter((issue) => issue && issue !== "Needs roster match");

        return {
          ...row,
          staff_profile_id: staffProfileId,
          issue: issues.join("; "),
          status:
            staffProfileId &&
            row.shift_type &&
            row.entry_status &&
            row.shift_date &&
            row.shift_start &&
            row.shift_end &&
            issues.length === 0
              ? "ready"
              : "needs_review"
        };
      })
    );
  };

  const createBatchEntries = async () => {
    if (!selectedVersion || !selectedVersionCanEdit || batchRows.length === 0) {
      setError("Select an editable schedule version first.");
      return;
    }

    if (batchRows.some((row) => row.status !== "ready")) {
      setError("Correct rows marked Needs Review before saving.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const result = await supabase.from("schedule_entries").insert(
      batchRows.map((row) => ({
        schedule_version_id: selectedVersion.id,
        department_id: authContext.departmentId,
        staff_profile_id: row.staff_profile_id,
        shift_date: row.shift_date,
        day_of_week: dayNameFromDate(row.shift_date),
        shift_type: row.shift_type,
        shift_start: row.shift_start,
        shift_end: row.shift_end,
        entry_status: row.entry_status
      }))
    );

    setSaving(false);

    if (result.error) {
      setError("Unable to create batch schedule entries.");
      return;
    }

    setBatchText("");
    setBatchRows([]);
    setSuccess("Batch schedule entries created.");
    await loadVersionRows();
  };

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-extrabold text-cyan-700">
            <ArrowLeft size={16} />
            Back to Admin
          </Link>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
                Schedule Administration
              </p>
              <h1 className="mt-1 text-2xl font-black text-hospital-ink">Schedule Versions</h1>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                Build a draft schedule manually, review it, then publish it as the active department schedule.
              </p>
            </div>
            <div className="grid gap-2 sm:min-w-44">
              <Link
                href="/admin/import-schedule"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 text-sm font-extrabold text-cyan-700"
              >
                <FileUp size={16} />
                Import Schedule
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
              >
                View Schedule
              </Link>
            </div>
          </div>
        </section>

        {error && (
          <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
            {success}
          </p>
        )}

        {loading && (
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <p className="text-sm font-bold text-slate-500">Loading schedule versions...</p>
          </section>
        )}

        {!loading && staffProfiles.length === 0 && (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-soft">
            <h2 className="text-lg font-black text-amber-950">No staff profiles available</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-amber-900">
              Add the department roster in Staff Directory before building schedule entries.
            </p>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <section className="space-y-4">
            <form onSubmit={saveVersion} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">
                {versionForm.id ? "Version Details" : "Create Schedule Version"}
              </h2>
              <div className="mt-4 grid gap-3">
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Label</span>
                  <input
                    value={versionForm.label}
                    onChange={(event) => setVersionForm({ ...versionForm, label: event.target.value })}
                    required
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Starts</span>
                    <input
                      type="date"
                      value={versionForm.starts_on}
                      onChange={(event) => setVersionForm({ ...versionForm, starts_on: event.target.value })}
                      className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Ends</span>
                    <input
                      type="date"
                      value={versionForm.ends_on}
                      onChange={(event) => setVersionForm({ ...versionForm, ends_on: event.target.value })}
                      className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Status</span>
                  <select
                    value={versionForm.status}
                    onChange={(event) =>
                      setVersionForm({ ...versionForm, status: event.target.value as ScheduleVersionStatus })
                    }
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  >
                    <option value="draft">Draft</option>
                    <option value="review">Review</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVersionForm(emptyVersionForm);
                    setSelectedVersionId("");
                  }}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
                >
                  New
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>

            <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">Versions</h2>
              <div className="mt-3 space-y-2">
                {versions.length === 0 && (
                  <p className="text-sm font-bold text-slate-500">No schedule versions yet.</p>
                )}
                {versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => {
                      setSelectedVersionId(version.id);
                      setVersionForm(versionToForm(version));
                    }}
                    className={`w-full rounded-2xl border px-3 py-3 text-left ${
                      selectedVersionId === version.id
                        ? "border-cyan-200 bg-cyan-50"
                        : "border-slate-100 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-hospital-ink">{version.label}</p>
                        <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                          {statusLabels[version.status]}
                        </p>
                      </div>
                      {activeVersionId === version.id && (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-extrabold text-emerald-700">
                          Active
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </section>

          <section className="space-y-4">
            {selectedVersion && (
              <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-hospital-ink">{selectedVersion.label}</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      {entries.length} entries - {shortages.length} Short Shift alerts
                    </p>
                    <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                      Rollback is currently handled by publishing a previous version again. A fuller rollback UI is planned.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:min-w-48">
                    <button
                      type="button"
                      onClick={publishVersion}
                      disabled={saving}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send size={15} />
                      Publish
                    </button>
                    <button
                      type="button"
                      onClick={archiveVersion}
                      disabled={saving}
                      className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Archive
                    </button>
                  </div>
                </div>
              </section>
            )}

            {!selectedVersion && (
              <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
                <h2 className="text-lg font-black text-hospital-ink">Select or create a schedule version.</h2>
              </section>
            )}

            {selectedVersion && (
              <>
                <form onSubmit={saveEntry} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-black text-hospital-ink">
                      {entryForm.id ? "Edit Schedule Entry" : "Add Schedule Entry"}
                    </h2>
                    <ClipboardList size={19} className="text-cyan-700" />
                  </div>
                  {!selectedVersionCanEdit && (
                    <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
                      Published and archived versions are read-only. Edit a draft or review version.
                    </p>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Date</span>
                      <input
                        type="date"
                        value={entryForm.shift_date}
                        onChange={(event) => setEntryForm({ ...entryForm, shift_date: event.target.value })}
                        required
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Shift type</span>
                      <select
                        value={entryForm.shift_type}
                        onChange={(event) =>
                          setEntryForm(applyStandardShiftTimes(entryForm, event.target.value as ShiftType))
                        }
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      >
                        {Object.entries(shiftTypeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Start</span>
                      <input
                        type="time"
                        value={entryForm.shift_start}
                        onChange={(event) => setEntryForm({ ...entryForm, shift_start: event.target.value })}
                        required
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">End</span>
                      <input
                        type="time"
                        value={entryForm.shift_end}
                        onChange={(event) => setEntryForm({ ...entryForm, shift_end: event.target.value })}
                        required
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Staff member</span>
                      <select
                        value={entryForm.staff_profile_id}
                        onChange={(event) => setEntryForm({ ...entryForm, staff_profile_id: event.target.value })}
                        required
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      >
                        <option value="">Select staff</option>
                        {staffProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Status</span>
                      <select
                        value={entryForm.entry_status}
                        onChange={(event) =>
                          setEntryForm({ ...entryForm, entry_status: event.target.value as ScheduleEntryStatus })
                        }
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="available">Available</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEntryForm(emptyEntryForm)}
                      className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
                    >
                      Clear
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !selectedVersionCanEdit}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Plus size={15} />
                      {saving ? "Saving..." : "Save Entry"}
                    </button>
                  </div>
                </form>

                <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
                  <h2 className="text-lg font-black text-hospital-ink">Batch Paste Entries</h2>
                  <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                    Use: 2026-06-23 | day_shift | 06:30 | 19:00 | Jonathan Burdick | scheduled
                  </p>
                  <textarea
                    value={batchText}
                    onChange={(event) => setBatchText(event.target.value)}
                    disabled={!selectedVersionCanEdit}
                    placeholder={"2026-06-23 | day_shift | 06:30 | 19:00 | Jonathan Burdick | scheduled\n2026-06-23 | night_shift | 18:30 | 07:00 | Joann Devera | scheduled"}
                    className="mt-3 min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={parseBatchRows}
                      disabled={!selectedVersionCanEdit}
                      className="min-h-11 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 text-sm font-extrabold text-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={createBatchEntries}
                      disabled={saving || !selectedVersionCanEdit || batchRows.length === 0 || batchRows.some((row) => row.status !== "ready")}
                      className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Create Entries
                    </button>
                  </div>
                  {batchRows.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {batchRows.map((row) => (
                        <div
                          key={`${row.lineNumber}-${row.raw_staff_name}`}
                          className={`rounded-2xl border px-3 py-2 ${
                            row.status === "ready"
                              ? "border-emerald-100 bg-emerald-50"
                              : "border-amber-200 bg-amber-50"
                          }`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-hospital-ink">
                                {row.shift_date} - {row.shift_type || "invalid"} - {row.raw_staff_name}
                              </p>
                              <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                {row.shift_start}-{row.shift_end} - {row.entry_status || "invalid"}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-1 text-xs font-extrabold ${
                                row.status === "ready" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {row.status === "ready" ? "Ready" : "Needs Review"}
                            </span>
                          </div>
                          {row.status === "needs_review" && (
                            <div className="mt-2 grid gap-2">
                              <p className="text-xs font-bold leading-5 text-amber-900">{row.issue}</p>
                              <select
                                value={row.staff_profile_id}
                                onChange={(event) => updateBatchRowStaff(row.lineNumber, event.target.value)}
                                className="min-h-10 rounded-2xl border border-amber-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                              >
                                <option value="">Select roster match</option>
                                {staffProfiles.map((profile) => (
                                  <option key={profile.id} value={profile.id}>
                                    {profile.display_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <form onSubmit={saveShortage} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
                  <h2 className="text-lg font-black text-hospital-ink">
                    {shortageForm.id ? "Edit Short Shift Alert" : "Add Short Shift Alert"}
                  </h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Date</span>
                      <input
                        type="date"
                        value={shortageForm.shift_date}
                        onChange={(event) => setShortageForm({ ...shortageForm, shift_date: event.target.value })}
                        required
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Shift type</span>
                      <select
                        value={shortageForm.shift_type}
                        onChange={(event) =>
                          setShortageForm(applyStandardShiftTimes(shortageForm, event.target.value as ShiftType))
                        }
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      >
                        {Object.entries(shiftTypeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Start</span>
                      <input
                        type="time"
                        value={shortageForm.shift_start}
                        onChange={(event) => setShortageForm({ ...shortageForm, shift_start: event.target.value })}
                        required
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">End</span>
                      <input
                        type="time"
                        value={shortageForm.shift_end}
                        onChange={(event) => setShortageForm({ ...shortageForm, shift_end: event.target.value })}
                        required
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Severity</span>
                      <select
                        value={shortageForm.severity}
                        onChange={(event) =>
                          setShortageForm({ ...shortageForm, severity: event.target.value as ShiftShortageSeverity })
                        }
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      >
                        <option value="short">Short</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Message</span>
                      <input
                        value={shortageForm.message}
                        onChange={(event) => setShortageForm({ ...shortageForm, message: event.target.value })}
                        disabled={!selectedVersionCanEdit}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300 disabled:bg-slate-50"
                      />
                    </label>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShortageForm(emptyShortageForm)}
                      className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
                    >
                      Clear
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !selectedVersionCanEdit}
                      className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save Alert
                    </button>
                  </div>
                </form>

                <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
                  <h2 className="text-lg font-black text-hospital-ink">Schedule Entries</h2>
                  <div className="mt-3 space-y-2">
                    {entries.length === 0 && (
                      <p className="text-sm font-bold text-slate-500">No schedule entries have been added.</p>
                    )}
                    {entries.map((entry) => {
                      const staff =
                        firstStaffProfile(entry.staff_profiles) ??
                        (entry.staff_profile_id ? staffById.get(entry.staff_profile_id) : null);

                      return (
                        <article key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-hospital-ink">
                                {entry.day_of_week} {entry.shift_date} - {shiftTypeLabels[entry.shift_type]}
                              </p>
                              <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                {formatShiftTime(entry.shift_start, entry.shift_end)} - {entryStatusLabels[entry.entry_status]}
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-700">
                                {staff?.display_name ?? "Unassigned staff"}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <StaffTypeBadge staffType={displayStaffType(staff)} />
                              <button
                                type="button"
                                onClick={() => setEntryForm(entryToForm(entry))}
                                disabled={!selectedVersionCanEdit}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-700 disabled:opacity-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteEntry(entry.id)}
                                disabled={!selectedVersionCanEdit}
                                className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-extrabold text-rose-700 disabled:opacity-50"
                              >
                                <Trash2 size={12} />
                                Delete
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
                  <h2 className="text-lg font-black text-hospital-ink">Short Shift Alerts</h2>
                  <div className="mt-3 space-y-2">
                    {shortages.length === 0 && (
                      <p className="text-sm font-bold text-slate-500">No Short Shift alerts have been added.</p>
                    )}
                    {shortages.map((shortage) => (
                      <article key={shortage.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusChip
                                status="Short Shift"
                                intensity={shortage.severity === "urgent" ? "critical" : "medium"}
                                compact
                              />
                              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                {shortageLabels[shortage.severity]}
                              </p>
                            </div>
                            <p className="mt-2 text-sm font-black text-hospital-ink">
                              {dayNameFromDate(shortage.shift_date)} {shortage.shift_date} - {shiftTypeLabels[shortage.shift_type]}
                            </p>
                            <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                              {formatShiftTime(shortage.shift_start, shortage.shift_end)}
                            </p>
                            {shortage.message && (
                              <p className="mt-1 text-sm font-bold leading-6 text-slate-700">{shortage.message}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setShortageForm(shortageToForm(shortage))}
                              disabled={!selectedVersionCanEdit}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-700 disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteShortage(shortage.id)}
                              disabled={!selectedVersionCanEdit}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-extrabold text-rose-700 disabled:opacity-50"
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
