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
    render(<RvuStaffingMetrics rows={calculateMetricRows(rawRows)} range="30" />);

    expect(screen.getByRole("heading", { name: "RVU & Staffing Metrics" })).toBeInTheDocument();
    expect(screen.getByLabelText("Day Shift summary")).toHaveTextContent("100.0%");
    expect(screen.getByLabelText("Night Shift summary")).toHaveTextContent("0.0%");
    expect(screen.getByRole("img", { name: /Staffing trend by reporting window/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /RVU trend by reporting window/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reporting-Window Detail" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Day vs Night Comparison" })).not.toBeInTheDocument();
    expect(screen.getByText("Average Day Staff On Shift").parentElement).toHaveTextContent("7.0");
    expect(screen.getByText("Average Night Staff On Shift").parentElement).toHaveTextContent("6.0");
    expect(screen.queryByRole("heading", { name: "Seasonal Summary" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).at(-1)).toHaveTextContent("Reporting-Window Detail");
    expect(screen.getByText("Below Need")).toBeInTheDocument();
    expect(screen.getByText("Met Need")).toBeInTheDocument();

    const dateRange = screen.getByLabelText("Date Range");
    expect(dateRange).toHaveValue("30");
    expect(within(dateRange).getByRole("option", { name: "Custom" })).toBeInTheDocument();
  });

  it("renders a clear empty state without misleading metrics", () => {
    render(<RvuStaffingMetrics rows={[]} range="30" />);

    expect(screen.getByRole("heading", { name: "No RVU data for these filters" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Metrics summary")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date Range")).toHaveValue("30");
    expect(screen.queryByLabelText("Shift")).not.toBeInTheDocument();
  });
});


it("does not present an unreported shift as zero coverage", () => {
  render(<RvuStaffingMetrics rows={calculateMetricRows(rawRows.filter((row) => row.shift_type === "day"))} range="30" />);
  const night = screen.getByLabelText("Night Shift summary");
  expect(night).toHaveTextContent("No reported shifts");
  expect(night).not.toHaveTextContent("0.0%");
  expect(within(night).getAllByText("—")).toHaveLength(4);
});

it("shows a recoverable error instead of charts or summaries when loading fails", () => {
  render(<RvuStaffingMetrics rows={[]} range="30" loadError />);
  expect(screen.getByText("Metrics are temporarily unavailable.")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("switches the staffing trend without combining Day and Night values", () => {
  render(<RvuStaffingMetrics rows={calculateMetricRows(rawRows)} range="30" />);
  const controls = screen.getByRole("group", { name: "Staffing trend shift" });
  expect(screen.getByText("Aug 13, 2026 · Day · RTs Needed: 6.7")).toBeInTheDocument();
  fireEvent.click(within(controls).getByRole("button", { name: "Night Shift" }));
  expect(screen.getByText("Aug 13, 2026 · Night · RTs Needed: 7.0")).toBeInTheDocument();
  expect(screen.queryByText("Aug 13, 2026 · Day · RTs Needed: 6.7")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Day Shift summary")).toHaveTextContent("100.0%");
});

it("filters only detail rows and leaves summaries and charts unchanged", () => {
  render(<RvuStaffingMetrics rows={calculateMetricRows(rawRows)} range="30" />);
  const filters = screen.getByRole("group", { name: "Detail shift filter" });
  const detail = screen.getByRole("region", { name: "Reporting-window detail table" });
  const chart = screen.getByRole("img", { name: /RVU trend by reporting window/ }).innerHTML;
  expect(within(screen.getByRole("region", { name: "Report filters" })).getAllByRole("combobox")).toHaveLength(1);
  fireEvent.click(within(filters).getByRole("button", { name: "Day Shift" }));
  expect(within(detail).getByText("day")).toBeInTheDocument();
  expect(within(detail).queryByText("night")).not.toBeInTheDocument();
  fireEvent.click(within(filters).getByRole("button", { name: "Night Shift" }));
  expect(within(detail).getByText("night")).toBeInTheDocument();
  expect(within(detail).queryByText("day")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Day Shift summary")).toHaveTextContent("100.0%");
  expect(screen.getByLabelText("Night Shift summary")).toHaveTextContent("0.0%");
  expect(screen.getByRole("img", { name: /RVU trend by reporting window/ }).innerHTML).toBe(chart);
  fireEvent.click(within(filters).getByRole("button", { name: "All Shifts" }));
  expect(within(detail).getAllByRole("row")).toHaveLength(3);
});
it("offers only the requested ranges and editable custom dates", () => {
  render(<RvuStaffingMetrics rows={[]} range="30" start="2026-09-07" end="2026-10-06" />);
  const range = screen.getByLabelText("Date Range");
  expect(within(range).getAllByRole("option").map(option => option.textContent)).toEqual(["30 Days", "90 Days", "1 Year", "Custom"]);
  fireEvent.change(range, { target: { value: "custom" } });
  expect(screen.getByLabelText("Start Date")).toHaveValue("2026-09-07");
  fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2026-10-07" } });
  expect(screen.getByRole("button", { name: "Apply Date Range" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2026-10-07" } });
  expect(screen.getByRole("button", { name: "Apply Date Range" })).toBeEnabled();
});
