"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, ImageIcon, Plus, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import {
  dayNameFromDate,
  standardTimesForShiftType,
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
  username: string | null;
  username_normalized: string | null;
  employment_type: "full_time" | "per_diem";
  home_assignment: string;
  is_active: boolean;
};

type StaffMatchSource = "username" | "display_name" | "full_name" | "last_name" | "manual_review" | "unmatched" | "ambiguous";
type ImportMode = "create_new" | "append_current";
type ImportRowStatus = "new" | "already_exists" | "needs_review";

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
  original_staff_identifier: string;
  staff_identifier: string;
  raw_staff_name: string;
  matched_staff_profile_id: string;
  employment_type: "full_time" | "per_diem" | "";
  match_source: StaffMatchSource;
  entry_status: ScheduleEntryStatus | "";
  is_shift_lead: boolean;
  notes: string;
  confidence: number;
  needs_review: boolean;
  validation_status: string;
  import_status: ImportRowStatus;
  import_note: string;
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
  import_status: ImportRowStatus;
  import_note: string;
  removed: boolean;
};

type ActiveVersionSummary = {
  id: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
};

type ExistingScheduleEntry = {
  id: string;
  staff_profile_id: string;
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  entry_status: ScheduleEntryStatus;
};

type ExistingShortShift = {
  id: string;
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
  severity: ShiftShortageSeverity;
  message: string | null;
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
type ReviewFilter = "all" | "needs_review";
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
  shift_start: "06:30",
  shift_end: "19:00",
  severity: "short",
  message: "",
  import_status: "new",
  import_note: "New row",
  removed: false
};

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

function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripComment(value: string) {
  return value.split("#")[0]?.trim() ?? "";
}

function parseLeadField(value: string) {
  return ["lead", "shift_lead", "true"].includes(value.trim().toLowerCase());
}

function parseStaffIdentifierLeadMarker(value: string, leadField = "") {
  let staffIdentifier = value.trim();
  let isShiftLead = parseLeadField(leadField);
  const leadMarkerPatterns = [
    /\(\s*l\s*\)/gi,
    /\(\s*lead\s*\)/gi,
    /\bshift\s+lead\b/gi,
    /\blead\b/gi,
    /\s+-\s*l\s*$/gi,
    /-l\s*$/gi
  ];

  leadMarkerPatterns.forEach((pattern) => {
    if (pattern.test(staffIdentifier)) {
      isShiftLead = true;
      staffIdentifier = staffIdentifier.replace(pattern, " ");
    }
  });

  return {
    staffIdentifier: staffIdentifier.replace(/\s+/g, " ").trim(),
    isShiftLead
  };
}

function lastNameFromDisplayName(value: string) {
  return normalizeName(value).split(" ").filter(Boolean).at(-1) ?? "";
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

function matchSourceLabel(value: StaffMatchSource) {
  const labels: Record<StaffMatchSource, string> = {
    username: "Username match",
    display_name: "Display name match",
    full_name: "Full name match",
    last_name: "Last name match",
    manual_review: "Manual review",
    unmatched: "Unmatched",
    ambiguous: "Ambiguous"
  };

  return labels[value];
}

function matchStaff(staffIdentifier: string, staffProfiles: StaffProfile[]) {
  const normalizedIdentifier = normalizeName(staffIdentifier);
  const compactIdentifier = compactName(staffIdentifier);
  const usernameIdentifier = normalizeUsername(staffIdentifier);
  const usernameMatch = staffProfiles.find(
    (profile) => normalizeUsername(profile.username_normalized ?? profile.username ?? "") === usernameIdentifier
  );

  if (usernameMatch) {
    return { staff: usernameMatch, confidence: 1, needsReview: false, status: "Username match", source: "username" as StaffMatchSource };
  }

  const exactDisplayMatch = staffProfiles.find((profile) => profile.display_name.trim().toLowerCase() === staffIdentifier.trim().toLowerCase());

  if (exactDisplayMatch) {
    return { staff: exactDisplayMatch, confidence: 0.98, needsReview: false, status: "Display name match", source: "display_name" as StaffMatchSource };
  }

  const exactFullNameMatch = staffProfiles.find((profile) => compactName(profile.display_name) === compactIdentifier);

  if (exactFullNameMatch) {
    return { staff: exactFullNameMatch, confidence: 0.96, needsReview: false, status: "Full name match", source: "full_name" as StaffMatchSource };
  }

  const lastNameMatches = staffProfiles.filter((profile) => lastNameFromDisplayName(profile.display_name) === normalizedIdentifier);

  if (lastNameMatches.length === 1) {
    return { staff: lastNameMatches[0], confidence: 0.88, needsReview: false, status: "Last name match", source: "last_name" as StaffMatchSource };
  }

  if (lastNameMatches.length > 1) {
    return { staff: null, confidence: 0.35, needsReview: true, status: "Ambiguous last name", source: "ambiguous" as StaffMatchSource };
  }

  return { staff: null, confidence: 0.25, needsReview: true, status: "No roster match", source: "unmatched" as StaffMatchSource };
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

function reviewRowPriority(row: ReviewRow) {
  if (row.removed) {
    return 5;
  }

  if (row.needs_review || row.import_status === "needs_review") {
    return 0;
  }

  if (!row.matched_staff_profile_id || row.match_source === "unmatched") {
    return 1;
  }

  if (row.matched_staff_profile_id && row.confidence > 0 && row.confidence < 0.9) {
    return 2;
  }

  if (validateReviewRow(row) !== "Ready") {
    return 3;
  }

  return 4;
}

function entryKey(row: {
  shift_date: string;
  shift_type: string;
  shift_start: string;
  shift_end: string;
  matched_staff_profile_id?: string;
  staff_profile_id?: string;
  entry_status: string;
}) {
  return [
    row.shift_date,
    row.shift_type,
    row.shift_start,
    row.shift_end,
    row.matched_staff_profile_id ?? row.staff_profile_id ?? "",
    row.entry_status
  ].join("|");
}

function staffShiftKey(row: {
  shift_date: string;
  shift_type: string;
  matched_staff_profile_id?: string;
  staff_profile_id?: string;
}) {
  return [row.shift_date, row.shift_type, row.matched_staff_profile_id ?? row.staff_profile_id ?? ""].join("|");
}

function shortShiftKey(row: {
  shift_date: string;
  shift_type: string;
  shift_start: string;
  shift_end: string;
  severity: string;
  message: string | null;
}) {
  return [
    row.shift_date,
    row.shift_type,
    row.shift_start,
    row.shift_end,
    row.severity,
    (row.message ?? "").trim()
  ].join("|");
}

function rangeFromDates(dates: string[]) {
  const validDates = dates.filter(isValidDate).sort();

  if (validDates.length === 0) {
    return { startsOn: "", endsOn: "" };
  }

  return { startsOn: validDates[0], endsOn: validDates[validDates.length - 1] };
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
  const [importMode, setImportMode] = useState<ImportMode>("create_new");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [activeVersion, setActiveVersion] = useState<ActiveVersionSummary | null>(null);
  const [existingEntries, setExistingEntries] = useState<ExistingScheduleEntry[]>([]);
  const [existingShortages, setExistingShortages] = useState<ExistingShortShift[]>([]);
  const [expandRangeConfirmed, setExpandRangeConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createdVersionId, setCreatedVersionId] = useState("");

  const activeRows = useMemo(() => reviewRows.filter((row) => !row.removed), [reviewRows]);
  const displayedReviewRows = useMemo(
    () =>
      reviewRows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => reviewFilter === "all" || reviewRowPriority(row) < 4)
        .sort((left, right) => {
          const priorityDifference = reviewRowPriority(left.row) - reviewRowPriority(right.row);

          if (priorityDifference !== 0) {
            return priorityDifference;
          }

          return left.index - right.index;
        })
        .map(({ row }) => row),
    [reviewFilter, reviewRows]
  );
  const activeShortShiftDrafts = useMemo(
    () => shortShiftDrafts.filter((shortage) => !shortage.removed),
    [shortShiftDrafts]
  );
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
  const importedDateRange = useMemo(() => {
    const dates = [
      ...activeRows.map((row) => row.shift_date),
      ...activeShortShiftDrafts.map((shortage) => shortage.shift_date),
      versionForm.starts_on,
      versionForm.ends_on
    ];

    return rangeFromDates(dates);
  }, [activeRows, activeShortShiftDrafts, versionForm.ends_on, versionForm.starts_on]);
  const rangeExpansion = useMemo(() => {
    if (importMode !== "append_current" || !activeVersion) {
      return { needed: false, startsOn: activeVersion?.starts_on ?? "", endsOn: activeVersion?.ends_on ?? "" };
    }

    const currentStart = activeVersion.starts_on || importedDateRange.startsOn;
    const currentEnd = activeVersion.ends_on || importedDateRange.endsOn;
    const nextStart =
      importedDateRange.startsOn && currentStart
        ? importedDateRange.startsOn < currentStart
          ? importedDateRange.startsOn
          : currentStart
        : currentStart || importedDateRange.startsOn;
    const nextEnd =
      importedDateRange.endsOn && currentEnd
        ? importedDateRange.endsOn > currentEnd
          ? importedDateRange.endsOn
          : currentEnd
        : currentEnd || importedDateRange.endsOn;

    return {
      needed: Boolean((nextStart && nextStart !== activeVersion.starts_on) || (nextEnd && nextEnd !== activeVersion.ends_on)),
      startsOn: nextStart,
      endsOn: nextEnd
    };
  }, [activeVersion, importMode, importedDateRange.endsOn, importedDateRange.startsOn]);
  const canApprove =
    activeRows.length + activeShortShiftDrafts.length > 0 &&
    summary.needsReview === 0 &&
    (importMode !== "append_current" || !rangeExpansion.needed || expandRangeConfirmed);

  const staffById = useMemo(() => new Map(staffProfiles.map((profile) => [profile.id, profile])), [staffProfiles]);

  const annotateRowsForImportMode = useCallback(
    (rows: ReviewRow[]) => {
      if (importMode !== "append_current" || !activeVersion) {
        return rows.map((row) => ({
          ...row,
          import_status: validateReviewRow(row) === "Ready" ? ("new" as ImportRowStatus) : ("needs_review" as ImportRowStatus),
          import_note: validateReviewRow(row) === "Ready" ? "New row" : validateReviewRow(row),
          removed: false
        }));
      }

      const exactExisting = new Set(existingEntries.map((entry) => entryKey(entry)));
      const existingByStaffShift = new Map<string, ExistingScheduleEntry[]>();

      existingEntries.forEach((entry) => {
        const current = existingByStaffShift.get(staffShiftKey(entry)) ?? [];
        current.push(entry);
        existingByStaffShift.set(staffShiftKey(entry), current);
      });

      return rows.map((row) => {
        const validation = validateReviewRow(row);

        if (validation !== "Ready") {
          return {
            ...row,
            import_status: "needs_review" as ImportRowStatus,
            import_note: validation,
            removed: false,
            needs_review: true,
            validation_status: validation
          };
        }

        if (exactExisting.has(entryKey(row))) {
          return {
            ...row,
            import_status: "already_exists" as ImportRowStatus,
            import_note: "Already exists / skipped",
            removed: true,
            needs_review: false,
            validation_status: "Already exists / skipped"
          };
        }

        const relatedExisting = existingByStaffShift.get(staffShiftKey(row)) ?? [];
        const statusConflict = relatedExisting.some(
          (entry) => entry.shift_start === row.shift_start && entry.shift_end === row.shift_end && entry.entry_status !== row.entry_status
        );
        const timeConflict = relatedExisting.some(
          (entry) => entry.shift_start !== row.shift_start || entry.shift_end !== row.shift_end
        );

        if (statusConflict || timeConflict) {
          const message = statusConflict
            ? "Same staff/date/shift exists with different status"
            : "Same staff/date/shift exists with different times";
          return {
            ...row,
            import_status: "needs_review" as ImportRowStatus,
            import_note: message,
            removed: false,
            needs_review: true,
            validation_status: message
          };
        }

        return {
          ...row,
          import_status: "new" as ImportRowStatus,
          import_note: "New row",
          removed: false,
          needs_review: false,
          validation_status: row.validation_status === "Ready" ? "Ready" : row.validation_status
        };
      });
    },
    [activeVersion, existingEntries, importMode]
  );

  const annotateShortShiftsForImportMode = useCallback(
    (shortages: ShortShiftDraft[]) => {
      if (importMode !== "append_current" || !activeVersion) {
        return shortages.map((shortage) => ({
          ...shortage,
          import_status: "new" as ImportRowStatus,
          import_note: "New row",
          removed: false
        }));
      }

      const existing = new Set(existingShortages.map((shortage) => shortShiftKey(shortage)));

      return shortages.map((shortage) => {
        if (existing.has(shortShiftKey(shortage))) {
          return {
            ...shortage,
            import_status: "already_exists" as ImportRowStatus,
            import_note: "Already exists / skipped",
            removed: true
          };
        }

        return {
          ...shortage,
          import_status: "new" as ImportRowStatus,
          import_note: "New row",
          removed: false
        };
      });
    },
    [activeVersion, existingShortages, importMode]
  );

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const [{ data, error: staffError }, { data: department, error: departmentError }] = await Promise.all([
      supabase
        .from("staff_profiles")
        .select("id, display_name, username, username_normalized, employment_type, home_assignment, is_active")
        .eq("department_id", authContext.departmentId)
        .eq("is_active", true)
        .order("display_name", { ascending: true }),
      supabase
        .from("departments")
        .select("active_schedule_version_id")
        .eq("id", authContext.departmentId)
        .maybeSingle()
    ]);

    setLoading(false);

    if (staffError) {
      setError("Unable to load Staff Directory for matching.");
      return;
    }

    setStaffProfiles((data ?? []) as StaffProfile[]);

    if (departmentError) {
      setError("Unable to load current active schedule version.");
      return;
    }

    const activeVersionId = department?.active_schedule_version_id as string | null | undefined;

    if (!activeVersionId) {
      setActiveVersion(null);
      setExistingEntries([]);
      setExistingShortages([]);
      setImportMode("create_new");
      return;
    }

    const [
      { data: versionData, error: versionError },
      { data: entriesData, error: entriesError },
      { data: shortageData, error: shortageError }
    ] = await Promise.all([
      supabase
        .from("schedule_versions")
        .select("id, label, starts_on, ends_on")
        .eq("id", activeVersionId)
        .maybeSingle(),
      supabase
        .from("schedule_entries")
        .select("id, staff_profile_id, shift_date, shift_type, shift_start, shift_end, entry_status")
        .eq("schedule_version_id", activeVersionId),
      supabase
        .from("shift_shortages")
        .select("id, shift_date, shift_type, shift_start, shift_end, severity, message")
        .eq("schedule_version_id", activeVersionId)
        .eq("status", "active")
    ]);

    if (versionError || entriesError || shortageError || !versionData) {
      setError("Unable to load existing schedule rows for duplicate checks.");
      return;
    }

    setActiveVersion(versionData as ActiveVersionSummary);
    setExistingEntries((entriesData ?? []) as ExistingScheduleEntry[]);
    setExistingShortages((shortageData ?? []) as ExistingShortShift[]);
    setImportMode("append_current");
  }, [authContext.departmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStaff();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadStaff]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setReviewRows((current) => annotateRowsForImportMode(current));
      setShortShiftDrafts((current) => annotateShortShiftsForImportMode(current));
      setExpandRangeConfirmed(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [annotateRowsForImportMode, annotateShortShiftsForImportMode, importMode]);

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
      .map((line, index) => ({ line: stripComment(line), lineNumber: index + 1 }))
      .filter(({ line }) => Boolean(line))
      .map(({ line, lineNumber }) => {
        const [shiftDate = "", rawShiftType = "", shiftStart = "", shiftEnd = "", rawStaffIdentifier = "", rawStatus = "", rawLead = ""] =
          line.split("|").map((part) => part.trim());
        const { staffIdentifier, isShiftLead } = parseStaffIdentifierLeadMarker(stripComment(rawStaffIdentifier), rawLead);
        const match = matchStaff(staffIdentifier, staffProfiles);
        const matchedStaff = match.staff;
        const row: ReviewRow = {
          id: createRowId(),
          rowIndex: lineNumber,
          shift_date: shiftDate,
          day_of_week: isValidDate(shiftDate) ? dayNameFromDate(shiftDate) : "",
          shift_type: Object.keys(shiftTypeLabels).includes(rawShiftType) ? (rawShiftType as ShiftType) : "",
          shift_start: shiftStart,
          shift_end: shiftEnd,
          original_staff_identifier: staffIdentifier,
          staff_identifier: staffIdentifier,
          raw_staff_name: staffIdentifier,
          matched_staff_profile_id: matchedStaff?.id ?? "",
          employment_type: matchedStaff?.employment_type ?? "",
          match_source: match.source,
          entry_status: ["scheduled", "available"].includes(rawStatus) ? (rawStatus as ScheduleEntryStatus) : "",
          is_shift_lead: isShiftLead,
          notes: "",
          confidence: match.confidence,
          needs_review: match.needsReview,
          validation_status: match.status,
          import_status: "new",
          import_note: "New row",
          removed: false
        };

        return { ...row, validation_status: validateReviewRow(row) === "Ready" ? match.status : validateReviewRow(row) };
      });

    setReviewRows(annotateRowsForImportMode(rows));
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
      .map((line, index) => ({ line: stripComment(line), lineNumber: index + 1 }))
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
          const [, shiftDate = "", rawShiftType = "", shiftStart = "", shiftEnd = "", rawStaffIdentifier = "", rawStatus = "", rawLead = ""] = parts;
          const { staffIdentifier, isShiftLead } = parseStaffIdentifierLeadMarker(rawStaffIdentifier, rawLead);

          if (parts.length !== 7 && parts.length !== 8) {
            errors.push(`Line ${lineNumber}: ENTRY must use 7 fields, or 8 fields when marking Shift Lead.`);
          }

          if (parts.length === 8 && rawLead && !parseLeadField(rawLead)) {
            errors.push(`Line ${lineNumber}: optional ENTRY lead field must be lead, shift_lead, or true.`);
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

          if (!staffIdentifier) {
            errors.push(`Line ${lineNumber}: staff_identifier is required.`);
          }

          if (!allowedEntryStatuses.has(rawStatus)) {
            errors.push(`Line ${lineNumber}: entry_status must be scheduled or available.`);
          }

          const match = matchStaff(staffIdentifier, staffProfiles);
          const matchedStaff = match.staff;
          const row: ReviewRow = {
            id: createRowId(),
            rowIndex: entryRows.length + 1,
            shift_date: shiftDate,
            day_of_week: isValidDate(shiftDate) ? dayNameFromDate(shiftDate) : "",
            shift_type: allowedShiftTypes.has(rawShiftType) ? (rawShiftType as ShiftType) : "",
            shift_start: shiftStart,
            shift_end: shiftEnd,
            original_staff_identifier: staffIdentifier,
            staff_identifier: staffIdentifier,
            raw_staff_name: staffIdentifier,
            matched_staff_profile_id: matchedStaff?.id ?? "",
            employment_type: matchedStaff?.employment_type ?? "",
            match_source: match.source,
            entry_status: allowedEntryStatuses.has(rawStatus) ? (rawStatus as ScheduleEntryStatus) : "",
            is_shift_lead: isShiftLead,
            notes: "",
            confidence: match.confidence,
            needs_review: match.needsReview,
            validation_status: match.status,
          import_status: "new",
          import_note: "New row",
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
              message: message.slice(0, 140),
              import_status: "new",
              import_note: "New row",
              removed: false
            });
          }
          return;
        }

        errors.push(`Line ${lineNumber}: unknown record type "${parts[0] ?? ""}".`);
      });

    if (!parsedVersion && importMode === "create_new") {
      errors.push("SCHEDULE_VERSION line is required.");
    }

    setParseErrors(errors);

    if (errors.length > 0 || (!parsedVersion && importMode === "create_new")) {
      setError("Schedule code has parse errors. Fix them before continuing.");
      return;
    }

    setError("");
    if (parsedVersion) {
      setVersionForm(parsedVersion);
    } else {
      const parsedRange = rangeFromDates([...entryRows.map((row) => row.shift_date), ...shortageRows.map((row) => row.shift_date)]);
      setVersionForm({
        label: activeVersion?.label ?? "",
        starts_on: parsedRange.startsOn,
        ends_on: parsedRange.endsOn,
        status: "review"
      });
    }
    setReviewRows(annotateRowsForImportMode(entryRows));
    setShortShiftDrafts(annotateShortShiftsForImportMode(shortageRows));
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

        if (patch.shift_type) {
          const standardTimes = standardTimesForShiftType(patch.shift_type as ShiftType);
          if (standardTimes) {
            next.shift_start = standardTimes.shift_start;
            next.shift_end = standardTimes.shift_end;
          }
        }

        if (patch.matched_staff_profile_id !== undefined) {
          const staff = staffById.get(patch.matched_staff_profile_id);
          next.employment_type = staff?.employment_type ?? "";
          next.raw_staff_name = next.raw_staff_name || next.staff_identifier || staff?.display_name || "";
          next.match_source = patch.matched_staff_profile_id ? "manual_review" : "unmatched";
        }

        next.validation_status = validateReviewRow(next);
        return annotateRowsForImportMode([next])[0];
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
        shift_start: "06:30",
        shift_end: "19:00",
        original_staff_identifier: "",
        staff_identifier: "",
        raw_staff_name: "",
        matched_staff_profile_id: "",
        employment_type: "",
        match_source: "manual_review",
        entry_status: "scheduled",
        is_shift_lead: false,
        notes: "",
        confidence: 0,
        needs_review: true,
        validation_status: "needs review",
        import_status: "needs_review",
        import_note: "Manual row needs review",
        removed: false
      }
    ]);
    setStep(2);
  };

  const addShortShift = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draft = {
      ...shortShiftForm,
      id: shortShiftForm.id || createRowId(),
      message: shortShiftForm.message.slice(0, 140),
      import_status: "new" as ImportRowStatus,
      import_note: "New row",
      removed: false
    };

    setShortShiftDrafts((current) => {
      if (shortShiftForm.id) {
        return annotateShortShiftsForImportMode(current.map((item) => (item.id === shortShiftForm.id ? draft : item)));
      }

      return annotateShortShiftsForImportMode([...current, draft]);
    });
    setShortShiftForm(emptyShortShiftDraft);
  };

  const saveImport = async (publish: boolean) => {
    if (!canApprove) {
      setError(
        importMode === "append_current" && rangeExpansion.needed && !expandRangeConfirmed
          ? "Confirm schedule range expansion before adding these rows."
          : "Resolve all Needs Review rows before saving this import."
      );
      return;
    }

    if (importMode === "create_new" && !versionForm.label.trim()) {
      setError("Schedule version label is required.");
      return;
    }

    if (importMode === "append_current" && !activeVersion) {
      setError("No active schedule version is available to add rows to.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const sourceFilename =
      sourceFiles.map((file) => file.name).join(", ").slice(0, 500) ||
      (scheduleCodeText.trim() ? "Schedule code import" : "Manual structured paste");
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
    if (activeRows.length > 0) {
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
          validation_status: "Ready",
          is_shift_lead: row.is_shift_lead
        }))
      );

      if (rowsError) {
        setSaving(false);
        setError("Import record was created, but review rows could not be saved. Confirm the Phase 8 migration is applied.");
        return;
      }
    }

    let versionId = activeVersion?.id ?? "";

    if (importMode === "create_new") {
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

      versionId = version.id as string;
    }

    if (activeRows.length > 0) {
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
          entry_status: row.entry_status,
          is_shift_lead: row.is_shift_lead
        }))
      );

      if (entriesError) {
        setSaving(false);
        setError("Schedule version was created, but entries could not be saved.");
        return;
      }
    }

    if (activeShortShiftDrafts.length > 0) {
      const { error: shortagesError } = await supabase.from("shift_shortages").insert(
        activeShortShiftDrafts.map((shortage) => ({
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

    if (importMode === "append_current" && rangeExpansion.needed) {
      const { error: rangeError } = await supabase
        .from("schedule_versions")
        .update({
          starts_on: rangeExpansion.startsOn || null,
          ends_on: rangeExpansion.endsOn || null
        })
        .eq("id", versionId)
        .eq("department_id", authContext.departmentId);

      if (rangeError) {
        setSaving(false);
        setError("Rows were added, but the schedule date range could not be expanded.");
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
    setSuccess(
      importMode === "append_current"
        ? "Schedule rows added to the current active schedule."
        : publish
          ? "Schedule imported, published, and set active."
          : "Schedule imported and saved for review."
    );
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
            Not the official hospital schedule.
          </p>
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">
            Crop photos to staffing schedule only. Do not upload patient information. If a person is crossed out on the source schedule, remove that row before approval.
          </p>
          <div className="mt-4 rounded-3xl border border-cyan-100 bg-cyan-50/70 p-3">
            <p className="text-sm font-black text-hospital-ink">Import mode</p>
            {activeVersion ? (
              <p className="mt-1 text-xs font-bold leading-5 text-cyan-900">
                Current active schedule: {activeVersion.label}
              </p>
            ) : (
              <p className="mt-1 text-xs font-bold leading-5 text-cyan-900">
                No active schedule is available, so imports must create a new schedule version.
              </p>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setImportMode("create_new")}
                className={`min-h-11 rounded-2xl border px-3 text-sm font-extrabold ${
                  importMode === "create_new"
                    ? "border-cyan-300 bg-cyan-700 text-white"
                    : "border-cyan-100 bg-white text-cyan-700"
                }`}
              >
                Create new schedule version
              </button>
              <button
                type="button"
                onClick={() => activeVersion && setImportMode("append_current")}
                disabled={!activeVersion}
                className={`min-h-11 rounded-2xl border px-3 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50 ${
                  importMode === "append_current"
                    ? "border-cyan-300 bg-cyan-700 text-white"
                    : "border-cyan-100 bg-white text-cyan-700"
                }`}
              >
                Add to current active schedule
              </button>
            </div>
          </div>
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
                {importMode === "append_current"
                  ? "ENTRY and optional SHORT_SHIFT records are added to the current active schedule. SCHEDULE_VERSION is used only as source metadata."
                  : "Required records: SCHEDULE_VERSION, ENTRY, and optional SHORT_SHIFT. Blank lines are ignored."}
              </p>
              <textarea
                value={scheduleCodeText}
                onChange={(event) => setScheduleCodeText(event.target.value)}
                placeholder={"SCHEDULE_VERSION | Week of June 24 | 2026-06-21 | 2026-06-27\n\nENTRY | 2026-06-24 | day_shift | 06:30 | 19:00 | Jonathan Burdick | scheduled | lead\nENTRY | 2026-06-24 | night_shift | 18:30 | 07:00 | Joann Devera | scheduled\n\nSHORT_SHIFT | 2026-06-24 | night_shift | 18:30 | 07:00 | urgent | Night shift short one RT"}
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
              Simple row paste format: 2026-06-24 | day_shift | 06:30 | 19:00 | Jonathan Burdick | scheduled
            </p>
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={"2026-06-24 | day_shift | 06:30 | 19:00 | Jonathan Burdick | scheduled\n2026-06-24 | night_shift | 18:30 | 07:00 | Joann Devera | scheduled"}
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
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {[
                ["all", "All Rows"],
                ["needs_review", "Needs Review Only"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReviewFilter(value as ReviewFilter)}
                  className={`min-h-10 rounded-2xl px-3 text-xs font-extrabold transition duration-150 active:scale-[0.98] ${
                    reviewFilter === value
                      ? "bg-cyan-700 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {reviewRows.length === 0 && (
                <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">No draft rows yet.</p>
              )}
              {reviewRows.length > 0 && displayedReviewRows.length === 0 && (
                <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">
                  No rows need review right now.
                </p>
              )}
              {displayedReviewRows.map((row) => {
                const staff = staffById.get(row.matched_staff_profile_id);
                const validation = validateReviewRow(row);
                const rowReady = validation === "Ready";

                return (
                  <article
                    key={row.id}
                    className={`rounded-3xl border p-3 ${
                      row.removed
                        ? "border-slate-100 bg-slate-100 opacity-60"
                        : rowReady && row.import_status === "new"
                          ? "border-emerald-100 bg-emerald-50/60"
                          : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-hospital-ink">Original Row {row.rowIndex}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{validation}</p>
                        <span
                          className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${
                            row.import_status === "already_exists"
                              ? "bg-slate-200 text-slate-700"
                              : row.import_status === "needs_review"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {row.import_status === "already_exists"
                            ? "Already exists / skipped"
                            : row.import_status === "needs_review"
                              ? "Needs Review"
                              : "New row"}
                        </span>
                        {row.is_shift_lead && (
                          <span className="ml-2 mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-800">
                            👑 Shift Lead
                          </span>
                        )}
                        {row.import_note && <p className="mt-1 text-xs font-bold text-slate-500">{row.import_note}</p>}
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
                          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Staff identifier</span>
                          <input
                            value={row.staff_identifier}
                            onChange={(event) =>
                              updateRow(row.id, {
                                staff_identifier: event.target.value,
                                raw_staff_name: event.target.value,
                                matched_staff_profile_id: "",
                                employment_type: "",
                                match_source: "unmatched",
                                needs_review: true
                              })
                            }
                            className="mt-1 min-h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none"
                          />
                          <span className="mt-1 block text-xs font-bold text-slate-500">
                            Original imported identifier: {row.original_staff_identifier || "missing"}
                          </span>
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
                                {profile.display_name}{profile.username ? ` (${profile.username})` : ""}
                              </option>
                            ))}
                          </select>
                          <span className="mt-1 block text-xs font-bold text-slate-500">
                            {staff
                              ? `${staff.display_name} - ${employmentLabel(staff.employment_type)} - ${matchSourceLabel(row.match_source)} - confidence ${Math.round(row.confidence * 100)}%`
                              : `${matchSourceLabel(row.match_source)} - no match selected`}
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
                        <label className="flex min-h-10 items-center gap-3 rounded-2xl border border-amber-100 bg-white px-3">
                          <input
                            type="checkbox"
                            checked={row.is_shift_lead}
                            onChange={(event) => updateRow(row.id, { is_shift_lead: event.target.checked })}
                            className="h-4 w-4 rounded border-amber-300 text-cyan-700"
                          />
                          <span className="text-sm font-extrabold text-hospital-ink">
                            👑 Shift Lead
                          </span>
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
              <h2 className="text-xl font-black text-hospital-ink">
                {importMode === "append_current" ? "Add to Current Schedule" : "Create Schedule Version"}
              </h2>
              {!canApprove && (
                <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                  {rangeExpansion.needed && !expandRangeConfirmed
                    ? "Confirm schedule range expansion before adding these rows."
                    : "Approval is blocked until all required fields and Needs Review rows are resolved."}
                </p>
              )}
              {importMode === "append_current" ? (
                <div className="mt-4 space-y-3">
                  <p className="rounded-2xl bg-cyan-50 px-3 py-3 text-sm font-bold leading-6 text-cyan-900">
                    Rows will be added to {activeVersion?.label ?? "the current active schedule"}. Existing rows will not be deleted or replaced.
                  </p>
                  {rangeExpansion.needed && (
                    <label className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-bold leading-6 text-amber-950">
                      <input
                        type="checkbox"
                        checked={expandRangeConfirmed}
                        onChange={(event) => setExpandRangeConfirmed(event.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0"
                      />
                      <span>
                        This import includes dates outside the current schedule range. Expand schedule range to include them?
                        <span className="mt-1 block text-xs font-extrabold uppercase tracking-wide">
                          New range: {rangeExpansion.startsOn || "unknown"} to {rangeExpansion.endsOn || "unknown"}
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              ) : (
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
              )}
            </section>

            <form onSubmit={addShortShift} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <h2 className="text-xl font-black text-hospital-ink">Short Shift Alerts</h2>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">Optional shift-level alerts. Short Shift is never attached to a staff member.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <input type="date" value={shortShiftForm.shift_date} onChange={(event) => setShortShiftForm({ ...shortShiftForm, shift_date: event.target.value })} required className="min-h-10 rounded-2xl border border-slate-200 px-3 text-sm font-bold" />
                <select value={shortShiftForm.shift_type} onChange={(event) => setShortShiftForm(applyStandardShiftTimes(shortShiftForm, event.target.value as ShiftType))} className="min-h-10 rounded-2xl border border-slate-200 px-3 text-sm font-bold">
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
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-extrabold ${
                            shortage.import_status === "already_exists"
                              ? "bg-slate-200 text-slate-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {shortage.import_status === "already_exists" ? "Skipped" : "New"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShortShiftDrafts((current) => current.filter((item) => item.id !== shortage.id))}
                          className="text-xs font-black text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
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
                {importMode === "append_current" ? (
                  <button
                    type="button"
                    onClick={() => void saveImport(false)}
                    disabled={saving || !canApprove}
                    className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:opacity-50 sm:col-span-2"
                  >
                    {saving ? "Saving..." : "Add to Current Schedule"}
                  </button>
                ) : (
                  <>
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
                  </>
                )}
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
