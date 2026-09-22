import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandCenterClient } from "@/components/CommandCenterClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

const navigationMocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/command-center",
  useRouter: () => ({ replace: navigationMocks.replace })
}));

vi.mock("@/components/LeadOperationalSummary", () => ({
  LeadOperationalSummary: ({ children }: { children: React.ReactNode }) => <section aria-label="Operational Summary">{children}</section>
}));

vi.mock("@/components/DepartmentAnnouncement", () => ({
  DepartmentAnnouncementStrip: () => <section aria-label="Announcements">Announcements</section>
}));

vi.mock("@/components/LeadBoardPreviews", () => ({
  LeadNotePreview: ({ onOpen, newCount }: { onOpen: () => void; newCount: number }) => <section aria-label="Lead Note"><button onClick={onOpen}>View All Lead Communication Board notes</button>{newCount > 0 && <span className="bg-red-600">{newCount} new</span>}</section>
}));

vi.mock("@/components/IcuCommandCenterClient", () => ({
  IcuCommandCenterClient: ({ surface }: { surface: string }) => <section aria-label="ICU Snapshot" data-surface={surface}><button>Add Device</button></section>
}));

const mocks = vi.hoisted(() => ({
  fetchLeadCommunicationNewCount: vi.fn()
}));

vi.mock("@/components/LeadCommunicationBoardModal", () => ({
  fetchLeadCommunicationNewCount: mocks.fetchLeadCommunicationNewCount,
  LeadCommunicationBoardModal: ({
    open,
    onNotesChanged
  }: {
    open: boolean;
    onNotesChanged?: () => void;
  }) => open
    ? <button type="button" onClick={onNotesChanged}>Simulate board entry acknowledgement</button>
    : null
}));

vi.mock("@/components/RtAideNotesModal", () => ({
  RtAideNotesModal: () => null
}));

vi.mock("@/lib/auth/client-session", () => ({
  signOutAndRedirect: vi.fn()
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

describe("CommandCenterClient desktop dashboard", () => {
  beforeEach(() => {
    mocks.fetchLeadCommunicationNewCount.mockReset();
    mocks.fetchLeadCommunicationNewCount.mockResolvedValue(0);
    navigationMocks.replace.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves navigation and arranges announcements, panels, quick operations, and ICU preview", () => {
    render(<CommandCenterClient authContext={authContext} timezone="America/Los_Angeles" />);
    const sections = [screen.getByRole("navigation"), screen.getByRole("region", { name: "Announcements" }), screen.getByRole("region", { name: "Operational Summary" }), screen.getByTestId("lead-action-grid"), screen.getByRole("region", { name: "ICU Snapshot" })];
    for (let i = 1; i < sections.length; i++) expect(sections[i - 1].compareDocumentPosition(sections[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const grid = screen.getByTestId("lead-action-grid");
    expect(grid.children).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Aide Communication Board" })).toBeInTheDocument();
    expect(grid).not.toHaveTextContent("Lead Communication Board");
    expect(grid).not.toHaveTextContent("Announcement Board");
    for (const [name, href] of [["Live Board", "/command-center"], ["Schedule", "/command-center/schedule"], ["History", "/command-center/history"], ["Shift Update", "/command-center/shift-update"], ["Phone List", "/command-center/phone-list"], ["Rental Management", "/operations/rental-management"], ["Short Shift Alert", "/command-center/short-shift-alert"]]) {
      expect(screen.getByRole("link", { name: new RegExp(name) })).toHaveAttribute("href", href);
    }
  });

  it("shows a queued Shift Update success toast once and dismisses it automatically", async () => {
    vi.useFakeTimers();

    render(
      <CommandCenterClient
        authContext={authContext}
        timezone="America/Los_Angeles"
        showShiftUpdateSaved
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Shift update saved");
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(navigationMocks.replace).toHaveBeenCalledWith("/command-center", { scroll: false });

  });

  it("shows the shared unread message count as the red new-note badge", async () => {
    mocks.fetchLeadCommunicationNewCount.mockResolvedValue(2);

    render(<CommandCenterClient authContext={authContext} timezone="America/Los_Angeles" />);

    const badge = await screen.findByText("2 new");
    expect(badge).toHaveClass("bg-red-600");
  });

  it("clears the badge when board-entry acknowledgement refreshes the shared count", async () => {
    mocks.fetchLeadCommunicationNewCount
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    render(<CommandCenterClient authContext={authContext} timezone="America/Los_Angeles" />);

    expect(await screen.findByText("1 new")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Lead Communication Board/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate board entry acknowledgement" }));

    await waitFor(() => expect(screen.queryByText("1 new")).not.toBeInTheDocument());
  });
});
