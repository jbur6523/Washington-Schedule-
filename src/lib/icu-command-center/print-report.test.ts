import { describe, expect, it, vi } from "vitest";
import { buildIcuRoundingReport, printIcuRoundingReport } from "./print-report";
import type { IcuPatientRecord } from "./types";

const patient = {
  bed: "D239", device_type: "vent", vent_mode: "spont", ps: 8, peep: 5, fio2: 30,
  is_active: true, is_sbt: true, is_critical_vent: true, is_flolan: true, is_prone: true,
  notes: 'Check <script>alert("test")</script> & reassess', updated_at: "2026-10-06T15:00:00Z",
  rounding_data: {
    sbt: { result: "Pass", at: "2026-10-06T15:00:00Z" },
    procedure: { name: "Bronch", at: "2026-10-06T15:00:00Z" },
    previousSettings: { device_type: "vent", vent_mode: "apvcmv", rate: 20, tidal_volume: 450, peep: 5, fio2: 40 }
  }
} as IcuPatientRecord;

describe("ICU rounding print report", () => {
  it("includes all active patients, useful rounding information and safe text", () => {
    const html = buildIcuRoundingReport([patient, { ...patient, bed: "E242" }, { ...patient, bed: "DISCHARGED", is_active: false }], "Respiratory Care", new Date("2026-10-06T16:00:00Z"));
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("article")).toHaveLength(2);
    expect(doc.body.textContent).toContain("2 active patients");
    expect(doc.body.textContent).not.toContain("DISCHARGED");
    for (const text of ["Current Settings", "Previous Settings", "SBT Started", "10/06/2026", "Flolan · Proned", "Bronch", "Last updated", patient.notes!]) expect(doc.body.textContent).toContain(text);
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelectorAll("button")).toHaveLength(1);
    expect(html).toContain("break-inside: avoid");
  });

  it("omits undocumented clinical rows and shows failure details without an active SBT claim", () => {
    const html = buildIcuRoundingReport([{ ...patient, is_sbt: false, is_critical_vent: false, notes: null, rounding_data: { sbt: { result: "Fail", reason: "High RSBI", at: "2026-10-06T15:00:00Z" } } }], "RT");
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.body.textContent).toContain("Failed — High RSBI — 10/06/2026");
    for (const label of ["SBT Started", "Critical", "Last Procedure", "Previous Settings"]) expect(doc.body.textContent).not.toContain(label);
  });

  it("opens the report and invokes printing, with a retry button in the report", () => {
    const doc = document.implementation.createHTMLDocument();
    const print = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue({ document: doc, print, focus: vi.fn(), opener: window } as unknown as Window);
    expect(printIcuRoundingReport([patient], "RT")).toBe(true);
    expect(print).toHaveBeenCalledOnce();
    doc.getElementById("print-report")?.click();
    expect(print).toHaveBeenCalledTimes(2);
    open.mockReturnValue(null);
    expect(printIcuRoundingReport([patient], "RT")).toBe(false);
    open.mockRestore();
  });
});
