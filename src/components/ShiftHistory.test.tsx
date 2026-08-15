import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShiftHistory } from "@/components/ShiftHistory";
import type { ShiftHistoryRecord } from "@/lib/shift-history/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/command-center/history" }));

const record: ShiftHistoryRecord = {
  id: "shift-1",
  department_id: "department-1",
  shift_date: "2026-08-15",
  shift_type: "day",
  is_canonical: true,
  rts_on: 7,
  rts_required: 6.5,
  rvu_total: 176.45,
  vent_count: 5,
  bipap_count: 8,
  c_section_count: 2,
  vaginal_delivery_count: 0,
  cabg_count: 0,
  bronch_count: 1,
  sputum_induction_count: 0,
  other_procedure_count: 0,
  other_procedure_note: "",
  shift_note: "Keep one RT available for transport.",
  updated_by_staff_profile_id: null,
  updated_by_name: "Lead RT",
  created_at: "2026-08-15T15:00:00.000Z",
  updated_at: "2026-08-15T16:00:00.000Z",
  roster: {
    id: "roster-1",
    shift_date: "2026-08-15",
    shift_type: "day",
    captured_at: "2026-08-15T14:00:00.000Z",
    captured_by_name: "Lead RT",
    phone_list_roster_entries: [
      { id: "entry-1", display_order: 1, staff_display_name: "Jonathan Burdick", area_labels: ["4 WEST", "5W"] },
      { id: "entry-2", display_order: 2, staff_display_name: "Heather Heath", area_labels: ["ICU"] }
    ]
  }
};

const baseProps = {
  records: [record],
  filters: { range: "24h", shift: "all", from: "", to: "", page: 1 } as const,
  timezone: "America/Los_Angeles",
  hasPrevious: false,
  hasNext: false,
  filterError: "",
  loadError: false
};

describe("ShiftHistory", () => {
  it("expands 24-hour cards with exact RVUs, roster assignments, procedures, and note", () => {
    render(<ShiftHistory {...baseProps} />);

    const card = screen.getByText("Saturday, August 15, 2026").closest("details");
    expect(card).toHaveAttribute("open");
    expect(screen.getByText("176.45")).toBeInTheDocument();
    expect(screen.getByText("6.5")).toBeInTheDocument();
    expect(screen.getByText("Jonathan Burdick").nextSibling).toHaveTextContent("4 WEST · 5W");
    expect(screen.getByRole("heading", { name: "Procedures · 3" })).toBeInTheDocument();
    expect(screen.getByText(/C-Sections 2 · Bronchs 1/)).toBeInTheDocument();
    expect(screen.getByText("Keep one RT available for transport.")).toBeInTheDocument();
  });

  it("collapses longer ranges and reports unavailable historical fields honestly", () => {
    render(
      <ShiftHistory
        {...baseProps}
        filters={{ ...baseProps.filters, range: "7d" }}
        records={[{ ...record, id: "shift-2", rvu_total: null, roster: null, shift_note: null }]}
      />
    );

    const card = screen.getByText("Saturday, August 15, 2026").closest("details");
    expect(card).not.toHaveAttribute("open");
    const summary = card?.querySelector("summary");
    expect(summary).not.toBeNull();
    if (summary) {
      expect(within(summary).getByText("Unavailable")).toBeInTheDocument();
    }
    expect(screen.getByText("Roster was not captured for this shift.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Shift Note" })).not.toBeInTheDocument();
  });
});
