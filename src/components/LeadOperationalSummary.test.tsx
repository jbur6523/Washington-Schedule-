import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadOperationalSummary } from "@/components/LeadOperationalSummary";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

const mocks = vi.hoisted(() => ({
  fetchLatestCanonical: vi.fn(),
  fetchLatestVent: vi.fn(),
  rentalCount: 0 as number | null,
  rentalError: null as { message: string } | null
}));

vi.mock("@/lib/shift-status/client-queries", () => ({
  fetchLatestCanonicalShiftStatusUpdate: mocks.fetchLatestCanonical,
  fetchLatestCanonicalVentStatusUpdate: mocks.fetchLatestVent
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
  rvu_total: null,
  vent_count: 0,
  bipap_count: 3,
  c_section_count: 1,
  vaginal_delivery_count: 2,
  cabg_count: 0,
  bronch_count: 1,
  sputum_induction_count: 0,
  other_procedure_count: 1,
  other_procedure_note: "MRI at 14:00",
  shift_note: null,
  updated_by_staff_profile_id: "staff-1",
  updated_by_name: "Lead RT",
  created_at: "2026-08-09T15:45:00.000Z",
  updated_at: "2026-08-09T15:45:00.000Z"
};

describe("LeadOperationalSummary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T16:00:00.000Z"));
    mocks.fetchLatestCanonical.mockReset();
    mocks.fetchLatestCanonical.mockResolvedValue({ data: currentUpdate, error: null });
    mocks.fetchLatestVent.mockReset();
    mocks.fetchLatestVent.mockResolvedValue({ data: currentUpdate, error: null });
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
      "Staff On Shift",
      "Vent Count",
      "BiPAP Count",
      "Active Rentals",
      "Procedures"
    ]);
    expect(within(summary).getByLabelText("Staff Needed: 9.5")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Staff On Shift: 8")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Vent Count: 0")).toBeInTheDocument();
    expect(within(summary).getByLabelText("BiPAP Count: 3")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Active Rentals: 2")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Procedures: 5")).toBeInTheDocument();

    const grid = screen.getByTestId("operational-summary-grid");
    expect(grid).toHaveClass(
      "min-[380px]:grid-cols-2",
      "lg:grid-cols-3",
      "xl:mx-auto",
      "xl:w-[88%]",
      "xl:gap-3"
    );
    for (const tile of screen.getAllByTestId("operational-summary-tile")) {
      expect(tile).toHaveClass(
        "bg-white/95",
        "border-2",
        "border-slate-950",
        "min-h-20",
        "cursor-default",
        "xl:min-h-[4.5rem]",
        "xl:border",
        "xl:border-slate-400",
        "xl:shadow-md"
      );
      expect(tile.className).not.toMatch(/bg-(sky|cyan|teal|emerald|amber|violet)-50/);
      expect(tile.className).not.toMatch(/hover:|active:|cursor-pointer/);
    }
  });

  it("keeps staffing need primary and shows persisted RVUs beside the label", async () => {
    mocks.fetchLatestCanonical.mockResolvedValue({
      data: { ...currentUpdate, rts_required: 6.7, rvu_total: 182 },
      error: null
    });
    await renderLoadedSummary();

    const summary = screen.getByRole("region", { name: "Operational Summary" });
    const staffNeeded = within(summary).getByLabelText("Staff Needed: 6.7");
    expect(staffNeeded).toHaveTextContent("6.7");
    expect(within(summary).getByRole("heading", { name: "Staff Needed · 182 RVUs" })).toBeInTheDocument();
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

  it("shows the current shift note on Staff Needed and opens the read-only modal", async () => {
    mocks.fetchLatestCanonical.mockResolvedValue({
      data: { ...currentUpdate, shift_note: "Move one RT to the north pod after 19:00.\nConfirm at huddle." },
      error: null
    });

    await renderLoadedSummary();

    fireEvent.click(screen.getByRole("button", { name: "View Shift Note" }));
    const dialog = screen.getByRole("dialog", { name: "Shift Note" });
    expect(dialog).toHaveTextContent("Move one RT to the north pod after 19:00. Confirm at huddle.");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(within(dialog).getByRole("button", { name: "Close shift note" }));
    expect(screen.queryByRole("dialog", { name: "Shift Note" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("hides View Shift Note when the current update has no nonblank note", async () => {
    mocks.fetchLatestCanonical.mockResolvedValue({ data: { ...currentUpdate, shift_note: "   " }, error: null });

    await renderLoadedSummary();

    expect(screen.queryByRole("button", { name: "View Shift Note" })).not.toBeInTheDocument();
  });

  it("hides View Procedures when all counts are zero and Other Procedures is blank", async () => {
    mocks.fetchLatestCanonical.mockResolvedValue({
      data: {
        ...currentUpdate,
        c_section_count: 0,
        vaginal_delivery_count: 0,
        cabg_count: 0,
        bronch_count: 0,
        sputum_induction_count: 0,
        other_procedure_count: 0,
        other_procedure_note: ""
      },
      error: null
    });

    await renderLoadedSummary();

    expect(screen.getByLabelText("Procedures: 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Procedures" })).not.toBeInTheDocument();
  });

  it("shows View Procedures when Other Procedures has text despite zero counts", async () => {
    mocks.fetchLatestCanonical.mockResolvedValue({
      data: {
        ...currentUpdate,
        c_section_count: 0,
        vaginal_delivery_count: 0,
        cabg_count: 0,
        bronch_count: 0,
        sputum_induction_count: 0,
        other_procedure_count: 0,
        other_procedure_note: "Transport coverage"
      },
      error: null
    });

    await renderLoadedSummary();

    expect(screen.getByRole("button", { name: "View Procedures" })).toBeInTheDocument();
  });

  it("keeps the independent rental count visible when reporting-window metrics are unavailable", async () => {
    mocks.fetchLatestCanonical.mockResolvedValue({ data: null, error: { message: "shift query failed" } });
    mocks.rentalCount = 0;

    await renderLoadedSummary();

    const summary = screen.getByRole("region", { name: "Operational Summary" });
    expect(within(summary).getByLabelText("Staff Needed: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Staff On Shift: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("BiPAP Count: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Procedures: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Vent Count: Unavailable")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Active Rentals: 0")).toBeInTheDocument();
    expect(within(summary).getByText("Some operational metrics are currently unavailable.")).toBeInTheDocument();
  });

  it.each([
    ["16:00", "2026-08-09T22:59:30.000Z", "Day-window note"],
    ["04:00", "2026-08-10T10:59:30.000Z", "Night-window note"]
  ])("keeps the latest submitted metrics and note visible across the %s workspace boundary", async (_label, start, note) => {
    vi.setSystemTime(new Date(start));
    mocks.fetchLatestCanonical.mockResolvedValue({ data: { ...currentUpdate, shift_note: note }, error: null });
    await renderLoadedSummary();
    const summary = screen.getByRole("region", { name: "Operational Summary" });
    expect(within(summary).getByLabelText("Staff On Shift: 8")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Vent Count: 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Shift Note" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_500);
    });

    expect(within(summary).getByLabelText("Staff Needed: 9.5")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Staff On Shift: 8")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Vent Count: 0")).toBeInTheDocument();
    expect(within(summary).getByLabelText("BiPAP Count: 3")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Procedures: 5")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Active Rentals: 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Shift Note" }));
    expect(screen.getByRole("dialog", { name: "Shift Note" })).toHaveTextContent(note);
  });

  it("shows a newly submitted Night update immediately before the Leadership handoff", async () => {
    vi.setSystemTime(new Date("2026-08-10T00:30:00.000Z"));
    mocks.fetchLatestCanonical.mockResolvedValue({
      data: {
        ...currentUpdate,
        id: "early-night-update",
        shift_type: "night",
        rts_on: 6,
        rts_required: 7,
        shift_note: "Early Night handoff note",
        created_at: "2026-08-10T00:30:00.000Z",
        updated_at: "2026-08-10T00:30:00.000Z"
      },
      error: null
    });

    await renderLoadedSummary();

    expect(screen.getByLabelText("Staff Needed: 7.0")).toBeInTheDocument();
    expect(screen.getByLabelText("Staff On Shift: 6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Shift Note" }));
    expect(screen.getByRole("dialog", { name: "Shift Note" })).toHaveTextContent("Early Night handoff note");
  });

  it("uses the latest non-null submitted Vent value without changing the record behind other controls", async () => {
    mocks.fetchLatestCanonical.mockResolvedValue({
      data: { ...currentUpdate, id: "new-staffing", vent_count: null, shift_note: "Newest note" },
      error: null
    });
    mocks.fetchLatestVent.mockResolvedValue({
      data: { ...currentUpdate, id: "older-vent", vent_count: 4, shift_note: "Older note" },
      error: null
    });

    await renderLoadedSummary();

    expect(screen.getByLabelText("Vent Count: 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Shift Note" }));
    expect(screen.getByRole("dialog", { name: "Shift Note" })).toHaveTextContent("Newest note");
  });

  it("shows the evening window's submitted values after the 17:00 update", async () => {
    vi.setSystemTime(new Date("2026-08-10T00:00:00.000Z"));
    mocks.fetchLatestCanonical.mockResolvedValue({
      data: {
        ...currentUpdate,
        id: "evening-update",
        rts_on: 6,
        rts_required: 7,
        vent_count: 5,
        bipap_count: 2,
        c_section_count: 3,
        created_at: "2026-08-10T00:00:00.000Z",
        updated_at: "2026-08-10T00:00:00.000Z"
      },
      error: null
    });
    mocks.fetchLatestVent.mockResolvedValue({
      data: { ...currentUpdate, id: "evening-vent", vent_count: 5 },
      error: null
    });

    await renderLoadedSummary();
    const summary = screen.getByRole("region", { name: "Operational Summary" });
    expect(within(summary).getByLabelText("Staff Needed: 7.0")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Staff On Shift: 6")).toBeInTheDocument();
    expect(within(summary).getByLabelText("Vent Count: 5")).toBeInTheDocument();
    expect(within(summary).getByLabelText("BiPAP Count: 2")).toBeInTheDocument();
  });
});
