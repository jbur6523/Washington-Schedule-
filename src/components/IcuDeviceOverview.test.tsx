import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IcuDeviceOverview } from "./IcuDeviceOverview";
import type { IcuPatientRecord } from "@/lib/icu-command-center/types";

describe("ICU overview room lists", () => {
  it("lists sorted active rooms under the matching count, separating critical vents", () => {
    const records = [
      { id: "1", bed: "C227", device_type: "vent", is_active: true },
      { id: "2", bed: "C220", device_type: "vent", is_active: true },
      { id: "3", bed: "C221", device_type: "vent", is_active: true, is_critical_vent: true },
      { id: "4", bed: "D230", device_type: "hfnc", is_active: true },
      { id: "5", bed: "D231", device_type: "bipap", is_active: true },
      { id: "7", bed: "D232", device_type: "cool_aerosol", is_active: true },
      { id: "8", bed: "D233", device_type: "cool_aerosol", is_active: false },
      { id: "6", bed: "C224", device_type: "vent", is_active: false }
    ] as IcuPatientRecord[];
    render(<IcuDeviceOverview records={records} lastUpdated="Today" />);
    const vents = screen.getByLabelText("Vents rooms");
    expect(Array.from(vents.children).map(child => child.textContent)).toEqual(["C220", "C227"]);
    expect(within(vents.parentElement!).getByText("2")).toBeInTheDocument();
    expect(screen.getByLabelText("Critical rooms")).toHaveTextContent("C221");
    expect(screen.getByLabelText("HFNC rooms")).toHaveTextContent("D230");
    expect(screen.getByLabelText("BiPAP rooms")).toHaveTextContent("D231");
    expect(screen.getByLabelText("Cool Aerosol rooms")).toHaveTextContent("D232");
    expect(within(screen.getByLabelText("Cool Aerosol rooms").parentElement!).getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("D233")).not.toBeInTheDocument();
    expect(screen.getAllByRole("term").map(term => term.textContent)).toEqual(["Vents", "Critical", "BiPAP", "HFNC", "Cool Aerosol"]);
    expect(screen.queryByText("C224")).not.toBeInTheDocument();
  });
});
