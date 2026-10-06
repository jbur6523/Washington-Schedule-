import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MetricsDateNavigation } from "./MetricsDateNavigation";

it("switches from monthly navigation to a validated custom range form", () => {
  render(<MetricsDateNavigation path="/admin/metrics/procedures" month="2026-09" currentMonth="2026-10" start="2026-09-01" end="2026-09-30" />);
  expect(screen.getByRole("link", { name: "View August 2026" })).toHaveAttribute("href", "/admin/metrics/procedures?month=2026-08");
  fireEvent.click(screen.getByRole("button", { name: "Custom Range" }));
  expect(screen.getByText("Previous Month").closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "true");
  fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2026-10-01" } });
  expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2026-10-01" } });
  expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  expect(screen.getByLabelText("Start Date")).toHaveAttribute("name", "start");
  expect(screen.getByLabelText("End Date")).toHaveAttribute("name", "end");
});
