import type { IcuPatientRecord } from "./types";
import { activeSbt, criticalDetail, procedureDetail, roundingDate } from "./rounding";
import { formatIcuAirway, formatIcuDeviceSummary, formatIcuLastUpdated, formatIcuSettings } from "./utils";
import { formatVentCardTitle } from "./vent-status";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function buildIcuRoundingReport(records: IcuPatientRecord[], department: string, generatedAt = new Date()) {
  const active = records.filter(record => record.is_active);
  const row = (label: string, value: string) => value ? `<div class="row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>` : "";
  const patients = active.map(record => {
    const sbt = record.rounding_data?.sbt;
    const previous = record.rounding_data?.previousSettings;
    return `<article>
      <header class="patient-header"><h2>${escapeHtml(record.bed)}</h2><span>${escapeHtml(record.device_type === "vent" ? formatVentCardTitle(record) : formatIcuDeviceSummary(record))}${record.is_standby ? " · Standby" : ""}</span></header>
      ${row("Airway", formatIcuAirway(record))}
      ${row("Current Settings", formatIcuSettings(record))}
      ${previous ? row("Previous Settings", `${formatIcuDeviceSummary(previous as IcuPatientRecord)} · ${formatIcuSettings(previous as IcuPatientRecord)}`) : ""}
      ${sbt ? row(activeSbt(record) ? "SBT Started" : "Last SBT", activeSbt(record) ? roundingDate(sbt.at) : `${sbt.result === "Pass" ? "Passed" : "Failed"}${sbt.reason ? ` — ${sbt.reason}` : ""} — ${roundingDate(sbt.at)}`) : ""}
      ${row("Critical", criticalDetail(record))}
      ${row("Last Procedure", procedureDetail(record.rounding_data?.procedure))}
      ${row("Note", record.notes?.trim() ?? "")}
      <p class="updated">Last updated: ${escapeHtml(formatIcuLastUpdated(record.updated_at))} PT</p>
    </article>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WHHS ICU Rounding Report</title>
  <style>
    @page { size: letter portrait; margin: 0.45in; }
    * { box-sizing: border-box; }
    body { margin: 24px auto; max-width: 7.6in; padding: 0 16px; color: #111; background: white; font: 10pt/1.4 Arial, sans-serif; }
    h1 { margin: 0; font-size: 18pt; } h2 { margin: 0; font-size: 13pt; }
    .report-header { border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 12px; }
    .report-header p { margin: 3px 0 0; }
    article { border: 1px solid #666; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; overflow-wrap: anywhere; }
    .patient-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; border-bottom: 1px solid #aaa; padding-bottom: 5px; margin-bottom: 5px; font-weight: bold; }
    .row { display: grid; grid-template-columns: 115px minmax(0,1fr); gap: 8px; margin: 3px 0; }
    .row span { white-space: pre-wrap; }
    .updated { margin: 7px 0 0; font-size: 9pt; }
    .toolbar { margin-bottom: 20px; } button { padding: 10px 20px; border: 2px solid #333; border-radius: 6px; background: white; color: #111; font: bold 11pt Arial, sans-serif; cursor: pointer; }
    @media print { body { margin: 0; padding: 0; max-width: none; } .toolbar { display: none; } }
  </style></head><body>
    <div class="toolbar"><button id="print-report" type="button">Print Report</button></div>
    <header class="report-header"><h1>WHHS ICU Rounding Report</h1><p>${escapeHtml(department)} · ${active.length} active ${active.length === 1 ? "patient" : "patients"}</p><p>Prepared: ${escapeHtml(formatIcuLastUpdated(generatedAt.toISOString()))} PT · Snapshot of the listed active patients</p></header>
    ${patients || "<p>No active ICU patients listed.</p>"}
  </body></html>`;
}

export function printIcuRoundingReport(records: IcuPatientRecord[], department: string) {
  const report = window.open("", "_blank");
  if (!report) return false;
  report.opener = null;
  report.document.open();
  report.document.write(buildIcuRoundingReport(records, department));
  report.document.close();
  report.document.getElementById("print-report")?.addEventListener("click", () => report.print());
  report.focus();
  report.print();
  return true;
}
