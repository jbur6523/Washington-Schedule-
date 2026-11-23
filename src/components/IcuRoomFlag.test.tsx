import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { IcuRoomFlag } from "./IcuRoomFlag";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";
const patient = { id: "p1", bed: "C221", updated_at: "v1", device_type: "hfnc", is_critical_vent: false } as IcuPatientRecord;

it("activates a persistent flag, saves an optional note with the new version, and removes it independently of Critical Vent", async () => {
  const save = vi.fn();
  function Harness() {
    const [record, setRecord] = useState(patient);
    return <IcuRoomFlag roomClass="text-teal-800" record={record} saving={false} onSave={async (action, payload, version) => {
      save(action, payload, version);
      setRecord({ ...record, updated_at: version + "x", rounding_data: { flag: { active: Boolean(payload.active), note: String(payload.note), at: "now" } } });
      return true;
    }} />;
  }
  render(<Harness />);
  const flag = screen.getByRole("button", { name: "Room flag for C221" });
  expect(flag).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(flag);
  await screen.findByLabelText("Flag note (optional)");
  expect(screen.getByText("C221")).toHaveClass("text-red-700");
  fireEvent.change(screen.getByLabelText("Flag note (optional)"), { target: { value: "Difficult Airway" } });
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith("flag", { active: true, note: "Difficult Airway" }, "v1x"));
  expect(screen.getByText("Difficult Airway")).toBeVisible();
  fireEvent.click(flag);
  fireEvent.click(screen.getByRole("button", { name: "Remove flag" }));
  await waitFor(() => expect(flag).toHaveAttribute("aria-pressed", "false"));
  expect(screen.getByText("C221")).toHaveClass("text-teal-800");
});

it("does not activate a flag when saving fails", async () => {
  render(<IcuRoomFlag roomClass="text-teal-800" record={patient} saving={false} onSave={vi.fn().mockResolvedValue(false)} />);
  fireEvent.click(screen.getByRole("button", { name: "Room flag for C221" }));
  await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false"));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});
