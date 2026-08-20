import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MetricsPage from "./page";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserContext: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  })
}));

vi.mock("@/lib/auth/current-user", () => ({
  getAuthenticatedUserContext: mocks.getAuthenticatedUserContext
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: vi.fn()
}));

const adminContext = {
  authUserId: "admin-user",
  profileId: "admin-profile",
  staffProfileId: "admin-staff",
  departmentId: "department-1",
  departmentName: "Respiratory Therapy",
  role: "admin" as const,
  operationsRole: "none" as const,
  displayName: "Admin User",
  hasLinkedStaffProfile: true
};

describe("Metrics landing route authorization", () => {
  beforeEach(() => {
    mocks.getAuthenticatedUserContext.mockReset();
    mocks.notFound.mockClear();
    mocks.getAuthenticatedUserContext.mockResolvedValue({ status: "authenticated", context: adminContext });
  });

  it("renders the category landing page for an authorized admin", async () => {
    render(await MetricsPage());
    expect(screen.getByRole("heading", { name: "Metrics" })).toBeInTheDocument();
  });

  it("preserves the existing admin-only Metrics access boundary", async () => {
    mocks.getAuthenticatedUserContext.mockResolvedValue({
      status: "authenticated",
      context: { ...adminContext, role: "staff", operationsRole: "leadership" }
    });

    await expect(MetricsPage()).rejects.toThrow("not-found");
  });
});
