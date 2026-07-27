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
      name: "Director ICU Summary"
    });
    expect(metricValue(region, "Vents")).toContain("5");
    expect(metricValue(region, "Vents")).not.toContain("6");
    expect(metricValue(region, "HFNC")).toContain("1");
    expect(metricValue(region, "BiPAP")).toContain("2");
    expect(metricValue(region, "Critical Vents")).toContain("0");
    expect(region).toHaveTextContent("Vents source: Lead Command Center");
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
      name: "Director ICU Summary"
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
      name: "Director ICU Summary"
    });
    expect(metricValue(region, "Vents")).toContain("—");
    expect(metricValue(region, "Vents")).not.toContain("6");
    expect(region).toHaveTextContent("Official vent count unavailable.");
  });
});
