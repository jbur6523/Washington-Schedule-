import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricsLanding } from "@/components/MetricsLanding";

describe("MetricsLanding", () => {
  it("opens the combined RVU and Procedures report", () => {
    render(<MetricsLanding />);

    expect(screen.getByRole("heading", { name: "Metrics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /RVUs & Procedures/ })).toHaveAttribute("href", "/admin/rvu-staffing-metrics");
    expect(screen.getByText("View staffing, RVUs, and procedure metrics together.")).toBeInTheDocument();
  });

  it("returns Leadership users to their dashboard", () => {
    render(<MetricsLanding context="leadership" />);

    expect(screen.getByText("Leadership View")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Leadership Dashboard" })).toHaveAttribute(
      "href",
      "/director/shift-status"
    );
  });
});
