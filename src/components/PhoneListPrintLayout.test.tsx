import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  formatPhoneListPrintDate,
  PhoneListPrintLayout
} from "@/components/PhoneListPrintLayout";
import { phoneListRows } from "@/lib/phone-list/rows";
import { emptyPhoneListAssignments } from "@/lib/phone-list/utils";

describe("PhoneListPrintLayout", () => {
  it("formats the selected date and renders the selected shift", () => {
    render(
      <PhoneListPrintLayout
        scheduleDate="2026-08-02"
        shiftType="night"
        assignments={emptyPhoneListAssignments()}
      />
    );

    const layout = screen.getByTestId("phone-list-print-layout");
    expect(within(layout).getByText("RESPIRATORY CARE PHONE LIST")).toBeInTheDocument();
    expect(within(layout).getByText("DATE: 08/02/2026")).toBeInTheDocument();
    expect(within(layout).getByText("NIGHT SHIFT")).toBeInTheDocument();
    expect(formatPhoneListPrintDate("2026-01-09")).toBe("01/09/2026");
  });

  it("renders every authoritative row in exact order and retains blank ruled fields", () => {
    render(
      <PhoneListPrintLayout
        scheduleDate="2026-08-02"
        shiftType="day"
        assignments={emptyPhoneListAssignments()}
      />
    );

    const layout = screen.getByTestId("phone-list-print-layout");
    const rows = Array.from(layout.querySelectorAll("[data-print-row-key]"));

    expect(rows).toHaveLength(31);
    expect(rows.map((row) => row.getAttribute("data-print-row-key"))).toEqual(
      phoneListRows.map((row) => row.key)
    );
    expect(within(layout).getByText("DAY SHIFT")).toBeInTheDocument();
    expect(
      rows.at(-1)?.getAttribute("data-print-row-key")
    ).toBe("additional_staff_3");
    expect(
      rows[0].querySelector('[data-print-field="staff-name"]')?.textContent?.trim()
    ).toBe("");
    expect(
      rows[0].querySelector('[data-print-field="phone-number"]')?.textContent?.trim()
    ).toBe("");
  });

  it("uses current assignment values without placing screen controls in printable content", () => {
    const assignments = emptyPhoneListAssignments();
    assignments[0] = {
      ...assignments[0],
      staffNameSnapshot: "A Very Long Respiratory Therapist Name",
      phoneNumber: "6303"
    };

    render(
      <PhoneListPrintLayout
        scheduleDate="2026-08-02"
        shiftType="day"
        assignments={assignments}
      />
    );

    const layout = screen.getByTestId("phone-list-print-layout");
    expect(
      within(layout).getByText("A Very Long Respiratory Therapist Name")
    ).toBeInTheDocument();
    expect(within(layout).getByText("6303")).toBeInTheDocument();
    expect(within(layout).queryByRole("button")).not.toBeInTheDocument();
    expect(within(layout).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(layout).queryByText("Save Draft")).not.toBeInTheDocument();
    expect(within(layout).queryByText(/Scheduled roster/)).not.toBeInTheDocument();
  });

  it("defines a one-page Letter portrait print contract", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/components/PhoneListPrintLayout.module.css"),
      "utf8"
    );

    expect(css).toContain("@page");
    expect(css).toContain("size: letter portrait");
    expect(css).toContain("margin: 0.25in 0.35in");
    expect(css).toContain("width: auto !important");
    expect(css).toContain("min-height: 0 !important");
    expect(css).toMatch(/\.screen\s*\{\s*display: none !important;/);
    expect(css).toContain("min-height: 0.255in");
    expect(css).toContain("break-inside: avoid");
    expect(css).toContain("overflow-wrap: anywhere");
  });
});
