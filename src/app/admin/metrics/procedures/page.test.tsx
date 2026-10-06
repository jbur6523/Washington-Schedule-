import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T19:00:00.000Z"));
    mocks.getAuthenticatedUserContext.mockReset();
    mocks.fetchRows.mockReset();
    mocks.createClient.mockReset();
    mocks.notFound.mockClear();
    mocks.getAuthenticatedUserContext.mockResolvedValue({ status: "authenticated", context: adminContext });
    mocks.createClient.mockResolvedValue({});
    mocks.fetchRows.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queries only the authorized department for the bounded comparison and trend range", async () => {
    render(await ProcedureMetricsPage({ searchParams: Promise.resolve({ month: "2026-08" }) }));

    expect(screen.getByText("August 2026", { exact: true })).toBeInTheDocument();
    expect(mocks.fetchRows).toHaveBeenCalledWith(expect.anything(), "department-1", {
      minimumShiftDate: "2026-08-14",
      maximumShiftDate: expect.stringMatching(/^2026-08-\d{2}$/)
    });
  });

  it("allows Leadership to query procedure metrics for their department", async () => {
    mocks.getAuthenticatedUserContext.mockResolvedValue({
      status: "authenticated",
      context: { ...adminContext, role: "staff", operationsRole: "leadership" }
    });

    render(await ProcedureMetricsPage({ searchParams: Promise.resolve({ month: "2026-08" }) }));

    expect(screen.getByText("August 2026", { exact: true })).toBeInTheDocument();
    expect(mocks.fetchRows).toHaveBeenCalledWith(expect.anything(), "department-1", expect.any(Object));
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

  it("uses the selected custom period and keeps monthly trend query bounds", async () => {
    vi.setSystemTime(new Date("2026-10-06T19:00:00Z"));
    render(await ProcedureMetricsPage({ searchParams: Promise.resolve({ range: "custom", start: "2026-08-31", end: "2026-09-01" }) }));
    expect(screen.getByLabelText("Start Date")).toHaveValue("2026-08-31");
    expect(screen.getByLabelText("End Date")).toHaveValue("2026-09-01");
    expect(screen.getByRole("heading", { name: "Change vs Previous Period" })).toBeInTheDocument();
    expect(mocks.fetchRows).toHaveBeenCalledWith(expect.anything(), "department-1", { minimumShiftDate: "2026-08-14", maximumShiftDate: "2026-09-30" });
  });

  it.each([
    { start: "2026-02-30", end: "2026-03-01" },
    { start: "2026-08-20", end: "2026-08-19" },
    { start: "", end: "2026-08-20" },
    { start: "2026-08-20", end: "2099-08-20" }
  ])("rejects invalid custom periods without querying", async dates => {
    render(await ProcedureMetricsPage({ searchParams: Promise.resolve({ range: "custom", ...dates }) }));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(mocks.fetchRows).not.toHaveBeenCalled();
  });
});
