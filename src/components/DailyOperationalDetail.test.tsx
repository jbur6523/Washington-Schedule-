import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { DailyOperationalDetail } from "./DailyOperationalDetail";
import { calculateMetricRows } from "@/lib/metrics/rvu-staffing";
import { buildProcedureRangeReport, type ProcedureMetricRow } from "@/lib/metrics/procedures";
const rows = calculateMetricRows([
  { id: "d", shift_date: "2026-09-01", shift_type: "day", rvu_total: 270, rts_on: 9.6, created_at: "2026-09-01", updated_at: "2026-09-01" },
  { id: "n", shift_date: "2026-09-01", shift_type: "night", rvu_total: 135, rts_on: 4.5, created_at: "2026-09-01", updated_at: "2026-09-01" }
]);
const base: ProcedureMetricRow = { id: "p", shift_date: "2026-09-01", shift_type: "day", is_canonical: true, c_section_count: 0, vaginal_delivery_count: 0, cabg_count: 0, bronch_count: 2, sputum_induction_count: 0, other_procedure_count: 0 };
const days = buildProcedureRangeReport([base, { ...base, id: "pn", shift_type: "night", bronch_count: 1 }, { ...base, id: "zero", shift_date: "2026-09-02", bronch_count: 0 }], "2026-09-01", "2026-09-08", new Date("2026-10-01T20:00:00Z")).selected.days;
it("shows compact summaries, expands both shifts, and filters applicable procedures", () => {
  render(<DailyOperationalDetail rows={rows} days={days} />);
  const first = screen.getByRole("button", { name: /Sep 1, 2026/ });
  expect(first).toHaveTextContent("3 Procedures");
  expect(first).toHaveTextContent("Met Need");
  expect(first).toHaveTextContent("Below Need");
  expect(screen.queryByText("RTs Needed")).not.toBeInTheDocument();
  fireEvent.click(first);
  expect(screen.getAllByText("RTs Needed")).toHaveLength(2);
  expect(screen.getByText("Total procedures: 3")).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("group", { name: "Detail shift filter" })).getByRole("button", { name: "Day Shift" }));
  expect(screen.getByText("Total procedures: 2")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Night Shift" })).not.toBeInTheDocument();
  expect(screen.getAllByText("RTs Needed")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Night Shift" }));
  expect(screen.getByText("Total procedures: 1")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Sep 2, 2026/ })).toHaveTextContent("No procedure updates");
});
it("paginates seven dates without treating unreported shifts as zero", () => {
  render(<DailyOperationalDetail rows={rows} days={days} />);
  expect(screen.getByRole("button", { name: /Sep 2, 2026/ })).toHaveTextContent("0 Procedures");
  expect(screen.getByRole("button", { name: /Sep 3, 2026/ })).toHaveTextContent("No procedure updates");
  expect(screen.queryByRole("button", { name: /Sep 8, 2026/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: /Sep 8, 2026/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Sep 1, 2026/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});
