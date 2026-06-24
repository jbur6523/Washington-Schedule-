"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, ImageIcon, Plus, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import {
  dayNameFromDate,
  shiftTypeLabels,
  type ScheduleEntryStatus,
  type ShiftShortageSeverity,
  type ShiftType
} from "@/lib/schedule/supabase-schedule";

type ImportScheduleAdminProps = {
  authContext: AuthenticatedUserContext;
};

type StaffProfile = {
  id: string;
  display_name: string;
  employment_type: "full_time" | "per_diem";
  home_assignment: string;
  is_active: boolean;
};

type SourceFilePreview = {
  id: string;
  name: string;
  type: string;
  originalSize: number;
  compressedSize: number | null;
  previewUrl: string | null;
};

type ReviewRow = {
  id: string;
  rowIndex: number;
  shift_date: string;
  day_of_week: string;
  shift_type: ShiftType | "";
  shift_start: string;
  shift_end: string;
  raw_staff_name: string;
  matched_staff_profile_id: string;
  employment_type: "full_time" | "per_diem" | "";
  entry_status: ScheduleEntryStatus | "";
  notes: string;
  confidence: number;
  needs_review: boolean;
  validation_status: string;
  removed: boolean;
};

type ShortShiftDraft = {
  id: string;
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  severity: ShiftShortageSeverity;
  message: string;
};

type VersionForm = {
  label: string;
  starts_on: string;
  ends_on: string;
  status: "draft" | "review";
};

const steps = ["Upload", "Extract/Paste", "Review", "Create Version", "Done"] as const;
const allowedFileTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const allowedShiftTypes = new Set(Object.keys(shiftTypeLabels));
const allowedEntryStatuses = new Set(["scheduled", "available"]);
const allowedShortShiftSeverities = new Set(["short", "urgent"]);
const emptyVersionForm: VersionForm = {
  label: "",
  starts_on: "",
  ends_on: "",
  status: "review"
};
const emptyShortShiftDraft: ShortShiftDraft = {
  id: "",
  shift_date: "",
  shift_type: "day_shift",
  shift_start: "07:00",
  shift_end: "19:00",
  severity: "short",
  message: ""
};

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function compactName(value: string) {
  return normalizeName(value).replace(/\s/g, "");
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function createRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function employmentLabel(value: string) {
  return value === "full_time" ? "Full-time" : value === "per_diem" ? "Per diem" : "Unknown";
}

function matchStaff(rawName: string, staffProfiles: StaffProfile[]) {
  const normalizedRaw = normalizeName(rawName);
  const compactRaw = compactName(rawName);
  const exact = staffProfiles.find(
    (profile) => normalizeName(profile.display_name) === normalizedRaw || compactName(profile.display_name) === compactRaw
  );

  if (exact) {
    return { staff: exact, confidence: 0.99, needsReview: false, status: "Matched" };
  }

  const rawTokens = normalizedRaw.split(" ").filter(Boolean);
  const suggested = staffProfiles.find((profile) => {
    const normalizedProfile = normalizeName(profile.display_name);
    const profileTokens = normalizedProfile.split(" ").filter(Boolean);

    return rawTokens.length > 0 && rawTokens.every((token) => profileTokens.some((profileToken) => profileToken.startsWith(token)));
  });

  if (suggested) {
    return { staff: suggested, confidence: 0.72, needsReview: true, status: "Suggested match" };
  }

  return { staff: null, confidence: 0.25, needsReview: true, status: "No roster match" };
}

function validateReviewRow(row: ReviewRow) {
  const issues: string[] = [];

  if (!isValidDate(row.shift_date)) {
    issues.push("date missing");
  }

  if (!row.shift_type || !Object.keys(shiftTypeLabels).includes(row.shift_type)) {
    issues.push("shift type missing");
  }

  if (!isValidTime(row.shift_start) || !isValidTime(row.shift_end)) {
    issues.push("shift time missing");
  }

  if (!row.matched_staff_profile_id) {
    issues.push("staff match missing");
  }

  if (!["scheduled", "available"].includes(row.entry_status)) {
    issues.push("status missing");
  }

  if (row.needs_review) {
    issues.push("needs review");
  }

  return issues.length ? issues.join(", ") : "Ready";
}

async function compressImage(file: File): Promise<SourceFilePreview> {
  const previewFallback = URL.createObjectURL(file);

  if (!file.type.startsWith("image/")) {
    return {
      id: createRowId(),
      name: file.name,
      type: file.type,
      originalSize: file.size,
      compressedSize: null,
      previewUrl: null
    };
  }

  const bitmap = await createImageBitmap(file);
  const maxWidth = 1800;
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return {
      id: createRowId(),
      name: file.name,
      type: file.type,
      originalSize: file.size,
      compressedSize: file.size,
      previewUrl: previewFallback
    };
  }

  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));

  return {
    id: createRowId(),
    name: file.name,
    type: file.type,
    originalSize: file.size,
    compressedSize: blob?.size ?? file.size,
    previewUrl: blob ? URL.createObjectURL(blob) : previewFallback
  };
}

export function ImportScheduleAdmin({ authContext }: ImportScheduleAdminProps) {
  const [step, setStep] = useState(0);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [sourceFiles, setSourceFiles] = useState<SourceFilePreview[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [scheduleCodeText, setScheduleCodeText] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [shortShiftDrafts, setShortShiftDrafts] = useState<ShortShiftDraft[]>([]);
  const [shortShiftForm, setShortShiftForm] = useState<ShortShiftDraft>(emptyShortShiftDraft);
  const [versionForm, setVersionForm] = useState<VersionForm>(emptyVersionForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createdVersionId, setCreatedVersionId] = useState("");

  const activeRows = useMemo(() => reviewRows.filter((row) => !row.removed), [reviewRows]);
  const summary = useMemo(() => {
    const needsReview = activeRows.filter((row) => validateReviewRow(row) !== "Ready").length;

    return {
      total: activeRows.length,
      matched: activeRows.filter((row) => row.matched_staff_profile_id).length,
      needsReview,
      scheduled: activeRows.filter((row) => row.entry_status === "scheduled").length,
      available: activeRows.filter((row) => row.entry_status === "available").length
    };
  }, [activeRows]);
  const canApprove = activeRows.length > 0 && summary.needsReview === 0;

  const staffById = useMemo(() => new Map(staffProfiles.map((profile) => [profile.id, profile])), [staffProfiles]);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: staffError } = await supabase
      .from("staff_profiles")
      .select("id, display_name, employment_type, home_assignment, is_active")
      .eq("department_id", authContext.departmentId)
      .eq("is_active", true)
      .order("display_name", { ascending: true });

    setLoading(false);

    if (staffError) {
      setError("Unable to load Staff Directory for matching.");
      return;
    }

    setStaffProfiles((data ?? []) as StaffProfile[]);
  }, [authContext.departmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStaff();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadStaff]);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const accepted = files.filter((file) => allowedFileTypes.has(file.type));

    if (accepted.length !== files.length) {
      setError("Only jpg, jpeg, png, webp, and PDF files are supported.");
    } else {
      setError("");
    }

    const previews = await Promise.all(accepted.map((file) => compressImage(file)));
    setSourceFiles((current) => [...current, ...previews]);
  };

  const parsePasteRows = () => {
    setParseErrors([]);
    const rows = pasteText
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
      .filter(({ line }) => Boolean(line))
      .map(({ line, lineNumber }) => {
        const [shiftDate = "", rawShiftType = "", shiftStart = "", shiftEnd = "", rawStaffName = "", rawStatus = ""] =
          line.split("|").map((part) => part.trim());
        const match = matchStaff(rawStaffName, staffProfiles);
        const matchedStaff = match.staff;
        const row: ReviewRow = {
          id: createRowId(),
          rowIndex: lineNumber,
          shift_date: shiftDate,
          day_of_week: isValidDate(shiftDate) ? dayNameFromDate(shiftDate) : "",
          shift_type: Object.keys(shiftTypeLabels).includes(rawShiftType) ? (rawShiftType as ShiftType) : "",
          shift_start: shiftStart,
          shift_end: shiftEnd,
          raw_staff_name: rawStaffName,
          matched_staff_profile_id: matchedStaff?.id ?? "",
          employment_type: matchedStaff?.employment_type ?? "",
          entry_status: ["scheduled", "available"].includes(rawStatus) ? (rawStatus as ScheduleEntryStatus) : "",
          notes: "",
          confidence: match.confidence,
          needs_review: match.needsReview,
          validation_status: match.status,
          removed: false
        };

        return { ...row, validation_status: validateReviewRow(row) === "Ready" ? match.status : validateReviewRow(row) };
      });

    setReviewRows(rows);
    setStep(2);
    setSuccess(`${rows.length} draft rows created for review.`);
  };

  const parseScheduleCodeBlock = () => {
    const errors: string[] = [];
    const entryRows: ReviewRow[] = [];
    const shortageRows: ShortShiftDraft[] = [];
    let parsedVersion: VersionForm | null = null;

    scheduleCodeText
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
      .filter(({ line }) => Boolean(line))
      .forEach(({ line, lineNumber }) => {
        const parts = line.split("|").map((part) => part.trim());
        const recordType = parts[0]?.toUpperCase();

        if (recordType === "SCHEDULE_VERSION") {
          const [, label = "", startsOn = "", endsOn = ""] = parts;

          if (parts.length !== 4) {
            errors.push(`Line ${lineNumber}: SCHEDULE_VERSION must use 4 fields.`);
          }

          if (!label) {
            errors.push(`Line ${lineNumber}: schedule version label is required.`);
          }

          if (!isValidDate(startsOn)) {
            errors.push(`Line ${lineNumber}: starts_on must use YYYY-MM-DD.`);
          }

          if (!isValidDate(endsOn)) {
            errors.push(`Line ${lineNumber}: ends_on must use YYYY-MM-DD.`);
          }

          parsedVersion = {
            label,
            starts_on: startsOn,
            ends_on: endsOn,
            status: "review"
          };
          return;
        }

        if (recordType === "ENTRY") {
          const [, shiftDate = "", rawShiftType = "", shiftStart = "", shiftEnd = "", rawStaffName = "", rawStatus = ""] = parts;

          if (parts.length !== 7) {
            errors.push(`Line ${lineNumber}: ENTRY must use 7 fields.`);
          }

          if (!isValidDate(shiftDate)) {
            errors.push(`Line ${lineNumber}: ENTRY date must use YYYY-MM-DD.`);
          }

          if (!allowedShiftTypes.has(rawShiftType)) {
            errors.push(`Line ${lineNumber}: invalid shift_type "${rawShiftType}".`);
          }

          if (!isValidTime(shiftStart) || !isValidTime(shiftEnd)) {
            errors.push(`Line ${lineNumber}: shift_start and shift_end must use HH:mm.`);
          }

          if (!rawStaffName) {
            errors.push(`Line ${lineNumber}: staff_name is required.`);
          }

          if (!allowedEntryStatuses.has(rawStatus)) {
            errors.push(`Line ${lineNumber}: entry_status must be scheduled or available.`);
          }

          const match = matchStaff(rawStaffName, staffProfiles);
          const matchedStaff = match.staff;
          const row: ReviewRow = {
            id: createRowId(),
            rowIndex: entryRows.length + 1,
            shift_date: shiftDate,
            day_of_week: isValidDate(shiftDate) ? dayNameFromDate(shiftDate) : "",
            shift_type: allowedShiftTypes.has(rawShiftType) ? (rawShiftType as ShiftType) : "",
            shift_start: shiftStart,
            shift_end: shiftEnd,
            raw_staff_name: rawStaffName,
            matched_staff_profile_id: matchedStaff?.id ?? "",
            employment_type: matchedStaff?.employment_type ?? "",
            entry_status: allowedEntryStatuses.has(rawStatus) ? (rawStatus as ScheduleEntryStatus) : "",
            notes: "",
            confidence: match.confidence,
            needs_review: match.needsReview,
            validation_status: match.status,
            removed: false
          };

          entryRows.push({ ...row, validation_status: validateReviewRow(row) === "Ready" ? match.status : validateReviewRow(row) });
          return;
        }

        if (recordType === "SHORT_SHIFT") {
          const [, shiftDate = "", rawShiftType = "", shiftStart = "", shiftEnd = "", rawSeverity = "", message = ""] = parts;

          if (parts.length !== 7) {
            errors.push(`Line ${lineNumber}: SHORT_SHIFT must use 7 fields.`);
          }

          if (!isValidDate(shiftDate)) {
            errors.push(`Line ${lineNumber}: SHORT_SHIFT date must use YYYY-MM-DD.`);
          }

          if (!allowedShiftTypes.has(rawShiftType)) {
            errors.push(`Line ${lineNumber}: invalid Short Shift shift_type "${rawShiftType}".`);
          }

          if (!isValidTime(shiftStart) || !isValidTime(shiftEnd)) {
            errors.push(`Line ${lineNumber}: Short Shift start/end must use HH:mm.`);
          }

          if (!allowedShortShiftSeverities.has(rawSeverity)) {
            errors.push(`Line ${lineNumber}: Short Shift severity must be short or urgent.`);
          }

          if (isValidDate(shiftDate) && allowedShiftTypes.has(rawShiftType) && isValidTime(shiftStart) && isValidTime(shiftEnd) && allowedShortShiftSeverities.has(rawSeverity)) {
            shortageRows.push({
              id: createRowId(),
              shift_date: shiftDate,
              shift_type: rawShiftType as ShiftType,
              shift_start: shiftStart,
              shift_end: shiftEnd,
              severity: rawSeverity as ShiftShortageSeverity,
              message: message.slice(0, 140)
            });
          }
          return;
        }

        errors.push(`Line ${lineNumber}: unknown record type "${parts[0] ?? ""}".`);
      });

    if (!parsedVersion) {
      errors.push("SCHEDULE_VERSION line is required.");
    }

    setParseErrors(errors);

    if (errors.length > 0 || !parsedVersion) {
      setError("Schedule code has parse errors. Fix them before continuing.");
      return;
    }

    setError("");
    setVersionForm(parsedVersion);
    setReviewRows(entryRows);
    setShortShiftDrafts(shortageRows);
    setStep(2);
    setSuccess(`${entryRows.length} ENTRY rows and ${shortageRows.length} SHORT_SHIFT alerts parsed for review.`);
  };

  const updateRow = (rowId: string, patch: Partial<ReviewRow>) => {
    setReviewRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) {
          return row;
        }

        const next = { ...row, ...patch };

        if (patch.shift_date) {
          next.day_of_week = isValidDate(patch.shift_date) ? dayNameFromDate(patch.shift_date) : "";
        }

        if (patch.matched_staff_profile_id !== undefined) {
          const staff = staffById.get(patch.matched_staff_profile_id);
          next.employment_type = staff?.employment_type ?? "";
          next.raw_staff_name = next.raw_staff_name || staff?.display_name || "";
        }

        next.validation_status = validateReviewRow(next);
        return next;
      })
    );
  };

  const addManualRow = () => {
    setReviewRows((current) => [
      ...current,
      {
        id: createRowId(),
        rowIndex: current.length + 1,
        shift_date: "",
        day_of_week: "",
        shift_type: "day_shift",
        shift_start: "07:00",
        shift_end: "19:00",
        raw_staff_name: "",
        matched_staff_profile_id: "",
        employment_type: "",
        entry_status: "scheduled",
        notes: "",
        confidence: 0,
        needs_review: true,
        validation_status: "needs review",
        removed: false
      }
    ]);
    setStep(2);
  };

  const addShortShift = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draft = { ...shortShiftForm, id: shortShiftForm.id || createRowId(), message: shortShiftForm.message.slice(0, 140) };

    setShortShiftDrafts((current) => {
      if (shortShiftForm.id) {
        return current.map((item) => (item.id === shortShiftForm.id ? draft : item));
      }

      return [...current, draft];
    });
    setShortShiftForm(emptyShortShiftDraft);
  };

  const saveImport = async (publish: boolean) => {
    if (!canApprove) {
      setError("Resolve all Needs Review rows before creating a schedule version.");
      return;
    }

    if (!versionForm.label.trim()) {
      setError("Schedule version label is required.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const sourceFilename = sourceFiles.map((file) => file.name).join(", ").slice(0, 500) || "Manual structured paste";
    const originalSize = sourceFiles.reduce((total, file) => total + file.originalSize, 0);
    const compressedSize = sourceFiles.reduce((total, file) => total + (file.compressedSize ?? file.originalSize), 0);
    const { data: importRecord, error: importError } = await supabase
      .from("schedule_imports")
      .insert({
        department_id: authContext.departmentId,
        status: "approved",
        source_filename: sourceFilename,
        original_size_bytes: originalSize || null,
        compressed_size_bytes: compressedSize || null,
        image_storage_path: null,
        created_by: authContext.profileId,
        approved_by: authContext.profileId,
        approved_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (importError || !importRecord?.id) {
      setSaving(false);
      setError("Unable to create import record.");
      return;
    }

    const importId = importRecord.id as string;
    const { error: rowsError } = await supabase.from("schedule_import_rows").insert(
      activeRows.map((row, index) => ({
        schedule_import_id: importId,
        row_index: index + 1,
        shift_date: row.shift_date,
        day_of_week: row.day_of_week,
        shift_type: row.shift_type,
        shift_start: row.shift_start,
        shift_end: row.shift_end,
        shift_time: `${row.shift_start}-${row.shift_end}`,
        raw_staff_name: row.raw_staff_name,
        matched_staff_profile_id: row.matched_staff_profile_id,
        employment_type: row.employment_type || null,
        status: row.entry_status,
        notes: row.notes || null,
        confidence: row.confidence,
        needs_review: false,
        validation_status: "Ready"
      }))
    );

    if (rowsError) {
      setSaving(false);
      setError("Import record was created, but review rows could not be saved. Confirm the Phase 8 migration is applied.");
      return;
    }

    const { data: version, error: versionError } = await supabase
      .from("schedule_versions")
      .insert({
        department_id: authContext.departmentId,
        label: versionForm.label.trim(),
        starts_on: versionForm.starts_on || null,
        ends_on: versionForm.ends_on || null,
        status: publish ? "published" : versionForm.status,
        created_by: authContext.profileId,
        published_at: publish ? new Date().toISOString() : null,
        published_by: publish ? authContext.profileId : null
      })
      .select("id")
      .single();

    if (versionError || !version?.id) {
      setSaving(false);
      setError("Unable to create schedule version.");
      return;
    }

    const versionId = version.id as string;
    const { error: entriesError } = await supabase.from("schedule_entries").insert(
      activeRows.map((row) => ({
        schedule_version_id: versionId,
        department_id: authContext.departmentId,
        staff_profile_id: row.matched_staff_profile_id,
        shift_date: row.shift_date,
        day_of_week: row.day_of_week,
        shift_type: row.shift_type,
        shift_start: row.shift_start,
        shift_end: row.shift_end,
        entry_status: row.entry_status
      }))
    );

    if (entriesError) {
      setSaving(false);
      setError("Schedule version was created, but entries could not be saved.");
      return;
    }

    if (shortShiftDrafts.length > 0) {
      const { error: shortagesError } = await supabase.from("shift_shortages").insert(
        shortShiftDrafts.map((shortage) => ({
          schedule_version_id: versionId,
          department_id: authContext.departmentId,
          shift_date: shortage.shift_date,
          shift_type: shortage.shift_type,
          shift_start: shortage.shift_start,
          shift_end: shortage.shift_end,
          severity: shortage.severity,
          status: "active",
          message: shortage.message.trim() || null
        }))
      );

      if (shortagesError) {
        setSaving(false);
        setError("Schedule entries were created, but Short Shift alerts could not be saved.");
        return;
      }
    }

    if (publish) {
      const { error: publishError } = await supabase
        .from("departments")
        .update({ active_schedule_version_id: versionId })
        .eq("id", authContext.departmentId);

      if (publishError) {
        setSaving(false);
        setError("Version was published, but could not be set active.");
        return;
      }
    }

    setSaving(false);
    setCreatedVersionId(versionId);
    setStep(4);
    setSuccess(publish ? "Schedule imported, published, and set active." : "Schedule imported and saved for review.");
  };

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-extrabold text-cyan-700">
            <ArrowLeft size={16} />
            Admin
          </Link>
          <p className="mt-4 text-xs font-extrabold uppercase tracking-wide text-cyan-700">Import Schedule</p>
          <h1 className="mt-1 text-2xl font-black text-hospital-ink">Review-first schedule import</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Not the official hospital schedule. Staff-managed coordination view only.
          </p>
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">
            Crop photos to staffing schedule only. Do not upload patient information. If a person is crossed out on the source schedule, remove that row before approval.
          </p>
          <div className="mt-4 grid grid-cols-5 gap-1">
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index)}
                className={`min-h-10 rounded-xl px-1 text-[10px] font-black ${
                  step === index ? "bg-cyan-700 text-white" : "bg-slate-50 text-slate-500"
                }`}
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
        {success && <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{success}</p>}

        {step === 0 && (
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-xl font-black text-hospital-ink">Upload Source</h2>
            <label className="mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-cyan-200 bg-cyan-50/70 px-4 py-6 text-center">
              <UploadCloud className="text-cyan-700" size={30} />
              <span className="mt-2 text-sm font-black text-hospital-ink">Upload images or PDF</span>
              <span className="mt-1 text-xs font-bold leading-5 text-slate-500">jpg, jpeg, png, webp, pdf. Multiple images are supported.</span>
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => void handleFiles(event)}
                className="sr-only"
              />
            </label>
            <p className="mt-3 text-xs font-bold leading-5 text-slate-500">
              Images are resized in the browser to about 1800px wide at JPEG quality 0.82. Raw source files are not stored permanently in this phase.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {sourceFiles.map((file) => (
                <article key={file.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-cyan-700">
                      {file.previewUrl ? <ImageIcon size={18} /> : <FileText size={18} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-hospital-ink">{file.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">Original: {formatBytes(file.originalSize)}</p>
                      <p className="text-xs font-bold text-slate-500">
                        Compressed: {file.compressedSize ? formatBytes(file.compressedSize) : "Not compressed"}
                      </p>
                    </div>
                  </div>
                  {file.previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.previewUrl} alt="" className="mt-3 max-h-48 w-full rounded-2xl object-cover" />
                  )}
                </article>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-4 min-h-11 w-full rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white"
            >
              Continue to Extract/Paste
            </button>
          </section>
        )}

        {step === 1 && (
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-xl font-black text-hospital-ink">Extract / Enter Rows</h2>
            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
              <p className="text-sm font-black text-hospital-ink">Draft extraction placeholder</p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                OCR is not enabled yet. Use structured paste now; every row remains editable before approval.
              </p>
            </div>

            <div className="mt-4 rounded-3xl border border-cyan-100 bg-cyan-50/70 p-3">
              <h3 className="text-lg font-black text-hospital-ink">Schedule Code Import</h3>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-600">
                Paste a schedule code block generated outside the app. This is structured schedule data, not app source code.
              </p>
              <p className="mt-2 text-xs font-bold leading-5 text-cyan-900">
                Required records: SCHEDULE_VERSION, ENTRY, and optional SHORT_SHIFT. Blank lines are ignored.
              </p>
              <textarea
                value={scheduleCodeText}
                onChange={(event) => setScheduleCodeText(event.target.value)}
                placeholder={"SCHEDULE_VERSION | Week of June 24 | 2026-06-21 | 2026-06-27\n\nENTRY | 2026-06-24 | day_shift | 07:00 | 19:00 | Jonathan Burdick | scheduled\nENTRY | 2026-06-24 | night_shift | 19:00 | 07:00 | Joann Devera | scheduled\n\nSHORT_SHIFT | 2026-06-24 | night_shift | 19:00 | 07:00 | urgent | Night shift short one RT"}
                className="mt-3 min-h-56 w-full rounded-2xl border border-cyan-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400"
              />
              {parseErrors.length > 0 && (
                <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2">
                  <p className="text-sm font-black text-rose-800">Parse errors</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs font-bold leading-5 text-rose-700">
                    {parseErrors.map((parseError) => (
                      <li key={parseError}>{parseError}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                type="button"
                onClick={parseScheduleCodeBlock}
                disabled={!scheduleCodeText.trim() || loading}
                className="mt-3 min-h-11 w-full rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:opacity-50"
              >
                Parse Schedule Code
              </button>
            </div>

            <p className="mt-4 text-sm font-bold leading-6 text-slate-500">
              Simple row paste format: 2026-06-24 | day_shift | 07:00 | 19:00 | Jonathan Burdick | scheduled
            </p>
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={"2026-06-24 | day_shift | 07:00 | 19:00 | Jonathan Burdick | scheduled\n2026-06-24 | night_shift | 19:00 | 07:00 | Joann Devera | scheduled"}
              className="mt-3 min-h-52 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={addManualRow}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 text-sm font-extrabold text-cyan-700"
              >
                <Plus size={15} />
                Add Row
              </button>
              <button
                type="button"
                onClick={parsePasteRows}
                disabled={!pasteText.trim() || loading}
                className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:opacity-50"
              >
                Create Draft Rows
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-hospital-ink">Review Rows</h2>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                  Edit each row, remove crossed-out names, and clear review flags only when correct.
                </p>
              </div>
              <button type="button" onClick={addManualRow} className="rounded-full bg-cyan-700 p-3 text-white">
                <Plus size={17} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-1 text-center">
              {[
                ["Total", summary.total],
                ["Matched", summary.matched],
                ["Needs review", summary.needsReview],
                ["Scheduled", summary.scheduled],
                ["Available", summary.available]
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-1 py-2">
                  <p className="text-base font-black text-hospital-ink">{value}</p>
                  <p className="text-[9px] font-extrabold uppercase leading-3 text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {reviewRows.length === 0 && (
                <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">No draft rows yet.</p>
              )}
              {reviewRows.map((row) => {
                const staff = staffById.get(row.matched_staff_profile_id);
                const validation = validateReviewRow(row);

                return (
                  <article
                    key={row.id}
                    className={`rounded-3xl border p-3 ${
                      row.removed
                        ? "border-slate-100 bg-slate-100 opacity-60"
                        : validation === "Ready"
                          ? "border-emerald-100 bg-emerald-50/60"
                          : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-hospital-ink">Row {row.rowIndex}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{validation}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { removed: !row.removed })}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-white px-3 py-1 text-xs font-extrabold text-rose-700"
                      >
                        <Trash2 size={12} />
                        {row.removed ? "Restore" : "Remove"}
                      </button>
                    </div>
                    {!row.removed && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Date</span>
                          <input
                            type="date"
                            value={row.shift_date}
                            onChange={(event) => updateRow(row.id, { shift_date: event.target.value })}
                            className="mt-1 min-h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Shift type</span>
                          <select
                            value={row.shift_type}
                            onChange={(event) => updateRow(row.id, { shift_type: event.target.value as ShiftType })}
                            className="mt-1 min-h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                          >
                            <option value="">Select shift</option>
                            {Object.entries(shiftTypeLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Start</span>
                            <input
                              type="time"
                              value={row.shift_start}
                              onChange={(event) => updateRow(row.id, { shift_start: event.target.value })}
                              className="mt-1 min-h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">End</span>
                            <input
                              type="time"
                              value={row.shift_end}
                              onChange={(event) => updateRow(row.id, { shift_end: event.target.value })}
                              className="mt-1 min-h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Raw staff name</span>
                          <input
                            value={row.raw_staff_name}
                            onChange={(event) => updateRow(row.id, { raw_staff_name: event.target.value, needs_review: true })}
                            className="mt-1 min-h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Matched staff profile</span>
                          <select
                            value={row.matched_staff_profile_id}
                            onChange={(event) => updateRow(row.id, { matched_staff_profile_id: event.target.value, needs_review: false, confidence: 0.95 })}
                            className="mt-1 min-h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                          >
                            <option value="">Select staff member</option>
                            {staffProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.display_name}
                              </option>
                            ))}
                          </select>
                          <span className="mt-1 block text-xs font-bold text-slate-500">
                            {staff ? `${employmentLabel(staff.employment_type)} - confidence ${Math.round(row.confidence * 100)}%` : "No match selected"}
                          </span>
                        </label>
                        <label className="block">
                          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Status</span>
                          <select
                            value={row.entry_status}
                            onChange={(event) => updateRow(row.id, { entry_status: event.target.value as ScheduleEntryStatus })}
                            className="mt-1 min-h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                          >
                            <option value="">Select status</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="available">Available</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Notes</span>
                          <input
                            value={row.notes}
                            onChange={(event) => updateRow(row.id, { notes: event.target.value.slice(0, 140) })}
                            className="mt-1 min-h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                          <button
                            type="button"
                            onClick={() => updateRow(row.id, { needs_review: true })}
                            className="min-h-10 rounded-2xl border border-amber-200 bg-white px-3 text-sm font-extrabold text-amber-800"
                          >
                            Mark needs review
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRow(row.id, { needs_review: false })}
                            className="min-h-10 rounded-2xl bg-emerald-600 px-3 text-sm font-extrabold text-white"
                          >
                            Clear needs review
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-4 min-h-11 w-full rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white"
            >
              Continue to Create Version
            </button>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <h2 className="text-xl font-black text-hospital-ink">Create Schedule Version</h2>
              {!canApprove && (
                <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                  Approval is blocked until all required fields and Needs Review rows are resolved.
                </p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Label</span>
                  <input
                    value={versionForm.label}
                    onChange={(event) => setVersionForm({ ...versionForm, label: event.target.value })}
                    placeholder="June 24-30 Schedule"
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Starts on</span>
                  <input
                    type="date"
                    value={versionForm.starts_on}
                    onChange={(event) => setVersionForm({ ...versionForm, starts_on: event.target.value })}
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Ends on</span>
                  <input
                    type="date"
                    value={versionForm.ends_on}
                    onChange={(event) => setVersionForm({ ...versionForm, ends_on: event.target.value })}
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Save status</span>
                  <select
                    value={versionForm.status}
                    onChange={(event) => setVersionForm({ ...versionForm, status: event.target.value as "draft" | "review" })}
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                  >
                    <option value="review">Review</option>
                    <option value="draft">Draft</option>
                  </select>
                </label>
              </div>
            </section>

            <form onSubmit={addShortShift} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <h2 className="text-xl font-black text-hospital-ink">Short Shift Alerts</h2>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">Optional shift-level alerts. Short Shift is never attached to a staff member.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <input type="date" value={shortShiftForm.shift_date} onChange={(event) => setShortShiftForm({ ...shortShiftForm, shift_date: event.target.value })} required className="min-h-10 rounded-2xl border border-slate-200 px-3 text-sm font-bold" />
                <select value={shortShiftForm.shift_type} onChange={(event) => setShortShiftForm({ ...shortShiftForm, shift_type: event.target.value as ShiftType })} className="min-h-10 rounded-2xl border border-slate-200 px-3 text-sm font-bold">
                  {Object.entries(shiftTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input type="time" value={shortShiftForm.shift_start} onChange={(event) => setShortShiftForm({ ...shortShiftForm, shift_start: event.target.value })} required className="min-h-10 rounded-2xl border border-slate-200 px-3 text-sm font-bold" />
                <input type="time" value={shortShiftForm.shift_end} onChange={(event) => setShortShiftForm({ ...shortShiftForm, shift_end: event.target.value })} required className="min-h-10 rounded-2xl border border-slate-200 px-3 text-sm font-bold" />
                <select value={shortShiftForm.severity} onChange={(event) => setShortShiftForm({ ...shortShiftForm, severity: event.target.value as ShiftShortageSeverity })} className="min-h-10 rounded-2xl border border-slate-200 px-3 text-sm font-bold">
                  <option value="short">Short</option>
                  <option value="urgent">Urgent</option>
                </select>
                <input value={shortShiftForm.message} onChange={(event) => setShortShiftForm({ ...shortShiftForm, message: event.target.value.slice(0, 140) })} placeholder="Message" className="min-h-10 rounded-2xl border border-slate-200 px-3 text-sm font-bold" />
              </div>
              <button type="submit" className="mt-3 min-h-10 w-full rounded-2xl bg-amber-500 px-3 text-sm font-extrabold text-amber-950">Add Short Shift</button>
              {shortShiftDrafts.length > 0 && (
                <div className="mt-3 space-y-2">
                  {shortShiftDrafts.map((shortage) => (
                    <div key={shortage.id} className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-3 py-2">
                      <p className="text-sm font-bold text-amber-950">{shortage.shift_date} - {shiftTypeLabels[shortage.shift_type]} - {shortage.severity}</p>
                      <button type="button" onClick={() => setShortShiftDrafts((current) => current.filter((item) => item.id !== shortage.id))} className="text-xs font-black text-rose-700">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </form>

            <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <div className="grid grid-cols-5 gap-1 text-center">
                {[
                  ["Rows", summary.total],
                  ["Matched", summary.matched],
                  ["Review", summary.needsReview],
                  ["Short", shortShiftDrafts.length],
                  ["Files", sourceFiles.length]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 px-1 py-2">
                    <p className="text-base font-black text-hospital-ink">{value}</p>
                    <p className="text-[9px] font-extrabold uppercase text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void saveImport(false)}
                  disabled={saving || !canApprove}
                  className="min-h-11 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 text-sm font-extrabold text-cyan-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save as Draft/Review"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveImport(true)}
                  disabled={saving || !canApprove}
                  className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:opacity-50"
                >
                  Save and Publish
                </button>
              </div>
            </section>
          </section>
        )}

        {step === 4 && (
          <section className="rounded-3xl border border-white bg-white/95 p-5 text-center shadow-soft">
            <CheckCircle2 className="mx-auto text-emerald-600" size={38} />
            <h2 className="mt-3 text-2xl font-black text-hospital-ink">Import complete</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">{success || "Schedule version created."}</p>
            <div className="mt-5 grid gap-2">
              <Link href="/admin/schedule-versions" className="min-h-11 rounded-2xl bg-cyan-700 px-4 py-3 text-sm font-extrabold text-white">
                View Schedule Versions
              </Link>
              <Link href="/" className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-700">
                Back to Schedule
              </Link>
              {createdVersionId && <p className="text-xs font-bold text-slate-400">Version ID: {createdVersionId}</p>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
