import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  formatShiftStatusPrintDate,
  ShiftStatusPrintLayout,
  type ShiftStatusPrintData
} from "@/components/ShiftStatusPrintLayout";

const reportData: ShiftStatusPrintData = {
  shiftDate: "2026-08-17",
  shiftType: "day",
  updatedByName: "Stephanie Ortiz",
  rtsOnShift: "7",
  rtsNeeded: "7.1",
  rvuTotal: "190.66",
  vents: "6",
  bipaps: "13",
  cSections: "3",
  vaginalDeliveries: "0",
  cabg: "0",
  bronchs: "1",
  sputumInductions: "0",
  mri: "2",
  otherProcedures: "Four scopes expected",
  shiftNotes: "V60 available for the incoming shift."
};

describe("ShiftStatusPrintLayout", () => {
  it("renders the selected shift and all operational report sections", () => {
    render(<ShiftStatusPrintLayout data={reportData} />);
    const report = screen.getByTestId("shift-status-print-layout");

    expect(within(report).getByRole("heading", { name: "Shift Status Report", hidden: true })).toBeInTheDocument();
    expect(report).toHaveTextContent("08/17/2026");
    expect(report).toHaveTextContent("Day Shift");
    expect(report).toHaveTextContent("Updated by: Stephanie Ortiz");
    expect(report).toHaveTextContent("RTs On Shift7");
    expect(report).toHaveTextContent("RTs Needed7.1");
    expect(report).toHaveTextContent("RVUs190.66");
    expect(report).toHaveTextContent("Vents6");
    expect(report).toHaveTextContent("BiPAPs13");
    expect(report).toHaveTextContent("C-Sections3");
    expect(report).toHaveTextContent("Bronchs1");
    expect(report).toHaveTextContent("Four scopes expected");
    expect(report).toHaveTextContent("V60 available for the incoming shift.");
    expect(within(report).queryByRole("button")).not.toBeInTheDocument();
    expect(within(report).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("prints zero for blank procedure counts and None for blank narrative fields", () => {
    render(
      <ShiftStatusPrintLayout
        data={{
          ...reportData,
          cSections: "",
          vaginalDeliveries: "",
          cabg: "",
          bronchs: "",
          sputumInductions: "",
          mri: "",
          otherProcedures: "   ",
          shiftNotes: ""
        }}
      />
    );
    const report = screen.getByTestId("shift-status-print-layout");

    expect(within(report).getAllByText("0")).toHaveLength(6);
    expect(within(report).getAllByText("None")).toHaveLength(2);
  });

  it("formats database dates without timezone conversion", () => {
    expect(formatShiftStatusPrintDate("2026-08-17")).toBe("08/17/2026");
    expect(formatShiftStatusPrintDate("not-a-date")).toBe("not-a-date");
  });
});
