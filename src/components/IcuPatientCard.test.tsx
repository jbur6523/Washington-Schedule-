import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IcuPatientCard } from "@/components/IcuCommandCenterClient";
import { IcuReadOnlyCard } from "@/components/IcuReadOnlyViews";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";

function record(overrides: Partial<IcuPatientRecord> = {}): IcuPatientRecord {
  return {
    id: "vent-1",
    department_id: "department-1",
    bed: "C223",
    device_type: "vent",
    airway_size: "7.5",
    airway_at: "23",
    airway_location: "teeth",
    vent_mode: "apvcmv",
    rate: 16,
    tidal_volume: 400,
    peep: 5,
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
    flow: null,
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
    created_by_staff_profile_id: null,
    updated_by_staff_profile_id: null,
    created_at: "2026-08-22T15:00:00.000Z",
    updated_at: "2026-08-22T15:00:00.000Z",
    ...overrides
  };
}

function renderCard(icuRecord: IcuPatientRecord, shiftEvents = new Set<"ct" | "mri">()) {
  const callbacks = {
    onSaveNote: vi.fn(),
    onUpdate: vi.fn(),
    onDiscontinue: vi.fn(),
    onHistory: vi.fn(),
    onToggleVentStatus: vi.fn(),
    onNoteShiftEvent: vi.fn(),
    onToggleStandby: vi.fn()
  };
  const view = render(
    <IcuPatientCard
      record={icuRecord}
      shiftEvents={shiftEvents}
      actionSaving={false}
      {...callbacks}
    />
  );
  return { ...callbacks, unmount: view.unmount };
}

describe("IcuPatientCard Vent actions", () => {
  it("renders an SBT Vent blue and keeps CT/MRI inside the overflow menu", () => {
    const callbacks = renderCard(record({ is_sbt: true }));
    const card = screen.getByRole("article");

    expect(card).toHaveClass("bg-blue-50");
    expect(card).toHaveTextContent("Vent – APVCMV");
    expect(card).toHaveTextContent("SBT");
    expect(card).not.toHaveTextContent("Not Critical");
    expect(card).not.toHaveTextContent("Not Standby");
    expect(card).not.toHaveTextContent("CT");
    expect(card).not.toHaveTextContent("MRI");

    fireEvent.click(screen.getByRole("button", { name: "Open actions for C223 Vent" }));
    const dialog = screen.getByRole("dialog", { name: "C223 Vent" });
    expect(within(dialog).getByText("Vent Status")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Standby" }));
    expect(callbacks.onToggleStandby).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole("button", { name: "CT" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "CT" }));
    expect(callbacks.onNoteShiftEvent).toHaveBeenCalledWith("ct");
  });

  it("renders Standby on the status line and gives it yellow priority over SBT", () => {
    renderCard(record({ is_sbt: true, is_standby: true }));
    const card = screen.getByRole("article");

    expect(card).toHaveClass("bg-amber-50");
    expect(card).toHaveTextContent("SBT · Standby");
    expect(card).not.toHaveTextContent("Not Standby");
  });

  it("gives Critical red priority while retaining all non-color modifiers", () => {
    renderCard(record({
      is_critical_vent: true,
      is_sbt: true,
      is_prone: true,
      is_flolan: true,
      is_standby: true
    }), new Set<"ct" | "mri">(["ct"]));
    const card = screen.getByRole("article");

    expect(card).toHaveClass("bg-rose-50");
    expect(card).toHaveTextContent("Critical Vent – APVCMV");
    expect(card).toHaveTextContent("SBT · Proned · On Flolan · Standby");

    fireEvent.click(screen.getByRole("button", { name: "Open actions for C223 Vent" }));
    expect(screen.getByRole("button", { name: /CT Noted this shift/ })).toBeDisabled();
  });

  it("does not render an empty overflow menu for non-Vent equipment", () => {
    renderCard(record({ device_type: "hfnc", vent_mode: null, is_sbt: false }));

    expect(screen.queryByRole("button", { name: /Open actions/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discontinue" })).toBeInTheDocument();
  });

  it.each(["vent", "bipap", "cpap", "hfnc", "cool_aerosol"] as const)(
    "renders the inline Notes editor for %s patients",
    (deviceType) => {
      renderCard(record({
        device_type: deviceType,
        vent_mode: deviceType === "vent" ? "apvcmv" : null
      }));

      expect(screen.getByLabelText("Notes")).toHaveAttribute("placeholder", "Add note…");
    }
  );

  it("prepopulates a saved note after settings and saves only after it changes", () => {
    const callbacks = renderCard(record({ notes: "Weaning trial planned after rounds" }));
    const card = screen.getByRole("article");
    const settings = within(card).getByText(/Rate 16/);
    const note = within(card).getByLabelText("Notes");
    const updated = within(card).getByText(/Updated/);

    expect(note).toHaveValue("Weaning trial planned after rounds");
    expect(settings.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(updated) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).queryByRole("button", { name: "Save Note" })).not.toBeInTheDocument();

    fireEvent.change(note, { target: { value: "Weaning trial after rounds" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save Note" }));
    expect(callbacks.onSaveNote).toHaveBeenCalledWith("Weaning trial after rounds");
  });

  it("allows an existing note to be cleared", () => {
    const callbacks = renderCard(record({ notes: "Existing ICU note" }));
    const note = screen.getByLabelText("Notes");

    fireEvent.change(note, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Note" }));

    expect(callbacks.onSaveNote).toHaveBeenCalledWith("   ");
  });
});

describe("IcuReadOnlyCard notes", () => {
  it("shows a saved note and omits an empty note row", () => {
    const { unmount } = render(<IcuReadOnlyCard record={record({ notes: "Family update after rounds" })} />);
    expect(screen.getByRole("article")).toHaveTextContent("Note: Family update after rounds");

    unmount();
    render(<IcuReadOnlyCard record={record({ notes: null })} />);
    expect(screen.queryByText(/Note:/)).not.toBeInTheDocument();
  });
});
