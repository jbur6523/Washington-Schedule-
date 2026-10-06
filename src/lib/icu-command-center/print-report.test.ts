import { describe, expect, it, vi } from "vitest";
import { buildIcuRoundingReport, printIcuRoundingReport, buildIcuSbarReport, buildIcuHistoryReport } from "./print-report";
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

  it("prints inside this tab and removes the frame after printing", () => {
    const open = vi.spyOn(window, "open");
    expect(printIcuRoundingReport([patient], "RT")).toBe(true);
    const frame = document.querySelector<HTMLIFrameElement>("#icu-print-frame")!;
    const print = vi.spyOn(frame.contentWindow!, "print").mockImplementation(() => {});
    vi.spyOn(frame.contentWindow!, "focus").mockImplementation(() => {});
    vi.spyOn(window, "focus").mockImplementation(() => {});
    frame.dispatchEvent(new Event("load"));
    expect(print).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    expect(frame.srcdoc).toContain("WHHS ICU Rounding Report");
    frame.contentWindow!.dispatchEvent(new Event("afterprint"));
    expect(document.querySelector("#icu-print-frame")).toBeNull();
    vi.restoreAllMocks();
  });

  it("keeps SBAR to active beds, modalities and current settings only", () => {
    const html = buildIcuSbarReport([patient, { ...patient, bed: "OLD", is_active: false }], "RT");
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(doc.body.textContent).toContain("D239");
    expect(doc.body.textContent).toContain("PS 8");
    for (const excluded of ["OLD", "Previous Settings", "Bronch", patient.notes!]) expect(doc.body.textContent).not.toContain(excluded);
  });

  it("prints only the selected history and escapes notes and changes", () => {
    const html = buildIcuHistoryReport("D239", "RT", [{ title: "Updated settings", author: "RT", lines: ["ETT size\nPrevious: 7.5\nCurrent: 6.0", "<script>unsafe</script>"] }]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.body.textContent).toContain("Previous: 7.5");
    expect(doc.body.textContent).toContain("Current: 6.0");
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelectorAll("article")).toHaveLength(1);
  });
});
