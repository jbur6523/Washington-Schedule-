export type IcuDeviceType = "vent" | "bipap" | "cpap" | "hfnc";
export type IcuAirwayLocation = "teeth" | "gum" | "nare";
export type IcuVentMode = "apvcmv" | "scmv" | "spont" | "asv" | "pcmv" | "aprv";

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
  is_active: boolean;
  created_by_staff_profile_id: string | null;
  updated_by_staff_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IcuSnapshotCounts = {
  vents: number;
  hfnc: number;
  bipap: number;
  cpap: number;
  criticalVents: number;
  totalActive: number;
};
