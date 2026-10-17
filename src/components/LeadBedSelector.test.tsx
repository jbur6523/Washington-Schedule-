import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeadBedSelector } from "./LeadBedSelector";

describe("Lead bed selection", () => {
  it.each([["C Pod", 220], ["D Pod", 230], ["E Pod", 240], ["IMC A", 200], ["IMC B", 210]] as const)("offers exactly ten rooms for %s", (area, start) => {
    const onChange = vi.fn();
    render(<LeadBedSelector bed="" onChange={onChange} records={[]} />);
    expect(within(screen.getByLabelText("Select bed")).getAllByRole("option").slice(1).map(option => option.textContent)).toEqual(["C Pod", "D Pod", "E Pod", "IMC A", "IMC B", "ED", "OR", "Other"]);
    fireEvent.change(screen.getByLabelText("Select bed"), { target: { value: area } });
    expect(within(screen.getByLabelText("Bed")).getAllByRole("option").slice(1).map(option => option.textContent)).toEqual(Array.from({ length: 10 }, (_, index) => String(start + index)));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("preserves a legacy location when opening an existing record", () => {
    render(<LeadBedSelector bed="A201" onChange={vi.fn()} records={[]} />);
    expect(screen.getByLabelText("Select bed")).toHaveValue("Other");
    expect(screen.getByLabelText("Location")).toHaveValue("A201");
  });
});
