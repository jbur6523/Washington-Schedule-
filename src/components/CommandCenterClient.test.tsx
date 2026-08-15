import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandCenterClient } from "@/components/CommandCenterClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

vi.mock("@/components/LeadOperationalSummary", () => ({
  LeadOperationalSummary: () => <section aria-label="Operational Summary">Operational Summary</section>
}));

vi.mock("@/components/DepartmentAnnouncement", () => ({
  DepartmentAnnouncementManagerCard: () => <button type="button">Announcement Board</button>
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
  });

  it("places the summary below the unchanged header and renders action cards in the required pairs", () => {
    render(<CommandCenterClient authContext={authContext} timezone="America/Los_Angeles" />);

    const heading = screen.getByRole("heading", { name: "Lead Command Board" });
    const summary = screen.getByRole("region", { name: "Operational Summary" });
    const grid = screen.getByTestId("lead-action-grid");
    const position = heading.compareDocumentPosition(summary);
    const gridPosition = summary.compareDocumentPosition(grid);

    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gridPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grid).toHaveClass("md:grid-cols-2");
    expect(heading.closest("header")).not.toBeNull();
    expect(heading.closest("section")).toBeNull();

    const actionNames = [
      "Shift Update",
      "Lead Communication Board",
      "Phone List",
      "ICU Snapshot",
      "Aide Communication Board",
      "Rental Management",
      "Short Shift Alert",
      "Announcement Board"
    ];
    const renderedOrder = Array.from(grid.children).map((card) =>
      actionNames.find((name) => card.textContent?.includes(name))
    );

    expect(renderedOrder).toEqual(actionNames);

    const unifiedActionCards = Array.from(grid.children).slice(0, 7);
    for (const card of unifiedActionCards) {
      expect(card).toHaveClass("bg-white/95", "border-2", "border-blue-900", "focus-visible:ring-2");
      expect(card.className).not.toMatch(/bg-(sky|blue|cyan|teal|purple|violet|amber|red)-50/);
    }
    expect(screen.getAllByTestId("lead-action-chevron")).toHaveLength(7);
    expect(screen.getByRole("link", { name: /Shift Update/ })).toHaveAttribute(
      "href",
      "/command-center/shift-update"
    );
    expect(screen.getByRole("link", { name: /Phone List/ })).toHaveAttribute(
      "href",
      "/command-center/phone-list"
    );
    expect(screen.getByRole("link", { name: /ICU Snapshot/ })).toHaveAttribute(
      "href",
      "/command-center/icu-snapshot"
    );
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
