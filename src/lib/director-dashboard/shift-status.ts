import type { ShiftStatusShiftType, ShiftStatusUpdate } from "@/lib/shift-status/types";
import { currentClinicalShiftRecordForInstant } from "@/lib/shift-status/reporting-window";
import {
  currentShiftStatusWindow,
  latestShiftStatus,
  shiftTypeLabel
} from "@/lib/shift-status/utils";

type PersistedSubmissionMetadata = {
  deleted_at?: string | null;
  is_deleted?: boolean | null;
  is_draft?: boolean | null;
  submission_status?: string | null;
};

type DirectorShiftStatusResolution = {
  currentWindow: {
    shiftDate: string;
    shiftType: ShiftStatusShiftType;
  };
  latest: ShiftStatusUpdate | null;
  currentLatest: ShiftStatusUpdate | null;
  fallbackLatest: ShiftStatusUpdate | null;
  showingFallback: boolean;
};

type DirectorPayloadValidator = (update: ShiftStatusUpdate) => boolean;

function isCanonicalShiftDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasSubmissionAttribution(update: ShiftStatusUpdate) {
  const related = Array.isArray(update.staff_profiles) ? update.staff_profiles[0] : update.staff_profiles;

  return Boolean(
    update.updated_by_staff_profile_id ||
      update.updated_by_name?.trim() ||
      related?.display_name?.trim()
  );
}

function isSubmittedRecord(update: ShiftStatusUpdate) {
  const metadata = update as ShiftStatusUpdate & PersistedSubmissionMetadata;
  const submissionStatus = metadata.submission_status?.trim().toLowerCase();

  if (
    metadata.is_deleted === true ||
    metadata.is_draft === true ||
    metadata.deleted_at ||
    (submissionStatus && submissionStatus !== "submitted" && submissionStatus !== "published")
  ) {
    return false;
  }

  return (
    isCanonicalShiftDate(update.shift_date) &&
    (update.shift_type === "day" || update.shift_type === "night") &&
    Number.isFinite(new Date(update.created_at).getTime()) &&
    Number.isFinite(new Date(update.updated_at).getTime()) &&
    hasSubmissionAttribution(update)
  );
}

function shiftSequenceValue(shiftDate: string, shiftType: ShiftStatusShiftType) {
  return `${shiftDate}:${shiftType === "day" ? "0" : "1"}`;
}

function resolveDirectorSubmission(
  updates: ShiftStatusUpdate[],
  isValidPayload: DirectorPayloadValidator,
  timezone = "America/Los_Angeles",
  date = new Date()
): DirectorShiftStatusResolution {
  const currentWindow = currentShiftStatusWindow(timezone, date);
  const currentSequence = shiftSequenceValue(currentWindow.shiftDate, currentWindow.shiftType);
  const eligible = updates.filter(
    (update) =>
      isSubmittedRecord(update) &&
      isValidPayload(update) &&
      shiftSequenceValue(update.shift_date, update.shift_type) <= currentSequence
  );
  const currentLatest = latestShiftStatus(
    eligible.filter(
      (update) =>
        update.shift_date === currentWindow.shiftDate &&
        update.shift_type === currentWindow.shiftType
    )
  );
  const fallbackLatest = currentLatest
    ? null
    : latestShiftStatus(
        eligible.filter(
          (update) =>
            update.shift_date !== currentWindow.shiftDate ||
            update.shift_type !== currentWindow.shiftType
        )
      );

  return {
    currentWindow,
    latest: currentLatest ?? fallbackLatest,
    currentLatest,
    fallbackLatest,
    showingFallback: Boolean(fallbackLatest)
  };
}

export function isValidDirectorCurrentShiftStatus(update: ShiftStatusUpdate) {
  return isValidCount(update.rts_on) && isValidCount(update.rts_required);
}

export function isValidDirectorDepartmentSnapshot(update: ShiftStatusUpdate) {
  return [
    update.bipap_count,
    update.c_section_count,
    update.vaginal_delivery_count,
    update.cabg_count,
    update.bronch_count,
    update.sputum_induction_count,
    update.other_procedure_count
  ].every(isValidCount);
}

export function resolveDirectorCurrentShiftStatus(
  updates: ShiftStatusUpdate[],
  timezone = "America/Los_Angeles",
  date = new Date()
) {
  return resolveDirectorSubmission(
    updates,
    isValidDirectorCurrentShiftStatus,
    timezone,
    date
  );
}

export function resolveDirectorCurrentClinicalShift(
  updates: ShiftStatusUpdate[],
  timezone = "America/Los_Angeles",
  date = new Date()
): DirectorShiftStatusResolution {
  const currentWindow = currentClinicalShiftRecordForInstant(date, timezone);
  const currentLatest = latestShiftStatus(
    updates.filter(
      (update) =>
        isSubmittedRecord(update) &&
        update.is_canonical !== false &&
        update.shift_date === currentWindow.shiftDate &&
        update.shift_type === currentWindow.shiftType
    )
  );

  return {
    currentWindow,
    latest: currentLatest,
    currentLatest,
    fallbackLatest: null,
    showingFallback: false
  };
}

export function resolveDirectorDepartmentSnapshot(
  updates: ShiftStatusUpdate[],
  timezone = "America/Los_Angeles",
  date = new Date()
) {
  return resolveDirectorSubmission(
    updates,
    isValidDirectorDepartmentSnapshot,
    timezone,
    date
  );
}

export function formatDirectorSourceShift(update: ShiftStatusUpdate | null) {
  if (!update || !isCanonicalShiftDate(update.shift_date)) {
    return null;
  }

  const [, month, day] = update.shift_date.split("-");
  return `${month}/${day} ${shiftTypeLabel(update.shift_type)}`;
}
