import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProcedureMetricsPage from "./page";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserContext: vi.fn(),
  fetchRows: vi.fn(),
  createClient: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  })
}));

vi.mock("@/lib/auth/current-user", () => ({
  getAuthenticatedUserContext: mocks.getAuthenticatedUserContext
}));

vi.mock("@/lib/metrics/queries", () => ({
  fetchProcedureMetricRows: mocks.fetchRows
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient
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

describe("Procedure Metrics route authorization", () => {
  beforeEach(() => {
    mocks.getAuthenticatedUserContext.mockReset();
    mocks.fetchRows.mockReset();
    mocks.createClient.mockReset();
    mocks.notFound.mockClear();
    mocks.getAuthenticatedUserContext.mockResolvedValue({ status: "authenticated", context: adminContext });
    mocks.createClient.mockResolvedValue({});
    mocks.fetchRows.mockResolvedValue({ data: [], error: null });
  });

  it("queries only the authorized department for the selected and previous months", async () => {
    render(await ProcedureMetricsPage({ searchParams: Promise.resolve({ month: "2026-08" }) }));

    expect(screen.getByRole("heading", { name: "August 2026" })).toBeInTheDocument();
    expect(mocks.fetchRows).toHaveBeenCalledWith(expect.anything(), "department-1", {
      minimumShiftDate: "2026-07-01",
      maximumShiftDate: expect.stringMatching(/^2026-08-\d{2}$/)
    });
  });

  it("denies unauthorized users before creating a data client or querying metrics", async () => {
    mocks.getAuthenticatedUserContext.mockResolvedValue({
      status: "authenticated",
      context: { ...adminContext, role: "lead" }
    });

    await expect(ProcedureMetricsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.fetchRows).not.toHaveBeenCalled();
  });
});
