import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IcuModalityActions } from "./IcuModalityActions";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";

const record = { device_type: "hfnc", updated_at: "2026-10-06T00:00:00Z" } as IcuPatientRecord;
describe("saved ICU modalities", () => {
  it("saves PCMV pressure control instead of tidal volume", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<IcuModalityActions record={record} saving={false} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Add additional" }));
    fireEvent.change(screen.getByLabelText("Device"), { target: { value: "vent" } });
    fireEvent.change(screen.getByLabelText("Vent Mode"), { target: { value: "pcmv" } });
    expect(screen.queryByLabelText("Tidal Volume")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Pressure Control"), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Save modality" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("vent", expect.objectContaining({ pressure_control: 18 }), "save", record.updated_at));
    expect(save.mock.calls[0][1]).not.toHaveProperty("tidal_volume");
  });
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
  it("switches to saved settings with one click and no confirmation", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<IcuModalityActions record={{ ...record, rounding_data: { modalities: { cool_aerosol: { flow: 15, fio2: 50 } } } }} saving={false} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to Cool Aerosol" }));
    expect(save).toHaveBeenCalledWith("cool_aerosol", {}, "switch", record.updated_at);
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Switch to Cool Aerosol" })).toBeEnabled());
  });
  it("offers all other device types and shows their settings", () => {
    render(<IcuModalityActions record={record} saving={false} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add additional" }));
    const device = screen.getByLabelText("Device") as HTMLSelectElement;
    expect(Array.from(device.options).map(option => option.text)).toEqual(["Vent", "BiPAP", "CPAP", "Cool Aerosol", "Nasal Cannula", "Non Rebreather", "Venturi Mask", "Ozymizer"]);
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
  it("blocks duplicate switches while the request is pending", async () => {
    let finish!: (value: boolean) => void;
    const save = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<IcuModalityActions record={{ ...record, rounding_data: { modalities: { bipap: { ipap: 14 } } } }} saving={false} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to BiPAP" }));
    const button = screen.getByRole("button", { name: "Switching..." });
    expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discontinue BiPAP" })).toBeDisabled();
    fireEvent.click(button);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finish(true));
  });
  it.each([false, "reject"])("shows failed switches and allows retry: %s", async (result) => {
    const save = result === "reject" ? vi.fn().mockRejectedValue(new Error("Network")) : vi.fn().mockResolvedValue(false);
    const saved = { ...record, rounding_data: { modalities: { bipap: { ipap: 14 } } } };
    const { rerender } = render(<IcuModalityActions record={saved} saving={false} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to BiPAP" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not switch");
    save.mockResolvedValue(true);
    rerender(<IcuModalityActions record={{ ...saved, updated_at: "new-version" }} saving={false} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to BiPAP" }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith("bipap", {}, "switch", "new-version"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
