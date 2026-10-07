import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IcuModalityActions } from "./IcuModalityActions";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";

const record = { device_type: "hfnc", updated_at: "2026-10-06T00:00:00Z" } as IcuPatientRecord;
describe("saved ICU modalities", () => {
  it("saves an additional modality without activating it", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<IcuModalityActions record={record} saving={false} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Add additional" }));
    fireEvent.change(screen.getByLabelText("IPAP"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("EPAP"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save modality" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("bipap", { ipap: 14, epap: 6, rate: null, fio2: null }, false, record.updated_at));
  });
  it("reviews stored settings before switching and blocks stale edits", () => {
    const save = vi.fn();
    const saved = { ...record, rounding_data: { modalities: { bipap: { ipap: 14, epap: 6, fio2: 35, rate: 12 } } } };
    const { rerender } = render(<IcuModalityActions record={saved} saving={false} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to BiPAP" }));
    expect(screen.getByText(/IPAP 14/)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    rerender(<IcuModalityActions record={{ ...saved, updated_at: "new-version" }} saving={false} onSave={save} />);
    expect(screen.getByRole("alert").textContent).toContain("This patient changed");
    expect(screen.getAllByRole("button", { name: "Switch to BiPAP" }).every(button => button.hasAttribute("disabled"))).toBe(true);
  });
});
