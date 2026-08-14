import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadOperationalSummary } from "@/components/LeadOperationalSummary";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";
import { rememberSessionRvu } from "@/lib/shift-status/session-rvu";

const mocks = vi.hoisted(() => ({
  fetchReportingWindow: vi.fn(),
  rentalCount: 0 as number | null,
  rentalError: null as { message: string } | null
}));

vi.mock("@/lib/shift-status/client-queries", () => ({
  fetchReportingWindowShiftStatusUpdates: mocks.fetchReportingWindow
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const rentalQuery = {
      select() {
        return rentalQuery;
      },
      eq() {
        return rentalQuery;
      },
      async in() {
        return { count: mocks.rentalCount, error: mocks.rentalError };
      }
    };
    const channel = {
      on() {
        return channel;
      },
      subscribe() {
        return channel;
      }
    };

    return {
      from: () => rentalQuery,
      channel: () => channel,
      removeChannel: vi.fn()
    };
  }
}));

const authContext: AuthenticatedUserContext = {
  authUserId: "user-1",
  profileId: "profile-1",
  staffProfileId: "staff-1",
  departmentId: "department-1",
  departmentName: "Respiratory Care",
  role: "lead",
  operationsRole: "command_center",
  displayName: "Lead RT",
  hasLinkedStaffProfile: true
};

const currentUpdate: ShiftStatusUpdate = {
  id: "status-current",
  department_id: "department-1",
  shift_date: "2026-08-09",
  shift_type: "day",
  rts_on: 8,
  rts_required: 9.5,
  vent_count: 0,
  bipap_count: 3,
  c_section_count: 1,
  vaginal_delivery_count: 2,
  cabg_count: 0,
  bronch_count: 1,
  sputum_induction_count: 0,
  other_procedure_count: 1,
  other_procedure_note: "MRI at 14:00",
  updated_by_staff_profile_id: "staff-1",
  updated_by_name: "Lead RT",
  created_at: "2026-08-09T15:45:00.000Z",
  updated_at: "2026-08-09T15:45:00.000Z"
};

describe("LeadOperationalSummary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T16:00:00.000Z"));
    mocks.fetchReportingWindow.mockReset();
    mocks.fetchReportingWindow.mockResolvedValue({
      data: [currentUpdate],
      error: null,
      usedLegacyProcedureSelect: false
    });
    mocks.rentalCount = 2;
    mocks.rentalError = null;
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderLoadedSummary() {
    render(<LeadOperationalSummary authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
  }

  it("renders the six canonical metrics in desktop row order and preserves confirmed zero values", async () => {
    await renderLoadedSummary();

    const summary = screen.getByRole("region", { name: "Operational Summary" });
    expect(within(summary).getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Staff Needed",
      "Staff Scheduled",
      "Vent Count",
      "BiPAP Count",
      "Active Rentals",
      "Procedures"
    ]);
    expect(within(summary).getByLabelText("Staff Needed: 9.5")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Staff Scheduled: 8")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Vent Count: 0")).toBeInTheDocument();
    expect(within(summary).getByLabelText("BiPAP Count: 3")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Active Rentals: 2")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Procedures: 5")).toBeInTheDocument();

    const grid = screen.getByTestId("operational-summary-grid");
    expect(grid).toHaveClass("min-[380px]:grid-cols-2", "lg:grid-cols-3");
    for (const tile of screen.getAllByTestId("operational-summary-tile")) {
      expect(tile).toHaveClass("bg-white/95", "border-slate-200/80", "min-h-20");
      expect(tile.className).not.toMatch(/bg-(sky|cyan|teal|emerald|amber|violet)-50/);
    }
  });

  it("keeps staffing need primary and shows matching session RVUs as secondary text", async () => {
    mocks.fetchReportingWindow.mockResolvedValue({
      data: [{ ...currentUpdate, rts_required: 6.7 }],
      error: null,
      usedLegacyProcedureSelect: false
    });
    rememberSessionRvu({
      departmentId: "department-1",
      shiftDate: currentUpdate.shift_date,
      shiftType: currentUpdate.shift_type,
      rtsNeeded: 6.7,
      rvuCount: 182
    });

    await renderLoadedSummary();

    const summary = screen.getByRole("region", { name: "Operational Summary" });
    const staffNeeded = within(summary).getByLabelText("Staff Needed: 6.7");
    expect(staffNeeded).toHaveTextContent("6.7");
    expect(staffNeeded.parentElement).toHaveTextContent("182 RVUs");
  });

  it("opens the compact procedure details modal without expanding the summary card", async () => {
    await renderLoadedSummary();

    fireEvent.click(screen.getByRole("button", { name: "View Procedures" }));
    const dialog = screen.getByRole("dialog", { name: "Scheduled Procedures" });
    expect(within(dialog).getByText("C-Sections").parentElement).toHaveTextContent("1");
    expect(within(dialog).getByText("Vaginal Delivery").parentElement).toHaveTextContent("2");
    expect(within(dialog).getByText("MRI").parentElement).toHaveTextContent("1");
    expect(within(dialog).getByText("Other note: MRI at 14:00")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Scheduled Procedures" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the independent rental count visible when reporting-window metrics are unavailable", async () => {
    mocks.fetchReportingWindow.mockResolvedValue({
      data: [],
      error: { message: "shift query failed" },
      usedLegacyProcedureSelect: false
    });
    mocks.rentalCount = 0;

    await renderLoadedSummary();

    const summary = screen.getByRole("region", { name: "Operational Summary" });
    expect(within(summary).getByLabelText("Staff Needed: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Staff Scheduled: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("BiPAP Count: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Procedures: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Vent Count: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Active Rentals: 0")).toBeInTheDocument();
    expect(within(summary).getByText("Some operational metrics are currently unavailable.")).toBeInTheDocument();
  });

  it("clears prior-window metrics at 16:00 instead of falling back", async () => {
    vi.setSystemTime(new Date("2026-08-09T22:59:59.000Z"));
    await renderLoadedSummary();
    const summary = screen.getByRole("region", { name: "Operational Summary" });
    expect(within(summary).getByLabelText("Staff Scheduled: 8")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Vent Count: 0")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_050);
    });

    expect(within(summary).getByLabelText("Staff Needed: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Staff Scheduled: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Vent Count: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("BiPAP Count: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Procedures: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Active Rentals: 2")).toBeInTheDocument();
  });

  it("shows the evening window's submitted values after the 17:00 update", async () => {
    vi.setSystemTime(new Date("2026-08-10T00:00:00.000Z"));
    mocks.fetchReportingWindow.mockResolvedValue({
      data: [{
        ...currentUpdate,
        id: "evening-update",
        rts_on: 6,
        rts_required: 7,
        vent_count: 5,
        bipap_count: 2,
        c_section_count: 3,
        created_at: "2026-08-10T00:00:00.000Z",
        updated_at: "2026-08-10T00:00:00.000Z"
      }],
      error: null,
      usedLegacyProcedureSelect: false
    });

    await renderLoadedSummary();
    const summary = screen.getByRole("region", { name: "Operational Summary" });
    expect(within(summary).getByLabelText("Staff Needed: 7.0")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Staff Scheduled: 6")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Vent Count: 5")).toBeInTheDocument();
    expect(within(summary).getByLabelText("BiPAP Count: 2")).toBeInTheDocument();
  });
});
