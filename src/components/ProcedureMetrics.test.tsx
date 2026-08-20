import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcedureMetrics } from "@/components/ProcedureMetrics";
import { buildProcedureMetricsReport, type ProcedureMetricRow } from "@/lib/metrics/procedures";

function row(overrides: Partial<ProcedureMetricRow> = {}): ProcedureMetricRow {
  return {
    id: "row-1",
    shift_date: "2026-08-01",
    shift_type: "day",
    is_canonical: true,
    c_section_count: 0,
    vaginal_delivery_count: 0,
    cabg_count: 0,
    bronch_count: 0,
    sputum_induction_count: 0,
    other_procedure_count: 0,
    ...overrides
  };
}

describe("ProcedureMetrics", () => {
  it("renders the monthly summary, accessible trend, and daily missing-versus-zero history", () => {
    const now = new Date("2026-08-03T19:00:00.000Z");
    const report = buildProcedureMetricsReport([
      row({ id: "zero", other_procedure_count: 0 }),
      row({ id: "night", shift_type: "night", other_procedure_count: 5 }),
      row({ id: "previous", shift_date: "2026-07-01", other_procedure_count: 4 })
    ], "2026-08", now);

    render(<ProcedureMetrics report={report} currentMonth="2026-08" />);

    expect(screen.getByRole("heading", { name: "August 2026" })).toBeInTheDocument();
    expect(screen.getByLabelText("Procedure metrics summary")).toHaveTextContent("Day Shift Procedures0");
    expect(screen.getByLabelText("Procedure metrics summary")).toHaveTextContent("Night Shift Procedures5");
    expect(screen.getByRole("img", { name: /Daily procedure trend/ })).toBeInTheDocument();
    expect(screen.getByText("A dash means no canonical Shift Update; 0 means an entered zero-procedure shift.")).toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("0")).toBeInTheDocument();
    expect(within(rows[1]).getAllByText("5")).toHaveLength(2);
    expect(within(rows[2]).getAllByLabelText("No canonical update")).toHaveLength(3);
  });

  it("disables future navigation while viewing the current month", () => {
    const report = buildProcedureMetricsReport([], "2026-08", new Date("2026-08-20T19:00:00.000Z"));
    render(<ProcedureMetrics report={report} currentMonth="2026-08" />);

    expect(screen.getByText("Next Month").closest("span")).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: /View September 2026/ })).not.toBeInTheDocument();
  });

  it("uses safe zero-comparison language", () => {
    const report = buildProcedureMetricsReport([
      row({ other_procedure_count: 10 })
    ], "2026-08", new Date("2026-09-15T19:00:00.000Z"));
    render(<ProcedureMetrics report={report} currentMonth="2026-09" />);

    expect(screen.getByLabelText("Procedure metrics summary")).toHaveTextContent("Change vs Previous MonthUp 10Up from 0 last month");
    expect(document.body).not.toHaveTextContent(/Infinity|NaN/);
  });
});
