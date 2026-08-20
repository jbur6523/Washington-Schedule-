import type {
  ScheduleEntryStatus,
  ShiftShortageSeverity,
  ShiftType
} from "@/lib/schedule/supabase-schedule";

export type ImportRowKind = "entry" | "short_shift" | "invalid";
export type ImportDisposition =
  | "new"
  | "exact_duplicate"
  | "needs_review"
  | "internal_duplicate"
  | "conflict"
  | "excluded";

export type ScheduleImportResolution = {
  lineNumber: number;
  excluded?: boolean;
  exclusionReason?: string;
  staffProfileId?: string;
  shiftDate?: string;
  shiftType?: ShiftType;
  shiftStart?: string;
  shiftEnd?: string;
  entryStatus?: ScheduleEntryStatus;
  isShiftLead?: boolean;
  severity?: ShiftShortageSeverity;
  message?: string;
};

export type ScheduleImportStaff = {
  id: string;
  displayName: string;
  username: string;
};

export type ScheduleImportPreviewRow = {
  lineNumber: number;
  sourceLine: string;
  kind: ImportRowKind;
  disposition: ImportDisposition;
  issues: string[];
  excluded: boolean;
  exclusionReason: string;
  shiftDate: string;
  shiftType: ShiftType | "";
  shiftStart: string;
  shiftEnd: string;
  staffIdentifier: string;
  staffProfileId: string;
  staffDisplayName: string;
  matchSource: string;
  entryStatus: ScheduleEntryStatus | "";
  isShiftLead: boolean;
  severity: ShiftShortageSeverity | "";
  message: string;
};

export type ScheduleImportPreview = {
  sourceHash: string;
  metadata: {
    label: string;
    startsOn: string | null;
    endsOn: string | null;
  };
  activeVersion: {
    id: string;
    label: string;
    startsOn: string | null;
    endsOn: string | null;
  };
  resultingRange: { startsOn: string | null; endsOn: string | null };
  rows: ScheduleImportPreviewRow[];
  staff: ScheduleImportStaff[];
  summary: {
    entryRows: number;
    shortShiftRows: number;
    matched: number;
    newRows: number;
    duplicatesSkipped: number;
    unresolved: number;
    internalDuplicates: number;
    conflicts: number;
    excluded: number;
    uniqueDates: number;
    firstDate: string | null;
    lastDate: string | null;
  };
  canCommit: boolean;
};

export type ScheduleImportCommitResult = {
  importId: string;
  versionId: string;
  sourceHash: string;
  sourceRows: number;
  expectedRows: number;
  insertedEntries: number;
  duplicateEntries: number;
  insertedShortages: number;
  duplicateShortages: number;
  insertedCount: number;
  duplicateCount: number;
  excludedCount: number;
  conflictCount: number;
  firstDate: string | null;
  lastDate: string | null;
  startsOn: string | null;
  endsOn: string | null;
  verified: boolean;
  independentlyVerified: boolean;
};
