import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DirectorDashboardIcuSummaryView
} from "@/components/DirectorDashboardIcuSummary";
import type {
  IcuDeviceType,
  IcuPatientRecord
} from "@/lib/icu-command-center/types";
import { getIcuSnapshotCounts } from "@/lib/icu-command-center/utils";
import { composeDirectorDashboardIcuSummary } from "@/lib/director-dashboard/icu-summary";
import type { OfficialVentCountUpdate } from "@/lib/shift-status/types";

function record(id: string, deviceType: IcuDeviceType): IcuPatientRecord {
  return {
    id,
    department_id: "department-1",
    bed: `ICU-${id}`,
    device_type: deviceType,
    airway_size: null,
    airway_at: null,
    airway_location: null,
    vent_mode: null,
    rate: null,
    tidal_volume: null,
    peep: null,
    fio2: null,
    ps: null,
    t_high: null,
    t_low: null,
    p_high: null,
    p_low: null,
    percent_min_vol: null,
    ipap: null,
    epap: null,
    cpap: null,
    flow: null,
    is_critical_vent: false,
    is_standby: false,
    ventilator_outcome: null,
    discontinued_at: null,
    discontinued_by_staff_profile_id: null,
    is_active: true,
    created_by_staff_profile_id: null,
    updated_by_staff_profile_id: null,
    created_at: "2026-07-27T21:00:00.000Z",
    updated_at: "2026-07-27T21:00:00.000Z"
  };
}

const rawRecords = [
  ...Array.from({ length: 6 }, (_, index) => record(`vent-${index}`, "vent")),
  record("hfnc-1", "hfnc"),
  record("bipap-1", "bipap"),
  record("bipap-2", "bipap")
];

const officialVent: OfficialVentCountUpdate = {
  id: 1,
  department_id: "department-1",
  shift_date: "2026-07-27",
  shift_type: "day",
  vent_count: 5,
  source: "lead_command_center",
  updated_by_staff_profile_id: "lead-1",
  updated_by_name: "Lead RT",
  created_at: "2026-07-27T22:08:00.000Z"
};

function metricValue(region: HTMLElement, label: string) {
  const labelElement = within(region).getByText(label);
  return labelElement.parentElement?.textContent ?? "";
}

describe("DirectorDashboardIcuSummary", () => {
  it("composes official Vents with raw ICU HFNC, BiPAP, and Critical Vent counts", () => {
    const rawIcuCounts = getIcuSnapshotCounts(rawRecords);
    const summary = composeDirectorDashboardIcuSummary({
      officialVentCount: officialVent.vent_count,
      rawIcuCounts
    });

    expect(rawIcuCounts.vents).toBe(6);
    expect(summary).toEqual({
      vents: 5,
      hfnc: 1,
      bipap: 2,
      criticalVents: 0
    });

    render(
      <DirectorDashboardIcuSummaryView
        summary={summary}
        officialVent={officialVent}
        officialVentLoading={false}
        officialVentError=""
        timezone="America/Los_Angeles"
        records={rawRecords}
        rawIcuLoading={false}
        rawIcuError=""
        onReload={vi.fn()}
      />
    );

    const region = screen.getByRole("region", {
      name: "Leadership ICU Summary"
    });
    expect(metricValue(region, "Vents")).toContain("5");
    expect(metricValue(region, "Vents")).not.toContain("6");
    expect(metricValue(region, "HFNC")).toContain("1");
    expect(metricValue(region, "BiPAP")).toContain("2");
    expect(metricValue(region, "Critical Vents")).toContain("0");
    expect(region).toHaveTextContent("Last updated: 07/27/2026 15:08");
    expect(region).toHaveTextContent("Updated by: Lead RT");
    expect(region).not.toHaveTextContent("Vents source:");
    expect(region).not.toHaveTextContent("ICU details updated:");
    expect(region).not.toHaveTextContent("Vents updated by:");
  });

  it("keeps a valid zero from a prior date after refresh and unrelated ICU detail updates", () => {
    const priorZero: OfficialVentCountUpdate = {
      ...officialVent,
      shift_date: "2026-07-26",
      shift_type: "night",
      vent_count: 0,
      source: "icu_command_center",
      created_at: "2026-07-27T03:00:00.000Z"
    };
    const summary = composeDirectorDashboardIcuSummary({
      officialVentCount: priorZero.vent_count,
      rawIcuCounts: getIcuSnapshotCounts(rawRecords)
    });
    const viewProps = {
      summary,
      officialVent: priorZero,
      officialVentLoading: false,
      officialVentError: "",
      timezone: "America/Los_Angeles",
      records: rawRecords,
      rawIcuLoading: false,
      rawIcuError: "",
      onReload: vi.fn()
    };
    const { rerender } = render(
      <DirectorDashboardIcuSummaryView {...viewProps} />
    );

    let region = screen.getByRole("region", {
      name: "Leadership ICU Summary"
    });
    expect(metricValue(region, "Vents")).toContain("0");
    expect(region).toHaveTextContent("Last updated: 07/27/2026 14:00");
    expect(region).toHaveTextContent("Updated by: Unknown");
    expect(region).not.toHaveTextContent("Vents source:");

    const refreshedRecords = rawRecords.map((icuRecord, index) =>
      index === 0
        ? {
            ...icuRecord,
            fio2: 45,
            updated_at: "2026-07-28T17:00:00.000Z",
            updated_by_name: "ICU RT"
          }
        : icuRecord
    );
    rerender(
      <DirectorDashboardIcuSummaryView
        {...viewProps}
        records={refreshedRecords}
      />
    );

    region = screen.getByRole("region", { name: "Leadership ICU Summary" });
    expect(metricValue(region, "Vents")).toContain("0");
    expect(region).toHaveTextContent("Last updated: 07/28/2026 10:00");
    expect(region).toHaveTextContent("Updated by: ICU RT");
    expect(region).not.toHaveTextContent("Vents source:");
  });

  it("uses a neutral empty state only when no Vent count has ever been recorded", () => {
    render(
      <DirectorDashboardIcuSummaryView
        summary={composeDirectorDashboardIcuSummary({
          officialVentCount: null,
          rawIcuCounts: getIcuSnapshotCounts([])
        })}
        officialVent={null}
        officialVentLoading={false}
        officialVentError=""
        timezone="America/Los_Angeles"
        records={[]}
        rawIcuLoading={false}
        rawIcuError=""
        onReload={vi.fn()}
      />
    );

    const region = screen.getByRole("region", {
      name: "Leadership ICU Summary"
    });
    expect(region).toHaveTextContent("No vent count recorded yet.");
    expect(region).not.toHaveTextContent("No official vent update for this shift.");
  });

  it("never falls back to the raw ICU Vent count while the official value is loading", () => {
    const rawIcuCounts = getIcuSnapshotCounts(rawRecords);
    const summary = composeDirectorDashboardIcuSummary({
      officialVentCount: null,
      rawIcuCounts
    });

    render(
      <DirectorDashboardIcuSummaryView
        summary={summary}
        officialVent={null}
        officialVentLoading
        officialVentError=""
        timezone="America/Los_Angeles"
        records={rawRecords}
        rawIcuLoading={false}
        rawIcuError=""
        onReload={vi.fn()}
      />
    );

    const region = screen.getByRole("region", {
      name: "Leadership ICU Summary"
    });
    expect(metricValue(region, "Vents")).toContain("—");
    expect(metricValue(region, "Vents")).not.toContain("6");
    expect(region).toHaveTextContent("Loading official vent count...");
  });

  it("shows official-count errors without substituting the internal ICU Vent count", () => {
    const summary = composeDirectorDashboardIcuSummary({
      officialVentCount: null,
      rawIcuCounts: getIcuSnapshotCounts(rawRecords)
    });

    render(
      <DirectorDashboardIcuSummaryView
        summary={summary}
        officialVent={null}
        officialVentLoading={false}
        officialVentError="Official vent count unavailable."
        timezone="America/Los_Angeles"
        records={rawRecords}
        rawIcuLoading={false}
        rawIcuError=""
        onReload={vi.fn()}
      />
    );

    const region = screen.getByRole("region", {
      name: "Leadership ICU Summary"
    });
    expect(metricValue(region, "Vents")).toContain("—");
    expect(metricValue(region, "Vents")).not.toContain("6");
    expect(region).toHaveTextContent("Official vent count unavailable.");
  });
});
