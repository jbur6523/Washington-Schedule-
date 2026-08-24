import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftUpdateSelection } from "@/components/ShiftUpdateSelection";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push })
}));

const options = [
  { shiftDate: "2026-08-24", shiftType: "night" as const },
  { shiftDate: "2026-08-25", shiftType: "day" as const }
] as const;

describe("ShiftUpdateSelection", () => {
  beforeEach(() => {
    mocks.push.mockReset();
  });

  it("shows two primary operational shifts and the Other Shift option", () => {
    render(<ShiftUpdateSelection options={options} />);

    expect(screen.getByRole("heading", { name: "Please select shift to update" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /08\/24 Night Shift/ })).toHaveAttribute(
      "href",
      "/command-center/shift-update?date=2026-08-24&shift=night"
    );
    expect(screen.getByRole("link", { name: /08\/25 Day Shift/ })).toHaveAttribute(
      "href",
      "/command-center/shift-update?date=2026-08-25&shift=day"
    );
    expect(screen.getByRole("button", { name: "Other Shift" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("opens the lookup and continues with its exact date and shift", () => {
    render(<ShiftUpdateSelection options={options} />);

    fireEvent.click(screen.getByRole("button", { name: "Other Shift" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-08-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Day Shift" }));
    fireEvent.submit(screen.getByRole("button", { name: "Continue" }).closest("form") as HTMLFormElement);

    expect(mocks.push).toHaveBeenCalledWith(
      "/command-center/shift-update?date=2026-08-12&shift=day"
    );
  });
});
