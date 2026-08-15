import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

export type ShiftRosterEntry = {
  id: string;
  display_order: number;
  staff_display_name: string;
  area_labels: string[];
};

export type ShiftRosterSnapshot = {
  id: string;
  shift_date: string;
  shift_type: "day" | "night";
  captured_at: string;
  captured_by_name: string | null;
  phone_list_roster_entries: ShiftRosterEntry[];
};

export type ShiftHistoryRecord = ShiftStatusUpdate & {
  roster: ShiftRosterSnapshot | null;
};
