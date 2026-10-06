import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("keeps Day and Night coverage separate and shows both accessible trends", () => {
    render(<RvuStaffingMetrics rows={calculateMetricRows(rawRows)} range="30" shift="all" />);

    expect(screen.getByRole("heading", { name: "RVU & Staffing Metrics" })).toBeInTheDocument();
    expect(screen.getByLabelText("Day Shift summary")).toHaveTextContent("100.0%");
    expect(screen.getByLabelText("Night Shift summary")).toHaveTextContent("0.0%");
    expect(screen.getByRole("img", { name: /Staffing trend by reporting window/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /RVU trend by reporting window/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reporting-Window Detail" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Day vs Night Comparison" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Seasonal Summary" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).at(-1)).toHaveTextContent("Reporting-Window Detail");
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


it("does not present a filtered-out shift as zero coverage", () => {
  render(<RvuStaffingMetrics rows={calculateMetricRows(rawRows.filter((row) => row.shift_type === "day"))} range="30" shift="day" />);
  const night = screen.getByLabelText("Night Shift summary");
  expect(night).toHaveTextContent("Not included in this filter");
  expect(night).not.toHaveTextContent("0.0%");
  expect(within(night).getAllByText("—")).toHaveLength(3);
});

it("shows a recoverable error instead of charts or summaries when loading fails", () => {
  render(<RvuStaffingMetrics rows={[]} range="30" shift="all" loadError />);
  expect(screen.getByText("Metrics are temporarily unavailable.")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("switches the staffing trend without combining Day and Night values", () => {
  render(<RvuStaffingMetrics rows={calculateMetricRows(rawRows)} range="30" shift="all" />);
  const controls = screen.getByRole("group", { name: "Staffing trend shift" });
  expect(screen.getByText("Aug 13, 2026 · Day · RTs Needed: 6.7")).toBeInTheDocument();
  fireEvent.click(within(controls).getByRole("button", { name: "Night Shift" }));
  expect(screen.getByText("Aug 13, 2026 · Night · RTs Needed: 7.0")).toBeInTheDocument();
  expect(screen.queryByText("Aug 13, 2026 · Day · RTs Needed: 6.7")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Day Shift summary")).toHaveTextContent("100.0%");
});
