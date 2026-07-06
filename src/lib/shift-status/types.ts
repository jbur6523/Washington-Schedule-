export type ShiftStatusShiftType = "day" | "night";

export type ShiftStatusUpdate = {
  id: string;
  department_id: string;
  shift_date: string;
  shift_type: ShiftStatusShiftType;
  rts_on: number;
  rts_required: number;
  vent_count: number;
  bipap_count: number;
  c_section_count: number;
  vaginal_delivery_count: number;
  cabg_count: number;
  bronch_count: number;
  sputum_induction_count: number;
  other_procedure_count: number;
  other_procedure_note: string | null;
  updated_by_staff_profile_id: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
  staff_profiles?: { display_name: string } | { display_name: string }[] | null;
};

export type ShiftStatusStaffOption = {
  id: string;
  display_name: string;
};
