import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcedureMetrics } from "@/components/ProcedureMetrics";
import { PROCEDURE_TYPES, buildProcedureMetricsReport, type ProcedureMetricRow } from "@/lib/metrics/procedures";

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
  it("renders the required summary, procedure types, monthly trend, and traceable shift detail", () => {
    const now = new Date("2026-08-03T19:00:00.000Z");
    const report = buildProcedureMetricsReport([
      row({ id: "zero" }),
      row({ id: "night", shift_type: "night", bronch_count: 3, other_procedure_count: 2 }),
      row({ id: "previous", shift_date: "2026-07-01", bronch_count: 4 })
    ], "2026-08", now);

    render(<ProcedureMetrics report={report} currentMonth="2026-08" />);

    expect(screen.getByRole("heading", { name: "August 2026 — Month to Date" })).toBeInTheDocument();
    const summary = screen.getByLabelText("Procedure metrics summary");
    expect(summary).toHaveTextContent("Average per Day");
    expect(summary).toHaveTextContent("Average per Reported Shift");
    expect(summary).toHaveTextContent("Previous-Period Total");
    expect(summary).toHaveTextContent("Change from Previous Period");
    expect(summary).toHaveTextContent("Three-Month Average");

    expect(screen.getByRole("heading", { name: "Procedures by Type" })).toBeInTheDocument();
    for (const procedure of PROCEDURE_TYPES) {
      expect(screen.getAllByText(procedure.label).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("img", { name: /Monthly procedure totals and rolling average/ })).toBeInTheDocument();
    expect(screen.getByText(/A submitted shift showing all zeroes is a reported zero/)).toBeInTheDocument();
    expect(screen.getAllByText("No update submitted").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Reconciliation")).toHaveTextContent("Procedure types (5) = daily totals (5) = canonical shift totals (5)");
  });

  it("disables future navigation while viewing the current month", () => {
    const report = buildProcedureMetricsReport([], "2026-08", new Date("2026-08-20T19:00:00.000Z"));
    render(<ProcedureMetrics report={report} currentMonth="2026-08" />);

    expect(screen.getByText("Next Month").closest("span")).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: /View September 2026/ })).not.toBeInTheDocument();
  });

  it("uses safe zero-denominator language", () => {
    const report = buildProcedureMetricsReport([
      row({ shift_date: "2026-09-01", bronch_count: 10 })
    ], "2026-09", new Date("2026-10-15T19:00:00.000Z"));
    render(<ProcedureMetrics report={report} currentMonth="2026-10" />);

    expect(screen.getByLabelText("Procedure metrics summary")).toHaveTextContent("Up from 0 in August 1–31");
    expect(document.body).not.toHaveTextContent(/Infinity|NaN/);
  });
});
