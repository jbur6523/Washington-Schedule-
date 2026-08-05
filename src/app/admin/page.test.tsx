import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./page";

const { getAuthenticatedUserContextMock } = vi.hoisted(() => ({
  getAuthenticatedUserContextMock: vi.fn()
}));

vi.mock("@/lib/auth/current-user", () => ({
  getAuthenticatedUserContext: getAuthenticatedUserContextMock
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn()
}));

describe("admin dashboard", () => {
  beforeEach(() => {
    getAuthenticatedUserContextMock.mockResolvedValue({
      status: "authenticated",
      context: {
        authUserId: "admin-user",
        profileId: "admin-profile",
        staffProfileId: "admin-staff",
        departmentId: "department",
        departmentName: "Respiratory Therapy",
        role: "admin",
        operationsRole: "none",
        displayName: "Admin User",
        hasLinkedStaffProfile: true
      }
    });
  });

  it("renders only the seven approved admin shortcuts in a responsive grid", async () => {
    const view = render(await AdminPage());
    const expectedLinks = [
      ["Lead Command Board", "/command-center"],
      ["Director Dashboard", "/director/shift-status"],
      ["ICU Command Center", "/icu-command-center"],
      ["Rental Management", "/operations/rental-management"],
      ["Order Management", "/operations/order-management"],
      ["Staff Management", "/admin/roster"],
      ["Import Schedule", "/admin/import-schedule"]
    ] as const;
    const removedCards = [
      "Schedule",
      "Manage Schedule",
      "Staff Directory",
      "Cover/Switch",
      "Gossip",
      "ICU Snapshot",
      "Communication Boards",
      "Short Shift Alert",
      "Schedule Versions"
    ];

    for (const [name, href] of expectedLinks) {
      expect(screen.getByRole("link", { name: new RegExp(name) })).toHaveAttribute("href", href);
    }

    for (const name of removedCards) {
      expect(screen.queryByRole("link", { name: new RegExp(`^${name}`) })).not.toBeInTheDocument();
    }

    expect(screen.getAllByRole("link")).toHaveLength(8);
    expect(view.container.querySelector(".grid")).toHaveClass("grid", "gap-3", "sm:grid-cols-2");
  });
});
