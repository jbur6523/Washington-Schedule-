import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandCenterShiftUpdatePage from "./page";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserContext: vi.fn(),
  selectedFormProps: vi.fn()
}));

vi.mock("@/lib/auth/current-user", () => ({
  getAuthenticatedUserContext: mocks.getAuthenticatedUserContext
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      async maybeSingle() {
        return { data: { timezone: "America/Los_Angeles" }, error: null };
      }
    };
    return { from: () => query };
  }
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/components/ShiftUpdateSelection", () => ({
  ShiftUpdateSelection: ({ options }: { options: unknown }) => (
    <section>
      <h1>Please select shift to update</h1>
      <output data-testid="options">{JSON.stringify(options)}</output>
    </section>
  )
}));

vi.mock("@/components/ShiftUpdateClient", () => ({
  ShiftUpdateClient: (props: { selection: { shiftDate: string; shiftType: string } }) => {
    mocks.selectedFormProps(props);
    return <h1>Selected Shift Update Form</h1>;
  }
}));

const authContext = {
  authUserId: "lead-user",
  profileId: "lead-profile",
  staffProfileId: "lead-staff",
  departmentId: "department-1",
  departmentName: "Respiratory Care",
  role: "lead" as const,
  operationsRole: "none" as const,
  displayName: "Lead RT",
  hasLinkedStaffProfile: true
};

describe("CommandCenterShiftUpdatePage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:00:00.000Z"));
    mocks.getAuthenticatedUserContext.mockResolvedValue({ status: "authenticated", context: authContext });
    mocks.selectedFormProps.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens on the time-aware shift selection screen", async () => {
    render(await CommandCenterShiftUpdatePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Please select shift to update" })).toBeInTheDocument();
    expect(screen.getByTestId("options")).toHaveTextContent("2026-08-24");
    expect(screen.getByTestId("options")).toHaveTextContent("day");
    expect(screen.getByTestId("options")).toHaveTextContent("night");
    expect(mocks.selectedFormProps).not.toHaveBeenCalled();
  });

  it("opens the form only for the exact valid query selection", async () => {
    render(await CommandCenterShiftUpdatePage({
      searchParams: Promise.resolve({ date: "2026-08-12", shift: "night" })
    }));

    expect(screen.getByRole("heading", { name: "Selected Shift Update Form" })).toBeInTheDocument();
    expect(mocks.selectedFormProps).toHaveBeenCalledWith(expect.objectContaining({
      selection: { shiftDate: "2026-08-12", shiftType: "night" }
    }));
  });

  it("returns malformed lookup values to the selection screen", async () => {
    render(await CommandCenterShiftUpdatePage({
      searchParams: Promise.resolve({ date: "2026-02-30", shift: "evening" })
    }));

    expect(screen.getByRole("heading", { name: "Please select shift to update" })).toBeInTheDocument();
    expect(mocks.selectedFormProps).not.toHaveBeenCalled();
  });
});
