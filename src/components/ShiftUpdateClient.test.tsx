import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftUpdateClient } from "@/components/ShiftUpdateClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

const mocks = vi.hoisted(() => ({
  fetchShiftStatusUpdates: vi.fn(),
  insert: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh
  })
}));

vi.mock("@/lib/shift-status/client-queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shift-status/client-queries")>();
  return {
    ...actual,
    fetchShiftStatusUpdates: mocks.fetchShiftStatusUpdates
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const staffQuery = {
      select() {
        return staffQuery;
      },
      eq() {
        return staffQuery;
      },
      in() {
        return staffQuery;
      },
      async order() {
        return { data: [], error: null };
      }
    };

    return {
      from: (table: string) =>
        table === "shift_status_updates"
          ? { insert: mocks.insert }
          : staffQuery
    };
  }
}));

const authContext: AuthenticatedUserContext = {
  authUserId: "user-1",
  profileId: "profile-1",
  staffProfileId: null,
  departmentId: "department-1",
  departmentName: "Respiratory Care",
  role: "admin",
  operationsRole: "command_center",
  displayName: "Command Center",
  hasLinkedStaffProfile: false
};

function populateRequiredFields() {
  fireEvent.change(screen.getByLabelText(/RTs Scheduled/), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText(/RTs Needed/), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText(/BiPAPs/), { target: { value: "2" } });
  fireEvent.change(screen.getByPlaceholderText("Initials or name"), { target: { value: "Lead RT" } });
}

describe("ShiftUpdateClient submission flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T16:00:00.000Z"));
    mocks.fetchShiftStatusUpdates.mockReset();
    mocks.fetchShiftStatusUpdates.mockResolvedValue({ data: [], error: null });
    mocks.insert.mockReset();
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("confirms one successful save, then replaces the form with a refreshed Lead Command Board", async () => {
    let resolveInsert: ((value: { error: null }) => void) | null = null;
    mocks.insert.mockImplementation(
      () => new Promise<{ error: null }>((resolve) => {
        resolveInsert = resolve;
      })
    );

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    populateRequiredFields();

    const submitButton = screen.getByRole("button", { name: "Save Shift Update" });
    const form = submitButton.closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form as HTMLFormElement);
    fireEvent.submit(form as HTMLFormElement);

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(submitButton).toBeDisabled();
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () => {
      resolveInsert?.({ error: null });
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("Update Submitted");
    expect(submitButton).toBeDisabled();
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(mocks.replace).toHaveBeenCalledWith("/command-center");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.replace.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refresh.mock.invocationCallOrder[0]
    );
  });

  it("keeps form values and allows retry when persistence fails", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "insert failed" } });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    populateRequiredFields();

    const scheduledInput = screen.getByLabelText(/RTs Scheduled/) as HTMLInputElement;
    const bipapInput = screen.getByLabelText(/BiPAPs/) as HTMLInputElement;
    const submitButton = screen.getByRole("button", { name: "Save Shift Update" });

    fireEvent.submit(submitButton.closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save shift update.");
    expect(screen.queryByText("Update Submitted")).not.toBeInTheDocument();
    expect(scheduledInput).toHaveValue(8);
    expect(bipapInput).toHaveValue(2);
    expect(submitButton).toBeEnabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
