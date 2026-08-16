import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectorShiftStatusClient } from "@/components/DirectorShiftStatusClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { OfficialVentCountUpdate, ShiftStatusUpdate } from "@/lib/shift-status/types";

const mocks = vi.hoisted(() => ({
  fetchDirector: vi.fn(),
  fetchRoster: vi.fn(),
  realtimeHandler: null as (() => void) | null,
  officialVent: null as OfficialVentCountUpdate | null,
  signOut: vi.fn()
}));

vi.mock("@/lib/shift-status/client-queries", () => ({
  fetchDirectorShiftStatusUpdates: mocks.fetchDirector
}));

vi.mock("@/lib/shift-history/client-queries", () => ({
  fetchShiftRosterSnapshot: mocks.fetchRoster
}));

vi.mock("@/lib/shift-status/use-official-vent-count", () => ({
  useOfficialVentCount: () => ({ update: mocks.officialVent, loading: false, error: "" })
}));

vi.mock("@/components/DirectorDashboardIcuSummary", () => ({
  DirectorDashboardIcuSummary: () => <div>ICU summary</div>
}));

vi.mock("@/components/DepartmentAnnouncement", () => ({
  DepartmentAnnouncementManagerDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Announcement Board">
        <button type="button" onClick={onClose}>Close announcement</button>
      </div>
    ) : null
}));

vi.mock("@/components/LeadCommunicationBoardModal", () => ({
  LeadCommunicationBoardModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Lead Communication Board">
        <button type="button" onClick={onClose}>Close lead board</button>
      </div>
    ) : null
}));

vi.mock("@/lib/auth/client-session", () => ({
  signOutAndRedirect: mocks.signOut
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
        return { count: 0, error: null };
      },
      async maybeSingle() {
        return { data: { active_schedule_version_id: null }, error: null };
      }
    };
    const channel = {
      on(_event: string, _filter: unknown, handler: () => void) {
        mocks.realtimeHandler = handler;
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
  role: "admin",
  operationsRole: "director",
  displayName: "Director RT",
  hasLinkedStaffProfile: true
};

const prior: ShiftStatusUpdate = {
  id: "status-1",
  department_id: "department-1",
  shift_date: "2026-08-08",
  shift_type: "night",
  rts_on: 0,
  rts_required: 0,
  rvu_total: null,
  vent_count: null,
  bipap_count: 0,
  c_section_count: 0,
  vaginal_delivery_count: 0,
  cabg_count: 0,
  bronch_count: 0,
  sputum_induction_count: 0,
  other_procedure_count: 0,
  other_procedure_note: null,
  shift_note: null,
  updated_by_staff_profile_id: "lead-1",
  updated_by_name: "Lead RT",
  created_at: "2026-08-09T03:15:00.000Z",
  updated_at: "2026-08-09T03:15:00.000Z"
};

describe("DirectorShiftStatusClient persistent cards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T16:00:00.000Z"));
    mocks.realtimeHandler = null;
    mocks.officialVent = null;
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.fetchDirector.mockReset();
    mocks.fetchRoster.mockReset();
    mocks.fetchRoster.mockResolvedValue({ data: null, error: null });
    mocks.fetchDirector.mockImplementation(async () => ({
      data: [{ ...prior }],
      error: null,
      usedLegacyProcedureSelect: false
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the latest submitted shift and note visible after a reporting rollover", async () => {
    const submitted = { ...prior, rvu_total: 0, shift_note: "Night handoff note" };
    mocks.fetchDirector.mockImplementation(async () => ({
      data: [{ ...submitted }],
      error: null,
      usedLegacyProcedureSelect: false
    }));
    const view = render(
      <DirectorShiftStatusClient authContext={authContext} timezone="America/Los_Angeles" />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const statusCard = screen.getByRole("heading", { name: "Current Shift Status" }).closest("section");
    const snapshotCard = screen.getByRole("heading", { name: "Department Snapshot" }).closest("section");
    expect(statusCard).not.toBeNull();
    expect(snapshotCard).not.toBeNull();
    expect(within(statusCard as HTMLElement).getByText("08/08 Night Shift")).toBeInTheDocument();
    expect(within(statusCard as HTMLElement).getByText("RTs On Shift").parentElement).toHaveTextContent("0");
    expect(within(statusCard as HTMLElement).queryByText("Awaiting update from Lead")).not.toBeInTheDocument();
    const viewShiftButton = within(statusCard as HTMLElement).getByRole("button", { name: "View Shift" });
    expect(viewShiftButton).toBeInTheDocument();
    expect(within(statusCard as HTMLElement).getByRole("button", { name: "View Schedule" })).toBeInTheDocument();
    const notesButton = within(statusCard as HTMLElement).getByRole("button", { name: "View Shift Notes" });
    expect(notesButton).toBeInTheDocument();
    fireEvent.click(notesButton);
    expect(screen.getByRole("dialog", { name: "Shift Notes" })).toHaveTextContent("Night handoff note");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Shift Notes" })).getByRole("button", { name: "Close" }));
    expect(within(snapshotCard as HTMLElement).getByText("08/08 Night Shift")).toBeInTheDocument();
    expect(within(snapshotCard as HTMLElement).getByText("BiPAPs").parentElement).toHaveTextContent("0");
    expect(within(snapshotCard as HTMLElement).queryByText("No department snapshot has been submitted yet.")).not.toBeInTheDocument();

    await act(async () => {
      mocks.realtimeHandler?.();
      await Promise.resolve();
    });

    expect(mocks.fetchDirector).toHaveBeenCalledTimes(2);
    expect(within(statusCard as HTMLElement).getByText("08/08 Night Shift")).toBeInTheDocument();
    expect(within(statusCard as HTMLElement).getByRole("button", { name: "View Shift Notes" })).toBeInTheDocument();
    expect(within(snapshotCard as HTMLElement).getByText("BiPAPs").parentElement).toHaveTextContent("0");
    view.unmount();
  });

  it("holds an early Night submission until 18:30, then switches the complete displayed snapshot", async () => {
    vi.setSystemTime(new Date("2026-08-10T01:29:30.000Z"));
    const day = {
      ...prior,
      id: "day-status",
      shift_date: "2026-08-09",
      shift_type: "day" as const,
      rts_on: 8,
      rts_required: 7,
      rvu_total: 189,
      bipap_count: 2,
      c_section_count: 1,
      shift_note: "Day note remains visible"
    };
    const earlyNight = {
      ...prior,
      id: "night-status",
      shift_date: "2026-08-09",
      shift_type: "night" as const,
      rts_on: 6,
      rts_required: 8,
      rvu_total: 216,
      bipap_count: 4,
      c_section_count: 3,
      shift_note: "Night note becomes visible",
      created_at: "2026-08-10T00:30:00.000Z",
      updated_at: "2026-08-10T00:30:00.000Z"
    };
    mocks.fetchDirector.mockResolvedValue({
      data: [earlyNight, day],
      error: null,
      usedLegacyProcedureSelect: false
    });

    render(<DirectorShiftStatusClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const statusCard = screen.getByRole("heading", { name: "Current Shift Status" }).closest("section") as HTMLElement;
    const snapshotCard = screen.getByRole("heading", { name: "Department Snapshot" }).closest("section") as HTMLElement;
    expect(within(statusCard).getByText("08/09 Day Shift")).toBeInTheDocument();
    expect(within(statusCard).getByText("RTs On Shift").parentElement).toHaveTextContent("8");
    expect(within(snapshotCard).getByText("BiPAPs").parentElement).toHaveTextContent("2");
    fireEvent.click(within(statusCard).getByRole("button", { name: "View Shift Notes" }));
    expect(screen.getByRole("dialog", { name: "Shift Notes" })).toHaveTextContent("Day note remains visible");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Shift Notes" })).getByRole("button", { name: "Close" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_500);
    });

    expect(within(statusCard).getByText("08/09 Night Shift")).toBeInTheDocument();
    expect(within(statusCard).getByText("RTs On Shift").parentElement).toHaveTextContent("6");
    expect(within(snapshotCard).getByText("BiPAPs").parentElement).toHaveTextContent("4");
    fireEvent.click(within(statusCard).getByRole("button", { name: "View Shift Notes" }));
    expect(screen.getByRole("dialog", { name: "Shift Notes" })).toHaveTextContent("Night note becomes visible");
  });

  it("opens separate operational and uploaded-schedule views", async () => {
    render(<DirectorShiftStatusClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "View Shift" }));
    const shiftDialog = screen.getByRole("dialog", { name: "View Shift" });
    expect(shiftDialog).toHaveClass("w-full", "max-w-xl", "max-h-[88vh]");
    expect(within(shiftDialog).getByText("Saturday, August 8, 2026")).toBeInTheDocument();
    expect(within(shiftDialog).queryByText("Awaiting update from Lead")).not.toBeInTheDocument();
    fireEvent.click(within(shiftDialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "View Schedule" }));
    const scheduleDialog = screen.getByRole("dialog", { name: "View Schedule" });
    expect(within(scheduleDialog).getByText("Read-only schedule preview")).toBeInTheDocument();
  });

  it("uses the shared History detail for the current clinical shift", async () => {
    const current = {
      ...prior,
      id: "status-current",
      shift_date: "2026-08-09",
      shift_type: "day" as const,
      is_canonical: true,
      rts_on: 7,
      rts_required: 6.5,
      rvu_total: 176.45,
      vent_count: 5,
      bipap_count: 8,
      c_section_count: 2,
      bronch_count: 1,
      shift_note: "Watch staffing after 15:00.",
      updated_at: "2026-08-09T16:30:00.000Z"
    };
    mocks.fetchDirector.mockResolvedValue({
      data: [current, prior],
      error: null,
      usedLegacyProcedureSelect: false
    });
    mocks.fetchRoster.mockResolvedValue({
      data: {
        id: "roster-1",
        shift_date: "2026-08-09",
        shift_type: "day",
        captured_at: "2026-08-09T16:00:00.000Z",
        captured_by_name: "Lead RT",
        phone_list_roster_entries: [{
          id: "entry-1",
          display_order: 1,
          staff_display_name: "Jonathan Burdick",
          area_labels: ["4W", "5W", "IMC A"]
        }]
      },
      error: null
    });

    render(<DirectorShiftStatusClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const statusCard = screen.getByRole("heading", { name: "Current Shift Status" }).closest("section") as HTMLElement;
    expect(within(statusCard).getByText("RTs On Shift").parentElement).toHaveTextContent("7");
    expect(within(statusCard).getByText("RTs Needed").parentElement).toHaveTextContent("6.5");

    fireEvent.click(within(statusCard).getByRole("button", { name: "View Shift Notes" }));
    const notesDialog = screen.getByRole("dialog", { name: "Shift Notes" });
    expect(within(notesDialog).getByText("Watch staffing after 15:00.")).toBeInTheDocument();
    expect(within(notesDialog).getByText("Author").parentElement).toHaveTextContent("Lead RT");
    expect(within(notesDialog).getByText("Date/time").parentElement).toHaveTextContent("08/09/2026");
    fireEvent.click(within(notesDialog).getByRole("button", { name: "Close" }));

    fireEvent.click(within(statusCard).getByRole("button", { name: "View Shift" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = screen.getByRole("dialog", { name: "View Shift" });
    expect(within(dialog).getAllByText("Staff On Shift")[0]?.parentElement).toHaveTextContent("7");
    expect(within(dialog).getByText("Staff Needed").parentElement).toHaveTextContent("6.5");
    expect(within(dialog).getByText("RVUs").parentElement).toHaveTextContent("176.5");
    expect(within(dialog).getByText("Vents").parentElement).toHaveTextContent("5");
    expect(within(dialog).getByText("BiPAPs").parentElement).toHaveTextContent("8");
    expect(within(dialog).getByText("Procedures · 3")).toBeInTheDocument();
    expect(within(dialog).getByText("C-Sections 2 · Bronchs 1")).toBeInTheDocument();
    expect(within(dialog).getByText("Jonathan Burdick")).toBeInTheDocument();
    expect(within(dialog).getByText("4W · 5W · IMC A")).toBeInTheDocument();
    expect(within(dialog).getByText("Watch staffing after 15:00.")).toBeInTheDocument();
    expect(within(dialog).getByText(/Last updated by Lead RT/)).toBeInTheDocument();
    expect(mocks.fetchRoster).toHaveBeenCalledWith(expect.anything(), "department-1", "2026-08-09", "day");
  });

  it("shows only the newest effective Department Snapshot timestamp and employee", async () => {
    mocks.officialVent = {
      id: 2,
      department_id: "department-1",
      shift_date: "2026-08-08",
      shift_type: "night",
      vent_count: 4,
      source: "icu_command_center",
      updated_by_staff_profile_id: "icu-1",
      updated_by_name: "Vent RT",
      created_at: "2026-08-09T04:15:00.000Z"
    };

    render(<DirectorShiftStatusClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const snapshotCard = screen.getByRole("heading", { name: "Department Snapshot" }).closest("section");
    expect(snapshotCard).not.toBeNull();
    const card = within(snapshotCard as HTMLElement);
    const lastUpdated = card.getByText("Last updated: 08/08/2026 21:15");
    const footer = lastUpdated.parentElement;

    expect(footer).not.toBeNull();
    expect(footer?.children).toHaveLength(2);
    expect(card.getByText("Updated by: Vent RT")).toBeInTheDocument();
    expect(card.queryByText(/Vents source:/)).not.toBeInTheDocument();
    expect(card.queryByText(/Department details updated:/)).not.toBeInTheDocument();
    expect(card.queryByText(/Vents updated by:/)).not.toBeInTheDocument();
  });

  it("opens a responsive Leadership menu and dismisses it with escape or an outside click", async () => {
    render(<DirectorShiftStatusClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const menuButton = screen.getByRole("button", { name: "Menu" });
    expect(screen.queryByRole("dialog", { name: "Leadership Menu" })).not.toBeInTheDocument();
    expect(screen.queryByText("Respiratory Directory")).not.toBeInTheDocument();

    menuButton.focus();
    fireEvent.click(menuButton);
    const menu = screen.getByRole("dialog", { name: "Leadership Menu" });
    expect(menu).toHaveClass("rounded-t-[2rem]", "sm:max-w-sm", "sm:rounded-[2rem]");
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("button", { name: "Close Leadership menu" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Leadership Menu" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(menuButton).toHaveFocus();

    fireEvent.click(menuButton);
    fireEvent.mouseDown(screen.getByTestId("director-menu-backdrop"));
    expect(screen.queryByRole("dialog", { name: "Leadership Menu" })).not.toBeInTheDocument();
  });

  it("moves every Leadership utility action into the menu and closes it after selection", async () => {
    render(<DirectorShiftStatusClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    openMenu();
    const directorMenu = screen.getByRole("dialog", { name: "Leadership Menu" });
    expect(within(directorMenu).getByRole("button", { name: "Respiratory Directory" })).toBeInTheDocument();
    expect(within(directorMenu).getByRole("button", { name: "Lead Communication Board" })).toBeInTheDocument();
    expect(within(directorMenu).getByRole("button", { name: "Announcement Board" })).toBeInTheDocument();
    expect(within(directorMenu).getByRole("button", { name: "Sign Out" })).toBeInTheDocument();

    fireEvent.click(within(directorMenu).getByRole("button", { name: "Respiratory Directory" }));
    expect(screen.queryByRole("dialog", { name: "Leadership Menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Respiratory Directory" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    openMenu();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Leadership Menu" })).getByRole("button", { name: "Lead Communication Board" }));
    expect(screen.queryByRole("dialog", { name: "Leadership Menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Lead Communication Board" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close lead board" }));

    openMenu();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Leadership Menu" })).getByRole("button", { name: "Announcement Board" }));
    expect(screen.queryByRole("dialog", { name: "Leadership Menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Announcement Board" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close announcement" }));

    openMenu();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Leadership Menu" })).getByRole("button", { name: "Sign Out" }));
    expect(screen.queryByRole("dialog", { name: "Leadership Menu" })).not.toBeInTheDocument();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);

    expect(screen.getByRole("heading", { name: "Current Shift Status" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Department Snapshot" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scheduled Procedures" })).toBeInTheDocument();
  });
});
