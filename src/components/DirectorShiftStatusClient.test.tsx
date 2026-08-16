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

  it("does not present a prior shift as the current clinical shift after load or refresh", async () => {
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
    expect(within(statusCard as HTMLElement).queryByText("08/08 Night Shift")).not.toBeInTheDocument();
    expect(within(statusCard as HTMLElement).queryByText("RTs On Shift")).not.toBeInTheDocument();
    expect(within(statusCard as HTMLElement).getAllByText("Awaiting update from Lead")).toHaveLength(2);
    const viewShiftButton = within(statusCard as HTMLElement).getByRole("button", { name: "View Shift" });
    expect(viewShiftButton).toBeInTheDocument();
    expect(within(statusCard as HTMLElement).getByRole("button", { name: "View Schedule" })).toBeInTheDocument();
    expect(within(statusCard as HTMLElement).queryByRole("button", { name: "View Shift Notes" })).not.toBeInTheDocument();
    expect(viewShiftButton.parentElement).toHaveClass("grid", "grid-cols-2", "gap-2.5");
    expect(within(snapshotCard as HTMLElement).getByText("08/08 Night Shift")).toBeInTheDocument();
    expect(within(snapshotCard as HTMLElement).getByText("BiPAPs").parentElement).toHaveTextContent("0");
    expect(within(snapshotCard as HTMLElement).queryByText("No department snapshot has been submitted yet.")).not.toBeInTheDocument();

    await act(async () => {
      mocks.realtimeHandler?.();
      await Promise.resolve();
    });

    expect(mocks.fetchDirector).toHaveBeenCalledTimes(2);
    expect(within(statusCard as HTMLElement).queryByText("08/08 Night Shift")).not.toBeInTheDocument();
    expect(within(snapshotCard as HTMLElement).getByText("BiPAPs").parentElement).toHaveTextContent("0");
    view.unmount();
  });

  it("opens separate operational and uploaded-schedule views", async () => {
    render(<DirectorShiftStatusClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "View Shift" }));
    const emptyShiftDialog = screen.getByRole("dialog", { name: "View Shift" });
    expect(emptyShiftDialog).toHaveClass("w-full", "max-w-xl", "max-h-[88vh]");
    expect(within(emptyShiftDialog).getByText("Awaiting update from Lead")).toBeInTheDocument();
    expect(within(emptyShiftDialog).getByText("Shift information will appear here once the Lead submits the first shift update.")).toBeInTheDocument();
    fireEvent.click(within(emptyShiftDialog).getByRole("button", { name: "Close" }));

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
