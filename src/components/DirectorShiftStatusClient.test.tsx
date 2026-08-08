import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectorShiftStatusClient } from "@/components/DirectorShiftStatusClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

const mocks = vi.hoisted(() => ({
  fetchDirector: vi.fn(),
  realtimeHandler: null as (() => void) | null
}));

vi.mock("@/lib/shift-status/client-queries", () => ({
  fetchDirectorShiftStatusUpdates: mocks.fetchDirector
}));

vi.mock("@/lib/shift-status/use-official-vent-count", () => ({
  useOfficialVentCount: () => ({ update: null, loading: false, error: "" })
}));

vi.mock("@/components/DirectorDashboardIcuSummary", () => ({
  DirectorDashboardIcuSummary: () => <div>ICU summary</div>
}));

vi.mock("@/components/DepartmentAnnouncement", () => ({
  DepartmentAnnouncementManagerCard: () => <div>Announcements</div>
}));

vi.mock("@/components/LeadCommunicationBoardModal", () => ({
  LeadCommunicationBoardModal: () => null
}));

vi.mock("@/lib/auth/client-session", () => ({
  signOutAndRedirect: vi.fn()
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
});
