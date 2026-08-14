import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftUpdateClient } from "@/components/ShiftUpdateClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

const mocks = vi.hoisted(() => ({
  fetchReportingWindowShiftStatusUpdates: vi.fn(),
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
    fetchReportingWindowShiftStatusUpdates: mocks.fetchReportingWindowShiftStatusUpdates
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
  fireEvent.change(screen.getByLabelText(/RTs Needed/), { target: { value: "216" } });
  fireEvent.change(screen.getByLabelText(/BiPAPs/), { target: { value: "2" } });
  fireEvent.change(screen.getByPlaceholderText("Initials or name"), { target: { value: "Lead RT" } });
}

function shiftUpdate(overrides: Partial<ShiftStatusUpdate> = {}): ShiftStatusUpdate {
  return {
    id: "status-1",
    department_id: "department-1",
    shift_date: "2026-08-07",
    shift_type: "night",
    rts_on: 7,
    rts_required: 7.5,
    vent_count: 6,
    bipap_count: 4,
    c_section_count: 8,
    vaginal_delivery_count: 2,
    cabg_count: 1,
    bronch_count: 1,
    sputum_induction_count: 3,
    other_procedure_count: 2,
    other_procedure_note: "MRI",
    updated_by_staff_profile_id: "lead-1",
    updated_by_name: "Lead RT",
    created_at: "2026-08-08T12:00:00.000Z",
    updated_at: "2026-08-08T12:00:00.000Z",
    ...overrides
  };
}

describe("ShiftUpdateClient submission flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T16:00:00.000Z"));
    mocks.fetchReportingWindowShiftStatusUpdates.mockReset();
    mocks.fetchReportingWindowShiftStatusUpdates.mockResolvedValue({
      data: [],
      error: null,
      usedLegacyProcedureSelect: false
    });
    mocks.insert.mockReset();
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    window.sessionStorage.clear();
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

  it("reopens with persisted counts and requires a fresh RVU entry when one procedure changes", async () => {
    mocks.fetchReportingWindowShiftStatusUpdates.mockResolvedValue({
      data: [shiftUpdate()],
      error: null,
      usedLegacyProcedureSelect: false
    });
    mocks.insert.mockResolvedValue({ error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByLabelText(/RTs Scheduled/)).toHaveValue(7);
    expect(screen.getByLabelText(/RTs Needed/)).toHaveValue(null);
    expect(screen.getByText("Enter RVUs")).toBeInTheDocument();
    expect(screen.queryByText(/Calculated:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Vents/)).toHaveValue(6);
    expect(screen.getByLabelText(/BiPAPs/)).toHaveValue(4);
    expect(screen.getByLabelText(/C-Sections/)).toHaveValue(8);
    expect(screen.getByLabelText(/Bronchs/)).toHaveValue(1);
    expect(screen.getByLabelText(/Vaginal Deliveries/)).toHaveValue(2);
    expect(screen.getByLabelText(/CABG/)).toHaveValue(1);
    expect(screen.getByLabelText(/Sputum Inductions/)).toHaveValue(3);
    expect(screen.getByLabelText(/MRI/)).toHaveValue(2);
    expect(screen.getByPlaceholderText("Enter procedure type")).toHaveValue("MRI");

    fireEvent.change(screen.getByLabelText(/C-Sections/), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText(/RTs Needed/), { target: { value: "202.5" } });
    fireEvent.change(screen.getByPlaceholderText("Initials or name"), { target: { value: "Editing Lead" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      rts_on: 7,
      rts_required: 7.5,
      vent_count: 6,
      bipap_count: 4,
      c_section_count: 9,
      vaginal_delivery_count: 2,
      cabg_count: 1,
      bronch_count: 1,
      sputum_induction_count: 3,
      other_procedure_count: 2,
      other_procedure_note: "MRI",
      updated_by_name: "Editing Lead"
    }));
  });

  it("shows and submits normally rounded RT need from decimal RVUs", async () => {
    mocks.insert.mockResolvedValue({ error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    populateRequiredFields();

    const rvuInput = screen.getByLabelText(/RTs Needed/) as HTMLInputElement;
    fireEvent.change(rvuInput, { target: { value: "188.65" } });

    expect(rvuInput).toHaveValue(188.65);
    fireEvent.blur(rvuInput);
    expect(rvuInput.value).toBe("7.0");
    expect(screen.queryByText(/Calculated:/)).not.toBeInTheDocument();

    fireEvent.focus(rvuInput);
    expect(rvuInput.value).toBe("188.65");
    fireEvent.blur(rvuInput);
    expect(rvuInput.value).toBe("7.0");

    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      rts_on: 8,
      rts_required: 7
    }));
    expect(JSON.parse(window.sessionStorage.getItem("whhs:last-submitted-shift-rvu") ?? "null")).toEqual(
      expect.objectContaining({ rtsNeeded: 7, rvuCount: 188.65 })
    );
  });

  it("does not display or submit an invalid staffing value", async () => {
    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    fireEvent.change(screen.getByLabelText(/RTs Scheduled/), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText(/BiPAPs/), { target: { value: "2" } });
    fireEvent.change(screen.getByPlaceholderText("Initials or name"), { target: { value: "Lead RT" } });

    expect(screen.queryByText(/Calculated:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Shift Update" })).toBeDisabled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("clears the editable values when the 16:00 reporting window begins without deleting history", async () => {
    vi.setSystemTime(new Date("2026-08-08T22:59:59.000Z"));
    mocks.fetchReportingWindowShiftStatusUpdates.mockResolvedValue({
      data: [shiftUpdate()],
      error: null,
      usedLegacyProcedureSelect: false
    });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByLabelText(/RTs Scheduled/)).toHaveValue(7);
    expect(screen.getByLabelText(/C-Sections/)).toHaveValue(8);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_050);
    });

    expect(screen.getByLabelText(/RTs Scheduled/)).toHaveValue(null);
    expect(screen.getByLabelText(/Vents/)).toHaveValue(null);
    expect(screen.getByLabelText(/C-Sections/)).toHaveValue(null);
    expect(screen.getByPlaceholderText("Enter procedure type")).toHaveValue("");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("clears evening values when the 04:00 reporting window begins", async () => {
    vi.setSystemTime(new Date("2026-08-09T10:59:59.000Z"));
    mocks.fetchReportingWindowShiftStatusUpdates.mockResolvedValue({
      data: [shiftUpdate({
        id: "evening-status",
        shift_date: "2026-08-08",
        shift_type: "day",
        created_at: "2026-08-09T00:00:00.000Z",
        updated_at: "2026-08-09T00:00:00.000Z"
      })],
      error: null,
      usedLegacyProcedureSelect: false
    });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByLabelText(/RTs Scheduled/)).toHaveValue(7);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_050);
    });

    expect(screen.getByLabelText(/RTs Scheduled/)).toHaveValue(null);
    expect(screen.getByLabelText(/BiPAPs/)).toHaveValue(null);
  });

  it("ignores a previous-window load that finishes after the reset boundary", async () => {
    vi.setSystemTime(new Date("2026-08-08T22:59:59.000Z"));
    let resolvePreviousLoad: ((value: {
      data: ShiftStatusUpdate[];
      error: null;
      usedLegacyProcedureSelect: false;
    }) => void) | null = null;
    mocks.fetchReportingWindowShiftStatusUpdates
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolvePreviousLoad = resolve;
      }))
      .mockResolvedValue({ data: [], error: null, usedLegacyProcedureSelect: false });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(1_050);
    });

    await act(async () => {
      resolvePreviousLoad?.({
        data: [shiftUpdate()],
        error: null,
        usedLegacyProcedureSelect: false
      });
      await Promise.resolve();
    });

    expect(screen.getByLabelText(/RTs Scheduled/)).toHaveValue(null);
    expect(screen.getByLabelText(/Vents/)).toHaveValue(null);
    expect(screen.getByLabelText(/C-Sections/)).toHaveValue(null);
  });
});
