import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminDashboardAreas } from "@/lib/admin/navigation";
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

  it("renders the eight approved admin shortcuts in a responsive grid", async () => {
    const view = render(await AdminPage());
    const expectedLinks = [
      ["Lead Command Board", "/command-center"],
      ["Leadership Dashboard", "/director/shift-status"],
      ["ICU Command Center", "/icu-command-center"],
      ["Rental Management", "/operations/rental-management"],
      ["Order Management", "/operations/order-management"],
      ["Staff Management", "/admin/roster"],
      ["Import Schedule", "/admin/import-schedule"],
      ["Metrics", "/admin/metrics"]
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

    expect(screen.getAllByRole("link")).toHaveLength(9);
    expect(view.container.querySelector(".grid")).toHaveClass("grid", "gap-3", "sm:grid-cols-2");
  });

  it("gives every module a distinct pastel card and matching accessible accent", async () => {
    render(await AdminPage());

    expect(new Set(adminDashboardAreas.map((area) => area.cardClassName)).size).toBe(8);
    expect(new Set(adminDashboardAreas.map((area) => area.buttonClassName)).size).toBe(8);

    for (const area of adminDashboardAreas) {
      const card = screen.getByRole("link", { name: new RegExp(area.title) });
      const title = screen.getByText(area.title);
      const button = screen.getByText(area.buttonLabel);

      expect(card).toHaveClass(...area.cardClassName.split(" "));
      expect(title).toHaveClass(...area.accentClassName.split(" "));
      expect(button).toHaveClass(...area.buttonClassName.split(" "));
      expect(button).toHaveClass("text-white");
    }
  });
});
