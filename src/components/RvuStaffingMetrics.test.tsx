import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RvuStaffingMetrics } from "@/components/RvuStaffingMetrics";
import { calculateMetricRows, type RvuStaffingMetricRow } from "@/lib/metrics/rvu-staffing";

const rawRows: RvuStaffingMetricRow[] = [
  {
    id: "day",
    shift_date: "2026-08-13",
    shift_type: "day",
    rvu_total: 182,
    rts_on: 7,
    created_at: "2026-08-13T11:00:00.000Z",
    updated_at: "2026-08-13T11:00:00.000Z"
  },
  {
    id: "night",
    shift_date: "2026-08-13",
    shift_type: "night",
    rvu_total: 188.65,
    rts_on: 6,
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z"
  }
];

describe("RvuStaffingMetrics", () => {
  it("renders the summary, accessible trend, detail, shift, and seasonal views", () => {
    render(<RvuStaffingMetrics rows={calculateMetricRows(rawRows)} range="30" shift="all" />);

    expect(screen.getByRole("heading", { name: "RVU & Staffing Metrics" })).toBeInTheDocument();
    expect(screen.getByLabelText("Metrics summary")).toHaveTextContent("Shifts with RVU Data2");
    expect(screen.getByRole("img", { name: /RVU trend by reporting window/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reporting-Window Detail" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Day vs Night" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Seasonal Summary" })).toBeInTheDocument();
    expect(screen.getByText("Below Need")).toBeInTheDocument();
    expect(screen.getByText("Met Need")).toBeInTheDocument();

    const dateRange = screen.getByLabelText("Date Range");
    const shift = screen.getByLabelText("Shift");
    expect(dateRange).toHaveValue("30");
    expect(shift).toHaveValue("all");
    expect(within(dateRange).getByRole("option", { name: "All Data" })).toBeInTheDocument();
  });

  it("renders a clear empty state without misleading metrics", () => {
    render(<RvuStaffingMetrics rows={[]} range="7" shift="night" />);

    expect(screen.getByRole("heading", { name: "No RVU data for these filters" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Metrics summary")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date Range")).toHaveValue("7");
    expect(screen.getByLabelText("Shift")).toHaveValue("night");
  });
});
