import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IcuRoundingActions } from "./IcuRoundingActions";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
const patient = { id: "test", bed: "C221", device_type: "nasal_cannula", updated_at: "2026-11-22T12:00:00Z", is_active: true } as IcuPatientRecord;
describe("ICU treatment and critical actions", () => {
  it("shows Critical Vent only for active or additional vent modalities, not previous settings", () => {
    const props = { saving: false, onSave: vi.fn() };
    const { rerender } = render(<IcuRoundingActions {...props} record={patient} />);
    expect(screen.queryByRole("button", { name: "Critical Vent" })).not.toBeInTheDocument();
    rerender(<IcuRoundingActions {...props} record={{ ...patient, rounding_data: { previousSettings: { device_type: "vent" } } }} />);
    expect(screen.queryByRole("button", { name: "Critical Vent" })).not.toBeInTheDocument();
    rerender(<IcuRoundingActions {...props} record={{ ...patient, rounding_data: { modalities: { vent: { vent_mode: "apvcmv" } } } }} />);
    expect(screen.getByRole("button", { name: "Critical Vent" })).toBeEnabled();
    rerender(<IcuRoundingActions {...props} record={{ ...patient, device_type: "vent" }} />);
    expect(screen.getByRole("button", { name: "Critical Vent" })).toBeEnabled();
  });
  it("requires both choices, saves with the captured version, and preserves the panel on failure", async () => {
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<IcuRoundingActions record={patient} saving={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Treatment" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Treatment"), { target: { value: "Nebulizer" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "Q4WA" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("treatment", { name: "Nebulizer", frequency: "Q4WA" }, patient.updated_at));
    expect(screen.getByRole("form", { name: "Treatment for C221" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  });
});
