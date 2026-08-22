import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcedureDailyDetail } from "@/components/ProcedureDailyDetail";
import { buildProcedureMetricsReport, type ProcedureMetricRow } from "@/lib/metrics/procedures";

function row(overrides: Partial<ProcedureMetricRow> = {}): ProcedureMetricRow {
  return {
    id: "row-1",
    shift_date: "2026-08-14",
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

function augustDays(today = "2026-09-15T19:00:00.000Z") {
  return buildProcedureMetricsReport([
    row({ id: "aug-14-day", c_section_count: 3, sputum_induction_count: 2 }),
    row({ id: "aug-14-night", shift_type: "night", other_procedure_count: 1 }),
    row({ id: "aug-15-zero", shift_date: "2026-08-15" }),
    row({ id: "aug-21-day", shift_date: "2026-08-21", bronch_count: 2 })
  ], "2026-08", new Date(today)).selected.days;
}

describe("ProcedureDailyDetail", () => {
  it("shows at most seven historical days and replaces them with the next page", () => {
    render(<ProcedureDailyDetail days={augustDays()} isCurrentMonth={false} />);

    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(7);
    expect(screen.getByText(/Aug 14 — 6 procedures/)).toBeInTheDocument();
    expect(screen.queryByText(/Aug 21 — 2 procedures/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByText(/Aug 14 — 6 procedures/)).not.toBeInTheDocument();
    expect(screen.getByText(/Aug 21 — 2 procedures/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(7);
  });

  it("defaults the current month to the seven-day page containing today", () => {
    const daysThroughAugust21 = augustDays("2026-08-21T19:00:00.000Z");
    render(<ProcedureDailyDetail days={daysThroughAugust21} isCurrentMonth />);

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByText(/Aug 21 — 2 procedures/)).toBeInTheDocument();
    expect(screen.queryByText(/Aug 14 — 6 procedures/)).not.toBeInTheDocument();
  });

  it("keeps collapsed rows compact and expands one full Day/Night audit at a time", () => {
    render(<ProcedureDailyDetail days={augustDays()} isCurrentMonth={false} />);

    const august14 = screen.getByRole("button", { name: /Aug 14 — 6 procedures/ });
    expect(august14).toHaveTextContent("Day 5 · Night 1");
    expect(august14).toHaveTextContent("C-Sections 3 · Sputum Inductions 2 · MRI 1");
    expect(august14).not.toHaveTextContent("CABG");

    fireEvent.click(august14);
    const dayDetail = screen.getByRole("region", { name: "Aug 14 Day shift detail" });
    expect(within(dayDetail).getByText("CABG")).toBeInTheDocument();
    expect(within(dayDetail).getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Aug 14 Night shift detail" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Aug 15 — 0 procedures/ }));
    expect(screen.queryByRole("region", { name: "Aug 14 Day shift detail" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Aug 15 Day shift detail" })).toBeInTheDocument();
  });

  it("distinguishes submitted zeroes from missing updates without a permanent explanation box", () => {
    render(<ProcedureDailyDetail days={augustDays()} isCurrentMonth={false} />);

    const submittedZero = screen.getByRole("button", { name: /Aug 15 — 0 procedures/ });
    expect(submittedZero).toHaveTextContent("Submitted with zero procedures");
    expect(submittedZero).toHaveTextContent("Night update missing");

    const missing = screen.getByRole("button", { name: /^Aug 16 No procedure updates/ });
    expect(missing).toHaveTextContent("No procedure updates");
    expect(screen.getByLabelText(/A submitted zero is reported data/)).toBeInTheDocument();
  });
});
