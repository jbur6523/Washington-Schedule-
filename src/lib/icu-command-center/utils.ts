import type {
  IcuAirwayLocation,
  IcuDeviceType,
  IcuPatientRecord,
  IcuSnapshotCounts,
  IcuVentMode
} from "@/lib/icu-command-center/types";

export const icuBedOptions = [
  "C220",
  "C221",
  "C222",
  "C223",
  "C224",
  "C225",
  "C226",
  "C227",
  "D230",
  "D231",
  "D232",
  "D233",
  "D234",
  "D235",
  "D236",
  "D237",
  "D238",
  "D239",
  "E240",
  "E241",
  "E242",
  "E243",
  "E244",
  "E245",
  "E246",
  "E247",
  "E248",
  "E249"
] as const;

export const icuDeviceLabels: Record<IcuDeviceType, string> = {
  vent: "Vent",
  bipap: "BiPAP",
  cpap: "CPAP",
  hfnc: "HFNC"
};

export const icuVentModeLabels: Record<IcuVentMode, string> = {
  apvcmv: "APVCMV",
  scmv: "SCMV",
  spont: "SPONT",
  asv: "ASV",
  pcmv: "PCMV",
  aprv: "APRV"
};

export const icuAirwayLocationLabels: Record<IcuAirwayLocation, string> = {
  teeth: "Teeth",
  gum: "Gum",
  nare: "Nare"
};

export const airwaySizeOptions = ["6", "6.5", "7", "7.5", "8"] as const;
export const airwayLocationOptions: IcuAirwayLocation[] = ["teeth", "gum", "nare"];
export const ventModeOptions: IcuVentMode[] = ["apvcmv", "scmv", "spont", "asv", "pcmv", "aprv"];

function hasValue(value: number | string | null | undefined) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function setting(label: string, value: number | string | null | undefined, suffix = "") {
  return hasValue(value) ? `${label} ${value}${suffix}` : null;
}

function peepValue(value: number | null | undefined) {
  return hasValue(value) ? `+${value}` : value;
}

export function getIcuSnapshotCounts(records: IcuPatientRecord[]): IcuSnapshotCounts {
  const active = records.filter((record) => record.is_active);

  return {
    vents: active.filter((record) => record.device_type === "vent").length,
    hfnc: active.filter((record) => record.device_type === "hfnc").length,
    bipap: active.filter((record) => record.device_type === "bipap").length,
    cpap: active.filter((record) => record.device_type === "cpap").length,
    criticalVents: active.filter((record) => record.device_type === "vent" && record.is_critical_vent).length,
    totalActive: active.length
  };
}

export function formatIcuAirway(record: IcuPatientRecord) {
  if (record.device_type !== "vent" || !record.airway_size) {
    return "";
  }

  const parts = [`ETT ${record.airway_size}`];

  if (record.airway_at) {
    parts.push(`@ ${record.airway_at}`);
  }

  if (record.airway_location) {
    parts.push(icuAirwayLocationLabels[record.airway_location]);
  }

  return parts.join(" ");
}

export function formatIcuSettings(record: IcuPatientRecord) {
  const parts: Array<string | null> = [];

  if (record.device_type === "vent") {
    switch (record.vent_mode) {
      case "spont":
        parts.push(setting("PS", record.ps), setting("PEEP", peepValue(record.peep)), setting("FiO2", record.fio2, "%"));
        break;
      case "aprv":
        parts.push(
          setting("Rate", record.rate),
          setting("T-High", record.t_high),
          setting("T-Low", record.t_low),
          setting("P-High", record.p_high),
          setting("P-Low", record.p_low),
          setting("FiO2", record.fio2, "%")
        );
        break;
      case "asv":
        parts.push(
          setting("% Min Vol", record.percent_min_vol, "%"),
          setting("PEEP", peepValue(record.peep)),
          setting("FiO2", record.fio2, "%")
        );
        break;
      default:
        parts.push(
          setting("Rate", record.rate),
          setting("VT", record.tidal_volume),
          setting("PEEP", peepValue(record.peep)),
          setting("FiO2", record.fio2, "%")
        );
        break;
    }
  }

  if (record.device_type === "bipap") {
    parts.push(
      setting("Rate", record.rate),
      setting("IPAP", record.ipap),
      setting("EPAP", record.epap),
      setting("FiO2", record.fio2, "%")
    );
  }

  if (record.device_type === "cpap") {
    parts.push(setting("CPAP", record.cpap));
  }

  if (record.device_type === "hfnc") {
    parts.push(setting("FiO2", record.fio2, "%"), setting("Flow", record.flow, "L"));
  }

  return parts.filter(Boolean).join(" - ") || "Settings not entered";
}

export function formatIcuDeviceSummary(record: IcuPatientRecord) {
  if (record.device_type === "vent" && record.vent_mode) {
    return `${icuDeviceLabels[record.device_type]} - ${icuVentModeLabels[record.vent_mode]}`;
  }

  return icuDeviceLabels[record.device_type];
}

export function formatIcuLastUpdated(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).format(new Date(value));
}
