import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadOperationalSummary } from "@/components/LeadOperationalSummary";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { OfficialVentCountUpdate, ShiftStatusUpdate } from "@/lib/shift-status/types";

const mocks = vi.hoisted(() => ({
  fetchDirector: vi.fn(),
  officialVent: null as OfficialVentCountUpdate | null,
  officialVentError: "",
  rentalCount: 0 as number | null,
  rentalError: null as { message: string } | null
}));

vi.mock("@/lib/shift-status/client-queries", () => ({
  fetchDirectorShiftStatusUpdates: mocks.fetchDirector
}));

vi.mock("@/lib/shift-status/use-official-vent-count", () => ({
  useOfficialVentCount: () => ({
    update: mocks.officialVent,
    loading: false,
    error: mocks.officialVentError
  })
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
  vent_count: null,
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
    mocks.fetchDirector.mockReset();
    mocks.fetchDirector.mockResolvedValue({
      data: [currentUpdate],
      error: null,
      usedLegacyProcedureSelect: false
    });
    mocks.officialVent = {
      id: 1,
      department_id: "department-1",
      shift_date: "2026-08-09",
      shift_type: "day",
      vent_count: 0,
      source: "icu_command_center",
      updated_by_staff_profile_id: "icu-1",
      updated_by_name: "ICU RT",
      created_at: "2026-08-09T15:50:00.000Z"
    };
    mocks.officialVentError = "";
    mocks.rentalCount = 2;
    mocks.rentalError = null;
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

  it("keeps independent confirmed counts visible when shift metrics are unavailable", async () => {
    mocks.fetchDirector.mockResolvedValue({
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
    expect(within(summary).getByLabelText("Vent Count: 0")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Active Rentals: 0")).toBeInTheDocument();
    expect(within(summary).getByText("Some operational metrics are currently unavailable.")).toBeInTheDocument();
  });
});
