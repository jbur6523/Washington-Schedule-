// @vitest-environment node

import { describe, expect, it } from "vitest";
import { latestDirectorCardUpdate } from "@/lib/director-dashboard/update-metadata";

describe("latestDirectorCardUpdate", () => {
  it("selects the employee and timestamp from the newest meaningful card update", () => {
    expect(
      latestDirectorCardUpdate(
        { updatedAt: "2026-08-08T08:00:00.000Z", updatedBy: "Snapshot RT" },
        { updatedAt: "2026-08-08T09:00:00.000Z", updatedBy: "Vent RT" }
      )
    ).toEqual({
      updatedAt: "2026-08-08T09:00:00.000Z",
      updatedBy: "Vent RT"
    });
  });

  it("ignores missing or invalid candidates and normalizes a missing employee", () => {
    expect(
      latestDirectorCardUpdate(
        null,
        { updatedAt: "not-a-date", updatedBy: "Ignored" },
        { updatedAt: "2026-08-08T09:00:00.000Z", updatedBy: "" }
      )
    ).toEqual({
      updatedAt: "2026-08-08T09:00:00.000Z",
      updatedBy: "Unknown"
    });
    expect(latestDirectorCardUpdate(null, undefined)).toBeNull();
  });
});
