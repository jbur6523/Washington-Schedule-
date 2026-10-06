import type { IcuPatientRecord } from "./types";

export type RoundingAction = "sbt" | "critical" | "procedure" | "note";
export type SaveRoundingAction = (action: RoundingAction, payload: Record<string, unknown>, expectedUpdatedAt: string) => Promise<boolean>;
export const sbtFailureReasons = ["Poor neuro status", "Excessive secretions", "High RSBI", "Hemodynamic instability", "Oxygenation", "Other"];
export function roundingDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date(value));
}
export function activeSbt(record: IcuPatientRecord) {
  return record.is_active && record.device_type === "vent" && record.vent_mode === "spont"
    && record.is_sbt && record.rounding_data?.sbt?.result === "Pass";
}
export function criticalDetail(record: IcuPatientRecord) {
  if (!record.is_critical_vent) return "";
  return [record.is_flolan && "Flolan", record.is_prone && "Proned", record.rounding_data?.criticalOther && `Other — ${record.rounding_data.criticalOther}`].filter(Boolean).join(" · ") || "Active";
}
export function procedureDetail(procedure: NonNullable<IcuPatientRecord["rounding_data"]>["procedure"]) {
  if (!procedure) return "";
  if (procedure.name === "Trach") return `Trach — ${procedure.trachType} ${procedure.size}${procedure.xlt ? " XLT" : ""}${procedure.date ? ` — ${roundingDate(procedure.date)}` : ""}`;
  return `${procedure.name}${procedure.other ? ` — ${procedure.other}` : ""} — ${roundingDate(procedure.at)}`;
}
