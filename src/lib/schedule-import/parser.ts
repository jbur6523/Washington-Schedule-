import type {
  ScheduleEntryStatus,
  ShiftShortageSeverity,
  ShiftType
} from "@/lib/schedule/supabase-schedule";

const allowedShiftTypes = new Set<ShiftType>([
  "day_shift",
  "night_shift",
  "pft",
  "pulmonary_rehab",
  "rt_aide",
  "flexible"
]);
const allowedStatuses = new Set<ScheduleEntryStatus>(["scheduled", "available"]);
const allowedSeverities = new Set<ShiftShortageSeverity>(["short", "urgent"]);

export type ParsedMetadata = { label: string; startsOn: string; endsOn: string };
export type ParsedSourceRow = {
  lineNumber: number;
  sourceLine: string;
  kind: "entry" | "short_shift" | "invalid";
  issues: string[];
  shiftDate: string;
  shiftType: ShiftType | "";
  shiftStart: string;
  shiftEnd: string;
  staffIdentifier: string;
  entryStatus: ScheduleEntryStatus | "";
  isShiftLead: boolean;
  severity: ShiftShortageSeverity | "";
  message: string;
};

export type ParsedScheduleCode = {
  metadata: ParsedMetadata | null;
  rows: ParsedSourceRow[];
  documentIssues: string[];
};

export function normalizePersonName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function compactPersonName(value: string) {
  return normalizePersonName(value).replace(/\s/g, "");
}

export function normalizeStaffUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseLeadField(value: string) {
  return ["lead", "shift_lead", "true"].includes(value.trim().toLowerCase());
}

export function parseStaffLeadMarker(value: string, leadField = "") {
  let staffIdentifier = value.trim();
  let isShiftLead = parseLeadField(leadField);
  const markers = [
    /\(\s*l\s*\)/gi,
    /\(\s*lead\s*\)/gi,
    /\bshift\s+lead\b/gi,
    /\blead\b/gi,
    /\s+-\s*l\s*$/gi,
    /-l\s*$/gi
  ];

  for (const marker of markers) {
    if (marker.test(staffIdentifier)) {
      isShiftLead = true;
      staffIdentifier = staffIdentifier.replace(marker, " ");
    }
  }

  return { staffIdentifier: staffIdentifier.replace(/\s+/g, " ").trim(), isShiftLead };
}

function cleanSourceLine(line: string) {
  return line.split("#", 1)[0]?.trim() ?? "";
}

function invalidRow(lineNumber: number, sourceLine: string, issue: string): ParsedSourceRow {
  return {
    lineNumber,
    sourceLine,
    kind: "invalid",
    issues: [issue],
    shiftDate: "",
    shiftType: "",
    shiftStart: "",
    shiftEnd: "",
    staffIdentifier: "",
    entryStatus: "",
    isShiftLead: false,
    severity: "",
    message: ""
  };
}

export function parseScheduleCode(sourceCode: string): ParsedScheduleCode {
  let metadata: ParsedMetadata | null = null;
  const rows: ParsedSourceRow[] = [];
  const documentIssues: string[] = [];

  sourceCode.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const sourceLine = cleanSourceLine(rawLine);
    if (!sourceLine) return;

    const fields = sourceLine.split("|").map((field) => field.trim());
    const recordType = fields[0]?.toUpperCase();

    if (recordType === "SCHEDULE_VERSION") {
      if (metadata) {
        documentIssues.push(`Line ${lineNumber}: only one SCHEDULE_VERSION line is allowed.`);
        return;
      }
      if (fields.length !== 4) {
        documentIssues.push(`Line ${lineNumber}: SCHEDULE_VERSION must use 4 fields.`);
        return;
      }
      const [, label, startsOn, endsOn] = fields;
      if (!label) documentIssues.push(`Line ${lineNumber}: schedule label is required.`);
      if (!isValidIsoDate(startsOn) || !isValidIsoDate(endsOn)) {
        documentIssues.push(`Line ${lineNumber}: schedule dates must use valid YYYY-MM-DD values.`);
      } else if (startsOn > endsOn) {
        documentIssues.push(`Line ${lineNumber}: schedule start must not follow its end.`);
      }
      metadata = { label, startsOn, endsOn };
      return;
    }

    if (recordType === "ENTRY") {
      if (fields.length !== 7 && fields.length !== 8) {
        rows.push(invalidRow(lineNumber, sourceLine, `Line ${lineNumber}: ENTRY must use 7 or 8 fields.`));
        return;
      }
      const [, shiftDate, rawShiftType, rawStart, rawEnd, rawStaff, rawStatus, leadField = ""] = fields;
      const issues: string[] = [];
      const shiftType = allowedShiftTypes.has(rawShiftType as ShiftType) ? rawShiftType as ShiftType : "";
      const shiftStart = normalizeTime(rawStart) ?? "";
      const shiftEnd = normalizeTime(rawEnd) ?? "";
      const entryStatus = allowedStatuses.has(rawStatus as ScheduleEntryStatus)
        ? rawStatus as ScheduleEntryStatus
        : "";
      const { staffIdentifier, isShiftLead } = parseStaffLeadMarker(rawStaff, leadField);

      if (!isValidIsoDate(shiftDate)) issues.push(`Line ${lineNumber}: ENTRY date must be valid YYYY-MM-DD.`);
      if (!shiftType) issues.push(`Line ${lineNumber}: ENTRY shift type is invalid.`);
      if (!shiftStart || !shiftEnd || shiftStart === shiftEnd) issues.push(`Line ${lineNumber}: ENTRY times are invalid.`);
      if (!staffIdentifier) issues.push(`Line ${lineNumber}: ENTRY staff identifier is required.`);
      if (!entryStatus) issues.push(`Line ${lineNumber}: ENTRY status must be scheduled or available.`);
      if (leadField && !parseLeadField(leadField)) {
        issues.push(`Line ${lineNumber}: optional lead field must be lead, shift_lead, or true.`);
      }

      rows.push({
        lineNumber, sourceLine, kind: "entry", issues, shiftDate, shiftType, shiftStart,
        shiftEnd, staffIdentifier, entryStatus, isShiftLead, severity: "", message: ""
      });
      return;
    }

    if (recordType === "SHORT_SHIFT") {
      if (fields.length !== 7) {
        rows.push(invalidRow(lineNumber, sourceLine, `Line ${lineNumber}: SHORT_SHIFT must use 7 fields.`));
        return;
      }
      const [, shiftDate, rawShiftType, rawStart, rawEnd, rawSeverity, message] = fields;
      const issues: string[] = [];
      const shiftType = allowedShiftTypes.has(rawShiftType as ShiftType) ? rawShiftType as ShiftType : "";
      const shiftStart = normalizeTime(rawStart) ?? "";
      const shiftEnd = normalizeTime(rawEnd) ?? "";
      const severity = allowedSeverities.has(rawSeverity as ShiftShortageSeverity)
        ? rawSeverity as ShiftShortageSeverity
        : "";

      if (!isValidIsoDate(shiftDate)) issues.push(`Line ${lineNumber}: SHORT_SHIFT date must be valid YYYY-MM-DD.`);
      if (!shiftType) issues.push(`Line ${lineNumber}: SHORT_SHIFT shift type is invalid.`);
      if (!shiftStart || !shiftEnd || shiftStart === shiftEnd) issues.push(`Line ${lineNumber}: SHORT_SHIFT times are invalid.`);
      if (!severity) issues.push(`Line ${lineNumber}: severity must be short or urgent.`);
      if (message.length > 140) issues.push(`Line ${lineNumber}: SHORT_SHIFT message must be 140 characters or fewer.`);

      rows.push({
        lineNumber, sourceLine, kind: "short_shift", issues, shiftDate, shiftType, shiftStart,
        shiftEnd, staffIdentifier: "", entryStatus: "", isShiftLead: false, severity, message
      });
      return;
    }

    rows.push(invalidRow(lineNumber, sourceLine, `Line ${lineNumber}: unknown record type ${fields[0] || "(blank)"}.`));
  });

  if (rows.length === 0) documentIssues.push("Schedule Code must contain at least one ENTRY or SHORT_SHIFT row.");
  return { metadata, rows, documentIssues };
}
