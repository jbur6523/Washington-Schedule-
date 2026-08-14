import type { ShiftStatusShiftType } from "@/lib/shift-status/types";

const SESSION_RVU_KEY = "whhs:last-submitted-shift-rvu";

export type SessionRvu = {
  departmentId: string;
  shiftDate: string;
  shiftType: ShiftStatusShiftType;
  rtsNeeded: number;
  rvuCount: number;
};

export function rememberSessionRvu(value: SessionRvu) {
  try {
    window.sessionStorage.setItem(SESSION_RVU_KEY, JSON.stringify(value));
  } catch {
    // The calculated staffing save must still succeed if browser storage is unavailable.
  }
}

export function readSessionRvu() {
  try {
    const storedValue = window.sessionStorage.getItem(SESSION_RVU_KEY);
    if (!storedValue) {
      return null;
    }

    const parsed = JSON.parse(storedValue) as Partial<SessionRvu>;
    if (
      typeof parsed.departmentId !== "string"
      || typeof parsed.shiftDate !== "string"
      || (parsed.shiftType !== "day" && parsed.shiftType !== "night")
      || typeof parsed.rtsNeeded !== "number"
      || !Number.isFinite(parsed.rtsNeeded)
      || typeof parsed.rvuCount !== "number"
      || !Number.isFinite(parsed.rvuCount)
    ) {
      return null;
    }

    return parsed as SessionRvu;
  } catch {
    return null;
  }
}
