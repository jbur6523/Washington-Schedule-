import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isValidIsoDate,
  normalizeTime,
  parseScheduleCode
} from "@/lib/schedule-import/parser";
import { matchScheduleStaff, type MatchableStaff } from "@/lib/schedule-import/matching";
import type {
  ImportDisposition,
  ScheduleImportPreview,
  ScheduleImportPreviewRow,
  ScheduleImportResolution
} from "@/lib/schedule-import/types";
import { fetchAllPages } from "@/lib/supabase/paginated-query";

type StaffRow = MatchableStaff;

type ExistingEntry = {
  id: string;
  staff_profile_id: string;
  shift_date: string;
  shift_type: string;
  shift_start: string;
  shift_end: string;
  entry_status: string;
  is_shift_lead: boolean;
};

type ExistingShortage = {
  id: string;
  shift_date: string;
  shift_type: string;
  shift_start: string;
  shift_end: string;
  severity: string;
  message: string | null;
};

const validShiftTypes = new Set(["day_shift", "night_shift", "pft", "pulmonary_rehab", "rt_aide", "flexible"]);
const validEntryStatuses = new Set(["scheduled", "available"]);
const validShortageSeverities = new Set(["short", "urgent"]);

export class ScheduleImportError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "schedule_import_invalid"
  ) {
    super(message);
  }
}

function normalizeExistingTime(value: string) {
  return normalizeTime(value) ?? value.slice(0, 5);
}

function entryExactKey(row: ScheduleImportPreviewRow | ExistingEntry) {
  const staffId = "staffProfileId" in row ? row.staffProfileId : row.staff_profile_id;
  const date = "shiftDate" in row ? row.shiftDate : row.shift_date;
  const type = "shiftType" in row ? row.shiftType : row.shift_type;
  const start = "shiftStart" in row ? row.shiftStart : normalizeExistingTime(row.shift_start);
  const end = "shiftEnd" in row ? row.shiftEnd : normalizeExistingTime(row.shift_end);
  const status = "entryStatus" in row ? row.entryStatus : row.entry_status;
  const lead = "isShiftLead" in row ? row.isShiftLead : Boolean(row.is_shift_lead);
  return [staffId, date, type, start, end, status, lead ? "1" : "0"].join("|");
}

function entryConflictKey(row: ScheduleImportPreviewRow | ExistingEntry) {
  const staffId = "staffProfileId" in row ? row.staffProfileId : row.staff_profile_id;
  const date = "shiftDate" in row ? row.shiftDate : row.shift_date;
  const type = "shiftType" in row ? row.shiftType : row.shift_type;
  return [staffId, date, type].join("|");
}

function shortageExactKey(row: ScheduleImportPreviewRow | ExistingShortage) {
  const date = "shiftDate" in row ? row.shiftDate : row.shift_date;
  const type = "shiftType" in row ? row.shiftType : row.shift_type;
  const start = "shiftStart" in row ? row.shiftStart : normalizeExistingTime(row.shift_start);
  const end = "shiftEnd" in row ? row.shiftEnd : normalizeExistingTime(row.shift_end);
  const severity = row.severity;
  const message = (row.message ?? "").trim();
  return [date, type, start, end, severity, message].join("|");
}

function shortageConflictKey(row: ScheduleImportPreviewRow | ExistingShortage) {
  const date = "shiftDate" in row ? row.shiftDate : row.shift_date;
  const type = "shiftType" in row ? row.shiftType : row.shift_type;
  const start = "shiftStart" in row ? row.shiftStart : normalizeExistingTime(row.shift_start);
  const end = "shiftEnd" in row ? row.shiftEnd : normalizeExistingTime(row.shift_end);
  return [date, type, start, end].join("|");
}

function canonicalPayload(preview: Omit<ScheduleImportPreview, "sourceHash">) {
  return {
    metadata: preview.metadata,
    rows: preview.rows.map((row) => ({
      lineNumber: row.lineNumber,
      kind: row.kind,
      excluded: row.excluded,
      exclusionReason: row.exclusionReason,
      shiftDate: row.shiftDate,
      shiftType: row.shiftType,
      shiftStart: row.shiftStart,
      shiftEnd: row.shiftEnd,
      staffIdentifier: row.staffIdentifier,
      staffProfileId: row.staffProfileId,
      entryStatus: row.entryStatus,
      isShiftLead: row.isShiftLead,
      severity: row.severity,
      message: row.message
    }))
  };
}

export async function buildScheduleImportPreview({
  supabase,
  departmentId,
  sourceCode,
  resolutions = []
}: {
  supabase: SupabaseClient;
  departmentId: string;
  sourceCode: string;
  resolutions?: ScheduleImportResolution[];
}): Promise<ScheduleImportPreview> {
  if (!sourceCode.trim() || sourceCode.length > 250_000) {
    throw new ScheduleImportError("Paste Schedule Code between 1 and 250,000 characters.");
  }

  const [{ data: department, error: departmentError }, staffResult] = await Promise.all([
    supabase
      .from("departments")
      .select("active_schedule_version_id")
      .eq("id", departmentId)
      .maybeSingle(),
    fetchAllPages<StaffRow>((from, to) =>
      supabase
        .from("staff_profiles")
        .select("id, display_name, first_name, last_name, username, username_normalized")
        .eq("department_id", departmentId)
        .eq("is_active", true)
        .order("display_name", { ascending: true })
        .range(from, to)
    )
  ]);

  if (departmentError || staffResult.error) {
    throw new ScheduleImportError("The active schedule or Staff Directory could not be loaded.", 500);
  }

  const activeVersionId = department?.active_schedule_version_id as string | null | undefined;
  if (!activeVersionId) {
    throw new ScheduleImportError(
      "No active published schedule exists. Create or publish one in Schedule Versions before importing.",
      409,
      "active_schedule_required"
    );
  }

  const { data: version, error: versionError } = await supabase
    .from("schedule_versions")
    .select("id, label, starts_on, ends_on")
    .eq("id", activeVersionId)
    .eq("department_id", departmentId)
    .eq("status", "published")
    .maybeSingle();

  if (versionError || !version) {
    throw new ScheduleImportError(
      "The active published schedule changed or is unavailable. Refresh and try again.",
      409,
      "active_schedule_changed"
    );
  }

  const parsed = parseScheduleCode(sourceCode);
  const staff = staffResult.data ?? [];
  const resolutionsByLine = new Map(resolutions.map((resolution) => [resolution.lineNumber, resolution]));
  const rows: ScheduleImportPreviewRow[] = parsed.rows.map((sourceRow) => {
    const resolution = resolutionsByLine.get(sourceRow.lineNumber);
    const selectedStaff = resolution?.staffProfileId
      ? staff.find((profile) => profile.id === resolution.staffProfileId) ?? null
      : null;
    const automaticMatch = sourceRow.kind === "entry" && !selectedStaff
      ? matchScheduleStaff(sourceRow.staffIdentifier, staff)
      : { profile: selectedStaff, source: selectedStaff ? "manual_review" : "not_applicable" };
    const shiftDate = resolution?.shiftDate ?? sourceRow.shiftDate;
    const shiftType = resolution?.shiftType ?? sourceRow.shiftType;
    const shiftStart = normalizeTime(resolution?.shiftStart ?? sourceRow.shiftStart) ?? "";
    const shiftEnd = normalizeTime(resolution?.shiftEnd ?? sourceRow.shiftEnd) ?? "";
    const entryStatus = resolution?.entryStatus ?? sourceRow.entryStatus;
    const severity = resolution?.severity ?? sourceRow.severity;
    const message = resolution?.message ?? sourceRow.message;
    const issues = sourceRow.issues.filter((issue) => {
      if (issue.includes("date")) return !isValidIsoDate(shiftDate);
      if (issue.includes("shift type")) return !shiftType;
      if (issue.includes("times")) return !shiftStart || !shiftEnd || shiftStart === shiftEnd;
      if (issue.includes("status")) return !entryStatus;
      if (issue.includes("severity")) return !severity;
      if (issue.includes("message")) return message.length > 140;
      return true;
    });
    const addIssue = (issue: string) => {
      if (!issues.includes(issue)) issues.push(issue);
    };

    if (!isValidIsoDate(shiftDate)) addIssue(`Line ${sourceRow.lineNumber}: date must be valid YYYY-MM-DD.`);
    if (!validShiftTypes.has(shiftType)) addIssue(`Line ${sourceRow.lineNumber}: shift type is invalid.`);
    if (!shiftStart || !shiftEnd || shiftStart === shiftEnd) addIssue(`Line ${sourceRow.lineNumber}: times are invalid.`);
    if (sourceRow.kind === "entry" && !validEntryStatuses.has(entryStatus)) {
      addIssue(`Line ${sourceRow.lineNumber}: status must be scheduled or available.`);
    }
    if (sourceRow.kind === "short_shift" && !validShortageSeverities.has(severity)) {
      addIssue(`Line ${sourceRow.lineNumber}: severity must be short or urgent.`);
    }
    if (sourceRow.kind === "short_shift" && message.length > 140) {
      addIssue(`Line ${sourceRow.lineNumber}: SHORT_SHIFT message must be 140 characters or fewer.`);
    }

    if (sourceRow.kind === "entry" && !automaticMatch.profile) {
      addIssue(
        automaticMatch.source === "ambiguous"
          ? `Line ${sourceRow.lineNumber}: Staff Directory match is ambiguous.`
          : `Line ${sourceRow.lineNumber}: no Staff Directory match was found.`
      );
    }
    if (parsed.metadata && isValidIsoDate(shiftDate)
      && (shiftDate < parsed.metadata.startsOn || shiftDate > parsed.metadata.endsOn)) {
      issues.push(`Line ${sourceRow.lineNumber}: date is outside SCHEDULE_VERSION guidance.`);
    }

    const excluded = Boolean(resolution?.excluded);
    return {
      lineNumber: sourceRow.lineNumber,
      sourceLine: sourceRow.sourceLine,
      kind: sourceRow.kind,
      disposition: excluded ? "excluded" : issues.length ? "needs_review" : "new",
      issues,
      excluded,
      exclusionReason: resolution?.exclusionReason?.trim() || (excluded ? "Excluded during review" : ""),
      shiftDate,
      shiftType,
      shiftStart,
      shiftEnd,
      staffIdentifier: sourceRow.staffIdentifier,
      staffProfileId: automaticMatch.profile?.id ?? "",
      staffDisplayName: automaticMatch.profile?.display_name ?? "",
      matchSource: automaticMatch.source,
      entryStatus,
      isShiftLead: resolution?.isShiftLead ?? sourceRow.isShiftLead,
      severity,
      message
    };
  });

  parsed.documentIssues.forEach((issue, index) => {
    rows.unshift({
      lineNumber: -(index + 1), sourceLine: "", kind: "invalid", disposition: "needs_review",
      issues: [issue], excluded: false, exclusionReason: "", shiftDate: "", shiftType: "",
      shiftStart: "", shiftEnd: "", staffIdentifier: "", staffProfileId: "",
      staffDisplayName: "", matchSource: "not_applicable", entryStatus: "",
      isShiftLead: false, severity: "", message: ""
    });
  });

  const validDates = rows
    .filter((row) => !row.excluded && row.kind !== "invalid" && isValidIsoDate(row.shiftDate))
    .map((row) => row.shiftDate)
    .sort();
  const firstDate = validDates[0] ?? null;
  const lastDate = validDates.at(-1) ?? null;
  let existingEntries: ExistingEntry[] = [];
  let existingShortages: ExistingShortage[] = [];

  if (firstDate && lastDate) {
    const [entryResult, shortageResult] = await Promise.all([
      fetchAllPages<ExistingEntry>((from, to) =>
        supabase
          .from("schedule_entries")
          .select("id, staff_profile_id, shift_date, shift_type, shift_start, shift_end, entry_status, is_shift_lead")
          .eq("schedule_version_id", activeVersionId)
          .gte("shift_date", firstDate)
          .lte("shift_date", lastDate)
          .order("shift_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAllPages<ExistingShortage>((from, to) =>
        supabase
          .from("shift_shortages")
          .select("id, shift_date, shift_type, shift_start, shift_end, severity, message")
          .eq("schedule_version_id", activeVersionId)
          .eq("status", "active")
          .gte("shift_date", firstDate)
          .lte("shift_date", lastDate)
          .order("shift_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      )
    ]);
    if (entryResult.error || shortageResult.error) {
      throw new ScheduleImportError("Existing schedule rows could not be checked completely.", 500);
    }
    existingEntries = entryResult.data ?? [];
    existingShortages = shortageResult.data ?? [];
  }

  const internalExact = new Set<string>();
  const internalConflict = new Map<string, string>();
  const existingEntryExact = new Set(existingEntries.map(entryExactKey));
  const existingEntryConflict = new Map(existingEntries.map((row) => [entryConflictKey(row), entryExactKey(row)]));
  const existingShortageExact = new Set(existingShortages.map(shortageExactKey));
  const existingShortageConflict = new Map(
    existingShortages.map((row) => [shortageConflictKey(row), shortageExactKey(row)])
  );

  rows.forEach((row) => {
    if (row.excluded || row.disposition === "needs_review" || row.kind === "invalid") return;
    let disposition: ImportDisposition = "new";
    if (row.kind === "entry") {
      const exact = entryExactKey(row);
      const conflict = entryConflictKey(row);
      if (internalExact.has(exact)) disposition = "internal_duplicate";
      else if (internalConflict.has(conflict) && internalConflict.get(conflict) !== exact) disposition = "conflict";
      else if (existingEntryExact.has(exact)) disposition = "exact_duplicate";
      else if (existingEntryConflict.has(conflict) && existingEntryConflict.get(conflict) !== exact) disposition = "conflict";
      internalExact.add(exact);
      internalConflict.set(conflict, exact);
    } else {
      const exact = shortageExactKey(row);
      const conflict = shortageConflictKey(row);
      if (internalExact.has(`shortage:${exact}`)) disposition = "internal_duplicate";
      else if (internalConflict.has(`shortage:${conflict}`) && internalConflict.get(`shortage:${conflict}`) !== exact) {
        disposition = "conflict";
      } else if (existingShortageExact.has(exact)) disposition = "exact_duplicate";
      else if (existingShortageConflict.has(conflict) && existingShortageConflict.get(conflict) !== exact) {
        disposition = "conflict";
      }
      internalExact.add(`shortage:${exact}`);
      internalConflict.set(`shortage:${conflict}`, exact);
    }
    row.disposition = disposition;
  });

  const uniqueDates = new Set(validDates);
  const withoutHash: Omit<ScheduleImportPreview, "sourceHash"> = {
    metadata: {
      label: parsed.metadata?.label ?? "Schedule Code",
      startsOn: parsed.metadata?.startsOn ?? firstDate,
      endsOn: parsed.metadata?.endsOn ?? lastDate
    },
    activeVersion: {
      id: version.id as string,
      label: version.label as string,
      startsOn: version.starts_on as string | null,
      endsOn: version.ends_on as string | null
    },
    resultingRange: {
      startsOn: [version.starts_on as string | null, firstDate].filter(Boolean).sort()[0] ?? null,
      endsOn: [version.ends_on as string | null, lastDate].filter(Boolean).sort().at(-1) ?? null
    },
    rows,
    staff: staff.map((profile) => ({
      id: profile.id,
      displayName: profile.display_name,
      username: profile.username
    })),
    summary: {
      entryRows: rows.filter((row) => row.kind === "entry").length,
      shortShiftRows: rows.filter((row) => row.kind === "short_shift").length,
      matched: rows.filter((row) => row.kind === "entry" && Boolean(row.staffProfileId)).length,
      newRows: rows.filter((row) => row.disposition === "new").length,
      duplicatesSkipped: rows.filter((row) => row.disposition === "exact_duplicate").length,
      unresolved: rows.filter((row) => row.disposition === "needs_review").length,
      internalDuplicates: rows.filter((row) => row.disposition === "internal_duplicate").length,
      conflicts: rows.filter((row) => row.disposition === "conflict").length,
      excluded: rows.filter((row) => row.disposition === "excluded").length,
      uniqueDates: uniqueDates.size,
      firstDate,
      lastDate
    },
    canCommit: rows.length > 0 && rows.every((row) =>
      row.disposition === "new" || row.disposition === "exact_duplicate" || row.disposition === "excluded"
    )
  };
  const sourceHash = createHash("sha256").update(JSON.stringify(canonicalPayload(withoutHash))).digest("hex");
  return { sourceHash, ...withoutHash };
}
