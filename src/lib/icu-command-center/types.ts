export type IcuDeviceType = "vent" | "bipap" | "cpap" | "hfnc";
export type IcuAirwayLocation = "teeth" | "gum" | "nare";
export type IcuVentMode = "apvcmv" | "scmv" | "spont" | "asv" | "pcmv" | "aprv";
export type VentilatorOutcome =
  | "extubation"
  | "trached_aerosol"
  | "unplanned"
  | "expired_on_ventilator"
  | "transferred_to_another_facility"
  | "donor_network"
  | "discontinue_vent_support_palliative";
export type IcuPatientEventType = "added" | "updated" | "critical_status_updated" | "discontinued";

export type IcuPatientRecord = {
  id: string;
  department_id: string;
  bed: string;
  device_type: IcuDeviceType;
  airway_size: string | null;
  airway_at: string | null;
  airway_location: IcuAirwayLocation | null;
  vent_mode: IcuVentMode | null;
  rate: number | null;
  tidal_volume: number | null;
  peep: number | null;
  fio2: number | null;
  ps: number | null;
  t_high: number | null;
  t_low: number | null;
  p_high: number | null;
  p_low: number | null;
  percent_min_vol: number | null;
  ipap: number | null;
  epap: number | null;
  cpap: number | null;
  flow: number | null;
  is_critical_vent: boolean;
  ventilator_outcome: VentilatorOutcome | null;
  is_active: boolean;
  created_by_staff_profile_id: string | null;
  updated_by_staff_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IcuPatientEventRecord = {
  id: string;
  department_id: string;
  icu_patient_id: string;
  event_type: IcuPatientEventType;
  event_summary: string | null;
  event_data: Record<string, unknown> | null;
  created_by_staff_profile_id: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type IcuSnapshotCounts = {
  vents: number;
  hfnc: number;
  bipap: number;
  cpap: number;
  criticalVents: number;
  totalActive: number;
};
