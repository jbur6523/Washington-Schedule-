export type ShiftStatusShiftType = "day" | "night";

export type ShiftStatusUpdate = {
  id: string;
  department_id: string;
  shift_date: string;
  shift_type: ShiftStatusShiftType;
  is_canonical?: boolean;
  rts_on: number;
  rts_required: number;
  rvu_total: number | null;
  vent_count: number | null;
  bipap_count: number;
  c_section_count: number;
  vaginal_delivery_count: number;
  cabg_count: number;
  bronch_count: number;
  sputum_induction_count: number;
  other_procedure_count: number;
  other_procedure_note: string | null;
  shift_note: string | null;
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

export type OfficialVentCountSource = "lead_command_center" | "icu_command_center";

export type OfficialVentCountUpdate = {
  id: number;
  department_id: string;
  shift_date: string;
  shift_type: ShiftStatusShiftType;
  vent_count: number;
  source: OfficialVentCountSource;
  updated_by_staff_profile_id: string | null;
  updated_by_name: string | null;
  created_at: string;
};
