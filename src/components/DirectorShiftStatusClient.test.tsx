import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectorShiftStatusClient } from "@/components/DirectorShiftStatusClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { OfficialVentCountUpdate, ShiftStatusUpdate } from "@/lib/shift-status/types";

const mocks = vi.hoisted(() => ({
  fetchDirector: vi.fn(),
  realtimeHandler: null as (() => void) | null,
  officialVent: null as OfficialVentCountUpdate | null,
  signOut: vi.fn()
}));

vi.mock("@/lib/shift-status/client-queries", () => ({
  fetchDirectorShiftStatusUpdates: mocks.fetchDirector
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
  vent_count: null,
  bipap_count: 0,
  c_section_count: 0,
  vaginal_delivery_count: 0,
  cabg_count: 0,
  bronch_count: 0,
  sputum_induction_count: 0,
  other_procedure_count: 0,
  other_procedure_note: null,
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
    mocks.fetchDirector.mockImplementation(async () => ({
      data: [{ ...prior }],
      error: null,
      usedLegacyProcedureSelect: false
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders prior-shift zero values and source labels after load and refresh", async () => {
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
    expect(within(statusCard as HTMLElement).getByText("Scheduled").parentElement).toHaveTextContent("0");
    expect(within(statusCard as HTMLElement).queryByText("No Update")).not.toBeInTheDocument();
    expect(within(snapshotCard as HTMLElement).getByText("08/08 Night Shift")).toBeInTheDocument();
    expect(within(snapshotCard as HTMLElement).getByText("BiPAPs").parentElement).toHaveTextContent("0");
    expect(within(snapshotCard as HTMLElement).queryByText("No department snapshot has been submitted yet.")).not.toBeInTheDocument();

    await act(async () => {
      mocks.realtimeHandler?.();
      await Promise.resolve();
    });

    expect(mocks.fetchDirector).toHaveBeenCalledTimes(2);
    expect(within(statusCard as HTMLElement).getByText("08/08 Night Shift")).toBeInTheDocument();
    expect(within(snapshotCard as HTMLElement).getByText("BiPAPs").parentElement).toHaveTextContent("0");
    view.unmount();
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
