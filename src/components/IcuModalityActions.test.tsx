import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IcuModalityActions } from "./IcuModalityActions";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";

const record = { device_type: "hfnc", updated_at: "2026-10-06T00:00:00Z" } as IcuPatientRecord;
describe("saved ICU modalities", () => {
  it("saves CPAP pressure and FiO2 together", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<IcuModalityActions record={record} saving={false} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Add additional" }));
    fireEvent.change(screen.getByLabelText("Device"), { target: { value: "cpap" } });
    fireEvent.change(screen.getByLabelText("CPAP"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("FiO₂ (%)"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Save modality" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("cpap", { cpap: 5, fio2: 40 }, "save", record.updated_at));
  });
  it("shows CPAP FiO2 when reviewing a saved modality", () => {
    render(<IcuModalityActions record={{ ...record, rounding_data: { modalities: { cpap: { cpap: 5, fio2: 40 } } } }} saving={false} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to CPAP" }));
    expect(screen.getByText("CPAP 5 - FiO2 40%")).toBeInTheDocument();
  });
  it("offers all other device types and shows their settings", () => {
    render(<IcuModalityActions record={record} saving={false} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add additional" }));
    const device = screen.getByLabelText("Device") as HTMLSelectElement;
    expect(Array.from(device.options).map(option => option.text)).toEqual(["Vent", "BiPAP", "CPAP", "Cool Aerosol"]);
    fireEvent.change(device, { target: { value: "cpap" } });
    expect(screen.getByLabelText("CPAP")).toBeTruthy();
    fireEvent.change(device, { target: { value: "vent" } });
    expect(screen.getByLabelText("Vent Mode")).toBeTruthy();
  });
  it("discontinues only the selected saved modality after confirmation", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<IcuModalityActions record={{ ...record, rounding_data: { modalities: { bipap: { ipap: 14 } } } }} saving={false} onSave={save} />);
    expect(screen.queryByText("Edit saved BiPAP")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Discontinue BiPAP" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/Current support stays HFNC/)).toBeTruthy();
    fireEvent.submit(screen.getByRole("form", { name: "Discontinue BiPAP" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("bipap", expect.any(Object), "discontinue", record.updated_at));
  });
  it("saves an additional modality without activating it", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<IcuModalityActions record={record} saving={false} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Add additional" }));
    fireEvent.change(screen.getByLabelText("Device"), { target: { value: "bipap" } });
    fireEvent.change(screen.getByLabelText("IPAP"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("EPAP"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save modality" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("bipap", { ipap: 14, epap: 6, rate: null, fio2: null }, "save", record.updated_at));
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
