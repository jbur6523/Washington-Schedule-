export type PhoneListShiftType = "day" | "night";

export type PhoneListSectionKey = "main_hospital" | "morris_hyman_pavilion" | "additional_staff";

export type PhoneListRowDefinition = {
  key: string;
  sectionKey: PhoneListSectionKey;
  sectionLabel: string;
  label: string;
  displayOrder: number;
};

export type PhoneListDirectoryStaff = {
  id: string;
  displayName: string;
};

export type PhoneListRosterMember = PhoneListDirectoryStaff & {
  rosterNumber: number;
};

export type PhoneListAssignment = {
  rowKey: string;
  staffProfileId: string | null;
  staffNameSnapshot: string;
  phoneNumber: string;
};

export type PhoneListDraftRow = {
  id: string;
  schedule_date: string;
  shift_type: PhoneListShiftType;
  updated_at: string;
  phone_list_assignments?: Array<{
    row_key: string;
    selected_staff_profile_id: string | null;
    staff_name_snapshot: string | null;
    phone_number: string | null;
  }> | null;
};

export type PhoneListScheduleEntry = {
  id: string;
  staff_profile_id: string | null;
  shift_type: string;
  entry_status: "scheduled" | "available";
  staff_profiles:
    | { id: string; display_name: string }
    | Array<{ id: string; display_name: string }>
    | null;
};

export type PhoneListScheduleOverride = {
  id: string;
  staff_profile_id: string;
  base_schedule_entry_id: string | null;
  override_type: string;
  shift_type: string;
  is_active: boolean;
  staff_profiles:
    | { id: string; display_name: string }
    | Array<{ id: string; display_name: string }>
    | null;
};
