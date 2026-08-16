// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Director and WHHS RT Schedule source boundaries", () => {
  it("keeps Leadership's clinical-handoff resolution confined to the Leadership Dashboard", () => {
    const director = source("src/components/DirectorShiftStatusClient.tsx");
    const schedule = source("src/components/CurrentShiftStatusSummary.tsx");

    expect(director).toContain("fetchDirectorShiftStatusUpdates");
    expect(director).toContain("resolveDirectorCurrentClinicalShift");
    expect(schedule).not.toContain("fetchDirectorShiftStatusUpdates");
    expect(schedule).not.toContain("resolveDirectorCurrentClinicalShift");
  });

  it("keeps the schedule Lead-update path strictly current-shift", () => {
    const schedule = source("src/components/CurrentShiftStatusSummary.tsx");

    expect(schedule).toContain("fetchShiftStatusUpdates");
    expect(schedule).toContain("resolveCurrentShiftStatus");
    expect(schedule).toContain("No update has been submitted for the current shift yet.");
    expect(schedule).toContain('table: "shift_status_updates"');
    expect(schedule).not.toContain("icu_command_center");
  });
});
