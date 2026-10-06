import { describe, expect, it } from "vitest";
import { icuHistoryChanges } from "./history-changes";
import type { IcuPatientEventRecord } from "./types";

const before = { bed: "D239", device: "Vent - APVCMV", airway: "ETT 7.5 @ 23 Teeth", settings: "Rate 16 - VT 450 - PEEP +5 - FiO2 30%", criticalVent: false, standby: false };
function event(updated: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { event_type: "updated", event_data: { previousState: before, updatedState: { ...before, ...updated }, ...extra } } as IcuPatientEventRecord;
}

describe("ICU history changes", () => {
  it("shows only changed tube size from existing formatted snapshots", () => {
    expect(icuHistoryChanges(event({ airway: "ETT 6 @ 23 Teeth" }))).toEqual([{ label: "ETT size", previous: "7.5", current: "6.0" }]);
  });
  it("isolates rate and retains unchanged settings out of the output", () => {
    expect(icuHistoryChanges(event({ settings: "Rate 25 - VT 450 - PEEP +5 - FiO2 30%" }))).toEqual([{ label: "Rate", previous: "16", current: "25" }]);
  });
  it("captures every changed setting, including cleared and newly recorded values", () => {
    expect(icuHistoryChanges(event({ settings: "Rate 25 - PEEP +8 - FiO2 30% - PS 10" }))).toEqual([
      { label: "Rate", previous: "16", current: "25" }, { label: "VT", previous: "450", current: "Cleared" },
      { label: "PEEP", previous: "+5", current: "+8" }, { label: "PS", previous: "Not recorded", current: "10" }
    ]);
  });
  it("does not invent previous values for older entries", () => {
    expect(icuHistoryChanges({ event_type: "updated", event_data: { settings: "Rate 25" } } as IcuPatientEventRecord)).toBeNull();
  });
  it("shows note changes without device or settings information", () => {
    expect(icuHistoryChanges(event({}, { action: "note_updated", previousNotes: "Reassess after rounds", notes: null }))).toEqual([{ label: "Note", previous: "Reassess after rounds", current: "Cleared" }]);
  });
  it("shows trach size and XLT changes without unchanged trach type", () => {
    expect(icuHistoryChanges(event({ airway: "Trach 6 Shiley XLT" }, { previousState: { ...before, airway: "Trach 7 Shiley" } }))).toEqual([{ label: "Trach size", previous: "7", current: "6" }, { label: "XLT", previous: "No", current: "Yes" }]);
  });
  it("does not treat one-time procedures as settings changes", () => {
    expect(icuHistoryChanges(event({}, { action: "procedure_recorded" }))).toBeNull();
  });
});
