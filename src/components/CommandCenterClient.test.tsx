import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandCenterClient } from "@/components/CommandCenterClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

vi.mock("@/components/LeadOperationalSummary", () => ({
  LeadOperationalSummary: () => <section aria-label="Operational Summary">Operational Summary</section>
}));

vi.mock("@/components/DepartmentAnnouncement", () => ({
  DepartmentAnnouncementManagerCard: () => <button type="button">Announcement Board</button>
}));

vi.mock("@/components/LeadCommunicationBoardModal", () => ({
  fetchLeadCommunicationNewCount: () => new Promise<number>(() => undefined),
  LeadCommunicationBoardModal: () => null
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
  });
});
