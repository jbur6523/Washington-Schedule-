import type { Entry, FormState } from "./model";

export function isEntryEntered(entry: Entry) {
  return entry.entered?.revision === entry.revision;
}

export function allEntriesEntered(state: FormState) {
  return state.entries.length > 0 && state.entries.every(isEntryEntered);
}

export function canManagerSign(state: FormState) {
  return (
    allEntriesEntered(state) &&
    state.employeeSignature?.contentRevision === state.contentRevision
  );
}

export function isApproved(state: FormState) {
  return (
    canManagerSign(state) &&
    state.managerSignature?.contentRevision === state.contentRevision
  );
}

export type ReviewRole = "timekeeper" | "manager";
export function reviewFolder(state: FormState, role: ReviewRole) {
  if (!allEntriesEntered(state)) return "pending";
  if (role === "timekeeper") return "completed";
  return isApproved(state) ? "approved" : "entered";
}
