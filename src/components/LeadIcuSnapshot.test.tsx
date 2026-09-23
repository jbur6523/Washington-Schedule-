import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeadIcuSnapshot } from "./LeadIcuSnapshot";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
import { formatIcuAirway, formatIcuDeviceSummary, formatIcuSettings, icuBedOptions, icuDeviceLabels } from "@/lib/icu-command-center/utils";
import { availableIcuBeds } from "@/lib/icu-command-center/rooms";

function patientRecord(overrides: Partial<IcuPatientRecord> = {}): IcuPatientRecord {
  return {
    id: "patient-1",
    department_id: "department-1",
    bed: "C223",
    device_type: "hfnc",
    airway_size: null,
    airway_at: null,
    airway_location: null,
    airway_type: null,
    trach_type: null,
    trach_xlt: false,
    vent_mode: null,
    rate: null,
    tidal_volume: null,
    peep: null,
    fio2: 40,
    ps: null,
    t_high: null,
    t_low: null,
    p_high: null,
    p_low: null,
    percent_min_vol: null,
    ipap: null,
    epap: null,
    cpap: null,
    flow: 40,
    notes: null,
    is_critical_vent: false,
    is_sbt: false,
    is_flolan: false,
    is_prone: false,
    is_standby: false,
    ventilator_outcome: null,
    discontinued_at: null,
    discontinued_by_staff_profile_id: null,
    is_active: true,
    created_by_staff_profile_id: "staff-1",
    updated_by_staff_profile_id: "staff-1",
    created_at: "2026-09-01T19:00:00.000Z",
    updated_at: "2026-09-01T19:00:00.000Z",
    ...overrides
  };
}

const props = { loading: false, error: "", message: "", busy: false, onAdd: vi.fn(), onDiscontinue: vi.fn() };
describe("Lead ICU Snapshot", () => {
  it("groups and sorts all active ICU and IMC records without a six-row cap", () => {
    const records = ["E242", "D239", "C223", "D230", "E241", "C220", "E248", "IMC - 201", "IMC - 219"].map(bed => patientRecord({ id: bed, bed }));
    render(<LeadIcuSnapshot {...props} records={[...records, patientRecord({ id: "inactive", bed: "IMC - 218", is_active: false }), patientRecord({ id: "other", bed: "Z100" })]} />);
    const icu = within(screen.getByRole("region", { name: /^ICU C-E/ }));
    const imc = within(screen.getByRole("region", { name: /^IMC/ }));
    expect(icu.getAllByRole("rowheader").map(el => el.textContent)).toEqual(["C220", "C223", "D230", "D239", "E241", "E242", "E248"]);
    expect(imc.getAllByRole("rowheader").map(el => el.textContent)).toEqual(["IMC - 201", "IMC - 219"]);
    expect(screen.queryByText("IMC - 218")).not.toBeInTheDocument();
    expect(screen.queryByText("Z100")).not.toBeInTheDocument();
    expect(icu.getAllByRole("columnheader").map(el => el.textContent)).toEqual(["Room Number", "Device (Settings)", "Status", "Action"]);
    fireEvent.click(screen.getByRole("button", { name: "Add Device" }));
    expect(props.onAdd).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discontinue IMC - 201" }));
    expect(props.onDiscontinue).toHaveBeenCalledWith(records[7]);
  });

  it.each(Object.keys(icuDeviceLabels) as IcuPatientRecord["device_type"][])("uses ICU formatting for %s and keeps notes below settings", device_type => {
    const record = patientRecord({ device_type, vent_mode: device_type === "vent" ? "apvcmv" : null, airway_size: device_type === "vent" ? "7.5" : null, rate: 18, peep: 5, ipap: 12, epap: 6, cpap: 8, notes: "Saved ICU note" });
    render(<LeadIcuSnapshot {...props} records={[record]} />);
    const settings = screen.getByText(formatIcuSettings(record));
    expect(screen.getByText(formatIcuDeviceSummary(record))).toBeInTheDocument();
    if (formatIcuAirway(record)) expect(screen.getByText(formatIcuAirway(record))).toBeInTheDocument();
    const note = screen.getByText("Note: Saved ICU note");
    expect(settings.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.closest("td")).toBe(settings.closest("td"));
    expect(screen.queryByRole("button", { name: /Update|Edit/ })).not.toBeInTheDocument();
  });

  it("shows all saved statuses rather than an invented summary", () => {
    render(<LeadIcuSnapshot {...props} records={[patientRecord({ device_type: "vent", is_critical_vent: true, is_sbt: true, is_flolan: true, is_prone: true, is_standby: true })]} />);
    for (const status of ["Critical", "SBT", "On Flolan", "Proned", "Standby"]) expect(screen.getByText(status)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("distinguishes errors and loading from an empty board", () => {
    const view = render(<LeadIcuSnapshot {...props} records={[]} loading />);
    expect(screen.getAllByText("Loading devices…")).toHaveLength(2);
    view.rerender(<LeadIcuSnapshot {...props} records={[]} error="Could not load ICU Command Center." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load ICU");
    expect(screen.queryByText("No active respiratory devices.")).not.toBeInTheDocument();
  });

  it("uses the same configured and previously saved rooms for both add surfaces", () => {
    const rooms = availableIcuBeds([{ bed: "IMC - 201" }, { bed: "IMC - 219" }, { bed: "IMC - 201" }]);
    expect(rooms).toEqual(expect.arrayContaining([...icuBedOptions, "IMC - 201", "IMC - 219"]));
    expect(rooms.filter(room => room === "IMC - 201")).toHaveLength(1);
    expect(availableIcuBeds([]).filter(room => room.startsWith("IMC - "))).toEqual(
      Array.from({ length: 19 }, (_, index) => `IMC - ${201 + index}`)
    );
  });
});
