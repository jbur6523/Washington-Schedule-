import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    airway_type: null,
    trach_type: null,
    trach_xlt: false,
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

function renderCard(icuRecord: IcuPatientRecord) {
  const callbacks = {
    onSaveNote: vi.fn().mockResolvedValue(true),
    onUpdate: vi.fn(),
    onDiscontinue: vi.fn(),
    onHistory: vi.fn(),
    onRoundingAction: vi.fn().mockResolvedValue(true),
    onToggleStandby: vi.fn()
  };
  const view = render(
    <IcuPatientCard
      record={icuRecord}
      actionSaving={false}
      {...callbacks}
    />
  );
  return { ...callbacks, unmount: view.unmount };
}

describe("IcuPatientCard Vent actions", () => {
  it("shows visible actions without inferring SBT from Pressure Support", () => {
    renderCard(record({ vent_mode: "spont" }));
    expect(screen.getByRole("button", { name: "SBT" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Critical" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Procedure" })).toBeVisible();
    expect(screen.queryByText("Last SBT:")).not.toBeInTheDocument();
    expect(screen.queryByText("Critical:")).not.toBeInTheDocument();
    expect(screen.queryByText("Last Procedure:")).not.toBeInTheDocument();
  });

  it("retains a passed SBT on continuous Pressure Support and prevents repeat Pass", () => {
    renderCard(record({ vent_mode: "spont", is_sbt: true, rounding_data: { sbt: { result: "Pass", at: "2026-10-06T15:00:00Z" } } }));
    expect(screen.getByRole("button", { name: "SBT" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("article")).toHaveTextContent("SBT Started: 10/06/2026");
    fireEvent.click(screen.getByRole("button", { name: "SBT" }));
    expect(screen.getByRole("radio", { name: "Pass" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Fail" })).toBeEnabled();
  });

  it("records a failure with required Other text, without changing settings", async () => {
    const callbacks = renderCard(record());
    fireEvent.click(screen.getByRole("button", { name: "SBT" }));
    fireEvent.click(screen.getByRole("radio", { name: "Fail" }));
    fireEvent.change(screen.getByLabelText("Failure reason"), { target: { value: "Other" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Other reason"), { target: { value: "Trial not tolerated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(callbacks.onRoundingAction).toHaveBeenCalledWith("sbt", { result: "Fail", reason: "Other", other: "Trial not tolerated" }, expect.any(String)));
  });

  it("supports multiple Critical options and explicit clearing", async () => {
    const callbacks = renderCard(record({ is_critical_vent: true, is_flolan: true, is_prone: true }));
    expect(screen.getByRole("article")).toHaveTextContent("Critical: Flolan · Proned");
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(screen.getByLabelText("Flolan")).toBeChecked();
    expect(screen.getByLabelText("Proned")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Turn Critical off" }));
    await waitFor(() => expect(callbacks.onRoundingAction).toHaveBeenCalledWith("critical", { flolan: false, proned: false, other: "" }, expect.any(String)));
  });

  it("records trach details with an optional date and no persistent Procedure highlight", async () => {
    const callbacks = renderCard(record({ rounding_data: { procedure: { name: "Bronch", at: "2026-10-06T15:00:00Z" } } }));
    expect(screen.getByRole("article")).toHaveTextContent("Last Procedure: Bronch — 10/06/2026");
    expect(screen.getByRole("button", { name: "Procedure" })).not.toHaveAttribute("aria-pressed");
    fireEvent.click(screen.getByRole("button", { name: "Procedure" }));
    fireEvent.change(screen.getByLabelText("Procedure"), { target: { value: "Trach" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "Shiley" } });
    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "6" } });
    fireEvent.click(screen.getByLabelText("XLT"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(callbacks.onRoundingAction).toHaveBeenCalledWith("procedure", { name: "Trach", other: "", trachType: "Shiley", size: "6", xlt: true, date: "" }, expect.any(String)));
  });

  it("does not render an empty overflow menu for non-Vent equipment", () => {
    renderCard(record({ device_type: "hfnc", vent_mode: null, is_sbt: false }));

    expect(screen.queryByRole("button", { name: /Open actions/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discontinue" })).toBeInTheDocument();
  });

  it("keeps the opening version when realtime refreshes an open action editor", async () => {
    const onRoundingAction = vi.fn().mockResolvedValue(false);
    const props = { actionSaving: false, onRoundingAction, onSaveNote: vi.fn(), onUpdate: vi.fn(), onDiscontinue: vi.fn(), onHistory: vi.fn(), onToggleStandby: vi.fn() };
    const view = render(<IcuPatientCard record={record()} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    fireEvent.click(screen.getByLabelText("Flolan"));
    view.rerender(<IcuPatientCard record={record({ updated_at: "2026-10-06T16:00:00Z" })} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onRoundingAction).toHaveBeenCalledWith("critical", { flolan: true, proned: false, other: "" }, "2026-08-22T15:00:00.000Z"));
    expect(screen.getByLabelText("Flolan")).toBeChecked();
  });

  it.each(["vent", "bipap", "cpap", "hfnc", "cool_aerosol"] as const)(
    "renders the compact Add Note action for %s patients",
    (deviceType) => {
      renderCard(record({
        device_type: deviceType,
        vent_mode: deviceType === "vent" ? "apvcmv" : null
      }));

      expect(screen.getByRole("button", { name: "+ Add Note" })).toBeInTheDocument();
      expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save Note" })).not.toBeInTheDocument();
    }
  );

  it("expands an empty editor and cancels without saving", () => {
    const callbacks = renderCard(record());

    fireEvent.click(screen.getByRole("button", { name: "+ Add Note" }));
    expect(screen.getByLabelText("Notes")).toHaveAttribute("placeholder", "Add note…");
    expect(screen.getByRole("button", { name: "Save Note" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Unsaved note" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add Note" })).toBeInTheDocument();
    expect(callbacks.onSaveNote).not.toHaveBeenCalled();
  });

  it("shows a saved note compactly, then prepopulates and saves an edit", async () => {
    const callbacks = renderCard(record({ notes: "Weaning trial planned after rounds" }));
    const card = screen.getByRole("article");
    const settings = within(card).getByText(/Rate 16/);
    const noteDisplay = within(card).getByText("Note:").closest("p");
    const updated = within(card).getByText(/Updated/);

    expect(card).toHaveTextContent("Note: Weaning trial planned after rounds");
    expect(noteDisplay).not.toBeNull();
    if (!noteDisplay) {
      throw new Error("Expected the saved note display.");
    }
    expect(settings.compareDocumentPosition(noteDisplay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(noteDisplay.compareDocumentPosition(updated) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).queryByLabelText("Notes")).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Edit note" }));
    const note = within(card).getByLabelText("Notes");
    expect(note).toHaveValue("Weaning trial planned after rounds");
    expect(within(card).getByRole("button", { name: "Save Note" })).toBeDisabled();

    fireEvent.change(note, { target: { value: "Weaning trial after rounds" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save Note" }));
    await waitFor(() => expect(callbacks.onSaveNote).toHaveBeenCalledWith("Weaning trial after rounds", expect.any(String)));
    await waitFor(() => expect(within(card).queryByLabelText("Notes")).not.toBeInTheDocument());
  });

  it("restores the saved display when an edit is canceled", () => {
    const callbacks = renderCard(record({ notes: "Existing ICU note" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Unsaved replacement" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("article")).toHaveTextContent("Note: Existing ICU note");
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
    expect(callbacks.onSaveNote).not.toHaveBeenCalled();
  });

  it("allows an existing note to be cleared", async () => {
    const callbacks = renderCard(record({ notes: "Existing ICU note" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    const note = screen.getByLabelText("Notes");

    fireEvent.change(note, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Note" }));

    await waitFor(() => expect(callbacks.onSaveNote).toHaveBeenCalledWith("   ", expect.any(String)));
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
