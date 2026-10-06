import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RvuStaffingMetricsPage from "./page";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserContext: vi.fn(),
  fetchRows: vi.fn(),
  fetchProcedures: vi.fn().mockResolvedValue({ data: [], error: null }),
  createClient: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  })
}));

vi.mock("@/lib/auth/current-user", () => ({
  getAuthenticatedUserContext: mocks.getAuthenticatedUserContext
}));

vi.mock("@/lib/metrics/queries", () => ({
  fetchRvuStaffingMetricRows: mocks.fetchRows,
  fetchProcedureMetricRows: mocks.fetchProcedures
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

describe("RVU staffing metrics route authorization", () => {
  beforeEach(() => {
    mocks.getAuthenticatedUserContext.mockReset();
    mocks.fetchRows.mockReset();
    mocks.fetchProcedures.mockClear();
    mocks.createClient.mockReset();
    mocks.notFound.mockClear();
    mocks.getAuthenticatedUserContext.mockResolvedValue({ status: "authenticated", context: adminContext });
    mocks.createClient.mockResolvedValue({});
    mocks.fetchRows.mockResolvedValue({ data: [], error: null });
  });

  it("lets an admin query only their department and uses Monthly / All Shifts by default", async () => {
    render(await RvuStaffingMetricsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "RVU & Procedure Metrics" })).toBeInTheDocument();
    expect(mocks.fetchRows).toHaveBeenCalledWith(expect.anything(), "department-1", {
      minimumShiftDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      maximumShiftDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      shift: "all"
    });
    expect(screen.getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Shift")).not.toBeInTheDocument();
  });

  it("allows Leadership to query RVU metrics for their department", async () => {
    mocks.getAuthenticatedUserContext.mockResolvedValue({
      status: "authenticated",
      context: { ...adminContext, role: "staff", operationsRole: "leadership" }
    });

    render(await RvuStaffingMetricsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "RVU & Procedure Metrics" })).toBeInTheDocument();
    expect(mocks.fetchRows).toHaveBeenCalledWith(expect.anything(), "department-1", expect.any(Object));
  });

  it("shows both sections by default under one date navigator", async () => {
    render(await RvuStaffingMetricsPage({ searchParams: Promise.resolve({ month: "2026-09" }) }));
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Daily Operational Detail" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Reporting-Window Detail" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Daily Detail" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Reporting period" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "RVU & Staffing Metrics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Procedure Metrics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Both" })).toHaveAttribute("aria-current", "page");
    expect(mocks.fetchProcedures).toHaveBeenCalledWith(expect.anything(), "department-1", expect.objectContaining({ maximumShiftDate: "2026-09-30" }));
  });

  it.each(["rvu", "procedures"])("preserves custom dates when selecting %s only", async view => {
    render(await RvuStaffingMetricsPage({ searchParams: Promise.resolve({ range: "custom", start: "2026-09-01", end: "2026-09-30", view }) }));
    expect(screen.getByRole("link", { name: "Both" })).toHaveAttribute("href", "/admin/rvu-staffing-metrics?range=custom&start=2026-09-01&end=2026-09-30&view=both");
    expect(screen.queryByRole("heading", { name: view === "rvu" ? "Procedure Metrics" : "RVU & Staffing Metrics" })).not.toBeInTheDocument();
    if (view === "rvu") expect(mocks.fetchProcedures).not.toHaveBeenCalled();
    else expect(mocks.fetchRows).not.toHaveBeenCalled();
  });

  it("denies a direct request outside Admin and Leadership before any metrics data query", async () => {
    mocks.getAuthenticatedUserContext.mockResolvedValue({
      status: "authenticated",
      context: { ...adminContext, role: "lead" }
    });

    await expect(RvuStaffingMetricsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
    expect(mocks.fetchRows).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

it("ignores legacy shift query parameters so both shifts remain in the report", async () => {
  mocks.getAuthenticatedUserContext.mockResolvedValue({ status: "authenticated", context: adminContext });
  mocks.createClient.mockResolvedValue({});
  mocks.fetchRows.mockResolvedValue({ data: [], error: null });
  await RvuStaffingMetricsPage({ searchParams: Promise.resolve({ range: "7", shift: "night" }) });
  expect(mocks.fetchRows).toHaveBeenLastCalledWith(expect.anything(), "department-1", expect.objectContaining({ shift: "all" }));
});
it("queries the exact inclusive custom date range", async () => {
  mocks.getAuthenticatedUserContext.mockResolvedValue({ status: "authenticated", context: adminContext });
  mocks.createClient.mockResolvedValue({});
  mocks.fetchRows.mockResolvedValue({ data: [], error: null });
  await RvuStaffingMetricsPage({ searchParams: Promise.resolve({ range: "custom", start: "2026-09-01", end: "2026-09-30" }) });
  expect(mocks.fetchRows).toHaveBeenLastCalledWith(expect.anything(), "department-1", { minimumShiftDate: "2026-09-01", maximumShiftDate: "2026-09-30", shift: "all" });
});
it.each([
  { start: "2026-02-30", end: "2026-03-01" },
  { start: "2026-10-02", end: "2026-10-01" },
  { start: "", end: "2026-10-01" }
])("rejects invalid custom dates before querying", async (dates) => {
  mocks.getAuthenticatedUserContext.mockResolvedValue({ status: "authenticated", context: adminContext });
  mocks.fetchRows.mockClear();
  render(await RvuStaffingMetricsPage({ searchParams: Promise.resolve({ range: "custom", ...dates }) }));
  expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  expect(mocks.fetchRows).not.toHaveBeenCalled();
});
