import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricsLanding } from "@/components/MetricsLanding";

describe("MetricsLanding", () => {
  it("offers the existing RVU report and new Procedures report as expandable metric categories", () => {
    render(<MetricsLanding />);

    expect(screen.getByRole("heading", { name: "Metrics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /RVUs/ })).toHaveAttribute("href", "/admin/rvu-staffing-metrics");
    expect(screen.getByRole("link", { name: /Procedures/ })).toHaveAttribute("href", "/admin/metrics/procedures");
    expect(screen.getByText("View RVU and staffing-demand metrics.")).toBeInTheDocument();
    expect(screen.getByText("Track monthly procedure volume and shift trends.")).toBeInTheDocument();
  });
});
