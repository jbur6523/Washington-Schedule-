type ShiftAssignment = {
  shift_type: string;
  shift_start: string;
  shift_end: string;
  is_shift_lead?: boolean | null;
  entry_status?: string;
};

// Qualification or account role is deliberately not used: Lead is a shift assignment.
export function withLeadShiftHours<T extends ShiftAssignment>(entry: T): T {
  if (!entry.is_shift_lead || (entry.entry_status && entry.entry_status !== "scheduled")) return entry;
  if (entry.shift_type === "day_shift") {
    return { ...entry, shift_start: "05:30", shift_end: "18:00" };
  }
  if (entry.shift_type === "night_shift") {
    // An end before the start represents the following morning.
    return { ...entry, shift_start: "19:30", shift_end: "06:00" };
  }
  return entry;
}
