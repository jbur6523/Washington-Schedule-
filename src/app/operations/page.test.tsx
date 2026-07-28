import { beforeEach, describe, expect, it, vi } from "vitest";
import OperationsDashboardPage from "./page";

const { getAuthenticatedUserContextMock, redirectMock } = vi.hoisted(() => ({
  getAuthenticatedUserContextMock: vi.fn(),
  redirectMock: vi.fn()
}));

vi.mock("@/lib/auth/current-user", () => ({
  getAuthenticatedUserContext: getAuthenticatedUserContextMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

describe("operations dashboard routing", () => {
  beforeEach(() => {
    redirectMock.mockImplementation((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    });
  });

  it("redirects an authorized administrator to the admin dashboard", async () => {
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

    await expect(OperationsDashboardPage()).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect(redirectMock).toHaveBeenCalledWith("/admin");
  });
});
