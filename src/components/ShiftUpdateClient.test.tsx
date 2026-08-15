import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftUpdateClient } from "@/components/ShiftUpdateClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

const mocks = vi.hoisted(() => ({
  fetchShiftStatusUpdateForRecord: vi.fn(),
  rpc: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  staffOptions: [] as Array<{ id: string; display_name: string }>,
  reportingWindowEndDelay: vi.fn()
}));

vi.mock("@/lib/shift-status/reporting-window", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shift-status/reporting-window")>();
  return {
    ...actual,
    reportingWindowEndDelay: mocks.reportingWindowEndDelay
  };
});

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
    fetchShiftStatusUpdateForRecord: mocks.fetchShiftStatusUpdateForRecord
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
        return { data: mocks.staffOptions, error: null };
      }
    };

    return {
      from: () => staffQuery,
      rpc: mocks.rpc
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
  fireEvent.change(screen.getByLabelText(/RTs On Shift/), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText(/RTs Needed/), { target: { value: "216" } });
  fireEvent.change(screen.getByLabelText(/BiPAPs/), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Select Lead", { exact: true }), { target: { value: "lead-1" } });
}

function shiftUpdate(overrides: Partial<ShiftStatusUpdate> = {}): ShiftStatusUpdate {
  return {
    id: "status-1",
    department_id: "department-1",
    shift_date: "2026-08-07",
    shift_type: "night",
    rts_on: 7,
    rts_required: 7.5,
    rvu_total: null,
    vent_count: 6,
    bipap_count: 4,
    c_section_count: 8,
    vaginal_delivery_count: 2,
    cabg_count: 1,
    bronch_count: 1,
    sputum_induction_count: 3,
    other_procedure_count: 2,
    other_procedure_note: "MRI",
    shift_note: null,
    updated_by_staff_profile_id: "lead-1",
    updated_by_name: "Lead RT",
    created_at: "2026-08-08T12:00:00.000Z",
    updated_at: "2026-08-08T12:00:00.000Z",
    ...overrides
  };
}

function savedPayload(callIndex = 0) {
  return mocks.rpc.mock.calls[callIndex]?.[1]?.shift_payload;
}

describe("ShiftUpdateClient submission flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T16:00:00.000Z"));
    mocks.fetchShiftStatusUpdateForRecord.mockReset();
    mocks.fetchShiftStatusUpdateForRecord.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockReset();
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.staffOptions = [{ id: "lead-1", display_name: "Lead RT" }];
    mocks.reportingWindowEndDelay.mockReset();
    mocks.reportingWindowEndDelay.mockReturnValue(12 * 60 * 60 * 1_000);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("confirms one successful save, then replaces the form with a refreshed Lead Command Board", async () => {
    let resolveInsert: ((value: { error: null }) => void) | null = null;
    mocks.rpc.mockImplementation(
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

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
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
    mocks.rpc.mockResolvedValue({ error: { message: "insert failed" } });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    populateRequiredFields();

    const scheduledInput = screen.getByLabelText(/RTs On Shift/) as HTMLInputElement;
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

  it("submits a listed lead through the existing staff attribution pathway", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    populateRequiredFields();

    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.rpc).toHaveBeenCalledWith("save_shift_status_update", expect.any(Object));
    expect(savedPayload()).toEqual(expect.objectContaining({
      updated_by_staff_profile_id: "lead-1",
      updated_by_name: "Lead RT"
    }));
  });

  it("defaults blank scheduled procedure counts to zero without blocking submission", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const procedureInputs = [
      screen.getByLabelText(/C-Sections/),
      screen.getByLabelText(/Vaginal Deliveries/),
      screen.getByLabelText(/CABG/),
      screen.getByLabelText(/Bronchs/),
      screen.getByLabelText(/Sputum Inductions/),
      screen.getByLabelText(/MRI/)
    ];
    for (const input of procedureInputs) {
      expect(input).toHaveValue(0);
      fireEvent.change(input, { target: { value: "" } });
    }

    fireEvent.blur(procedureInputs[0]);
    expect(procedureInputs[0]).toHaveValue(0);
    populateRequiredFields();
    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    for (const input of procedureInputs) {
      expect(input).toHaveValue(0);
    }
    expect(savedPayload()).toEqual(expect.objectContaining({
      c_section_count: 0,
      vaginal_delivery_count: 0,
      cabg_count: 0,
      bronch_count: 0,
      sputum_induction_count: 0,
      other_procedure_count: 0
    }));
  });

  it("requires a custom updater name for Not Listed and never persists the sentinel", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    populateRequiredFields();

    const leadSelect = screen.getByLabelText("Select Lead", { exact: true });
    expect(screen.getAllByRole("option").at(-1)).toHaveTextContent("Not Listed");
    fireEvent.change(leadSelect, { target: { value: "__not_listed__" } });

    const customName = screen.getByLabelText("Enter your name", { exact: true });
    expect(customName).toBeRequired();
    expect(screen.getByRole("button", { name: "Save Shift Update" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();

    fireEvent.change(customName, { target: { value: "Relief Lead" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(savedPayload()).toEqual(expect.objectContaining({
      updated_by_staff_profile_id: null,
      updated_by_name: "Relief Lead"
    }));
    expect(JSON.stringify(savedPayload())).not.toContain("Not Listed");
    expect(JSON.stringify(savedPayload())).not.toContain("__not_listed__");
  });

  it("hides and clears the custom updater when a listed lead is selected again", async () => {
    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const leadSelect = screen.getByLabelText("Select Lead", { exact: true });
    fireEvent.change(leadSelect, { target: { value: "__not_listed__" } });
    fireEvent.change(screen.getByLabelText("Enter your name", { exact: true }), { target: { value: "Relief Lead" } });
    fireEvent.change(leadSelect, { target: { value: "lead-1" } });

    expect(screen.queryByLabelText("Enter your name", { exact: true })).not.toBeInTheDocument();
  });

  it("reopens with persisted RVUs and preserves staffing when one procedure changes", async () => {
    mocks.fetchShiftStatusUpdateForRecord.mockResolvedValue({
      data: shiftUpdate({ rvu_total: 202.5 }),
      error: null
    });
    mocks.rpc.mockResolvedValue({ error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(7);
    expect(screen.getByLabelText(/RTs Needed/)).toHaveValue(202.5);
    expect(screen.getByPlaceholderText("Enter RVUs")).toBe(screen.getByLabelText(/RTs Needed/));
    expect(screen.queryByText("Enter RVUs")).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Select Lead", { exact: true }), { target: { value: "lead-1" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(savedPayload()).toEqual(expect.objectContaining({
      rts_on: 7,
      rts_required: 7.5,
      rvu_total: "202.5",
      vent_count: 6,
      bipap_count: 4,
      c_section_count: 9,
      vaginal_delivery_count: 2,
      cabg_count: 1,
      bronch_count: 1,
      sputum_induction_count: 3,
      other_procedure_count: 2,
      other_procedure_note: "MRI",
      shift_note: null,
      updated_by_name: "Lead RT"
    }));
  });

  it("prefills and preserves the active reporting window's saved shift note", async () => {
    mocks.fetchShiftStatusUpdateForRecord.mockResolvedValue({
      data: shiftUpdate({ shift_note: "Cover the north pod after 19:00." }),
      error: null
    });
    mocks.rpc.mockResolvedValue({ error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByLabelText(/Shift Notes/)).toHaveValue("Cover the north pod after 19:00.");
    fireEvent.change(screen.getByLabelText(/RTs Needed/), { target: { value: "202.5" } });
    fireEvent.change(screen.getByLabelText("Select Lead", { exact: true }), { target: { value: "lead-1" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(savedPayload()).toEqual(expect.objectContaining({
      shift_note: "Cover the north pod after 19:00."
    }));
  });

  it("saves null when an existing shift note is intentionally cleared", async () => {
    mocks.fetchShiftStatusUpdateForRecord.mockResolvedValue({
      data: shiftUpdate({ shift_note: "Temporary operational note" }),
      error: null
    });
    mocks.rpc.mockResolvedValue({ error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    fireEvent.change(screen.getByLabelText(/Shift Notes/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/RTs Needed/), { target: { value: "202.5" } });
    fireEvent.change(screen.getByLabelText("Select Lead", { exact: true }), { target: { value: "lead-1" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(savedPayload()).toEqual(expect.objectContaining({ shift_note: null }));
  });

  it("shows Night Shift at 16:52 Pacific even if a saved row has a stale Day Shift label", async () => {
    vi.setSystemTime(new Date("2026-08-14T23:52:00.000Z"));
    mocks.fetchShiftStatusUpdateForRecord.mockResolvedValue({
      data: shiftUpdate({
        shift_date: "2026-08-14",
        shift_type: "day",
        created_at: "2026-08-14T23:30:00.000Z",
        updated_at: "2026-08-14T23:30:00.000Z"
      }),
      error: null
    });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByRole("button", { name: "Night Shift" })).toHaveAttribute("aria-pressed", "true");
  });

  it("protects unsaved values, then loads and saves the selected alternate shift record", async () => {
    const dayRecord = shiftUpdate({
      id: "day-status",
      shift_date: "2026-08-08",
      shift_type: "day",
      rts_on: 7,
      rvu_total: 176.45,
      shift_note: "Day note"
    });
    const nightRecord = shiftUpdate({
      id: "night-status",
      shift_date: "2026-08-07",
      shift_type: "night",
      rts_on: 9,
      rvu_total: 188.65,
      shift_note: "Night note"
    });
    mocks.fetchShiftStatusUpdateForRecord
      .mockResolvedValueOnce({ data: dayRecord, error: null })
      .mockResolvedValue({ data: nightRecord, error: null });
    mocks.rpc.mockResolvedValue({ error: null });
    const confirm = vi.spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    fireEvent.change(screen.getByLabelText(/RTs On Shift/), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "Night Shift" }));
    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(11);
    expect(mocks.fetchShiftStatusUpdateForRecord).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Night Shift" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(mocks.fetchShiftStatusUpdateForRecord).toHaveBeenLastCalledWith(
      expect.anything(),
      "department-1",
      "2026-08-07",
      "night"
    );
    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(9);
    expect(screen.getByLabelText(/Shift Notes/)).toHaveValue("Night note");

    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });
    expect(savedPayload()).toEqual(expect.objectContaining({
      shift_date: "2026-08-07",
      shift_type: "night",
      rts_on: 9,
      rvu_total: "188.65"
    }));
  });

  it("shows and submits normally rounded RT need from decimal RVUs", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

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

    expect(savedPayload()).toEqual(expect.objectContaining({
      rts_on: 8,
      rts_required: 7,
      rvu_total: "188.65"
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
    fireEvent.change(screen.getByLabelText(/RTs On Shift/), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText(/BiPAPs/), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Select Lead", { exact: true }), { target: { value: "lead-1" } });

    expect(screen.queryByText(/Calculated:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Shift Update" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("clears the editable values when the 16:00 reporting window begins without deleting history", async () => {
    mocks.reportingWindowEndDelay.mockReturnValue(1_000);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.setSystemTime(new Date("2026-08-08T22:59:59.000Z"));
    mocks.fetchShiftStatusUpdateForRecord
      .mockResolvedValueOnce({ data: shiftUpdate({ shift_note: "Day-window note" }), error: null })
      .mockResolvedValue({ data: null, error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(7);
    expect(screen.getByLabelText(/C-Sections/)).toHaveValue(8);
    expect(screen.getByLabelText(/Shift Notes/)).toHaveValue("Day-window note");
    expect(mocks.reportingWindowEndDelay).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(mocks.fetchShiftStatusUpdateForRecord).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(null);
    expect(screen.getByLabelText(/Vents/)).toHaveValue(null);
    expect(screen.getByLabelText(/C-Sections/)).toHaveValue(0);
    expect(screen.getByPlaceholderText("Enter procedure type")).toHaveValue("");
    expect(screen.getByLabelText(/Shift Notes/)).toHaveValue("");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("clears evening values when the 04:00 reporting window begins", async () => {
    mocks.reportingWindowEndDelay.mockReturnValue(1_000);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.setSystemTime(new Date("2026-08-09T10:59:59.000Z"));
    mocks.fetchShiftStatusUpdateForRecord
      .mockResolvedValueOnce({ data: shiftUpdate({
        id: "evening-status",
        shift_date: "2026-08-08",
        shift_type: "night",
        shift_note: "Evening-window note",
        created_at: "2026-08-09T00:00:00.000Z",
        updated_at: "2026-08-09T00:00:00.000Z"
      }), error: null })
      .mockResolvedValue({ data: null, error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(7);
    expect(screen.getByLabelText(/Shift Notes/)).toHaveValue("Evening-window note");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(null);
    expect(screen.getByLabelText(/BiPAPs/)).toHaveValue(null);
    expect(screen.getByLabelText(/Shift Notes/)).toHaveValue("");
  });

  it("ignores a previous-window load that finishes after the reset boundary", async () => {
    mocks.reportingWindowEndDelay.mockReturnValue(1_000);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.setSystemTime(new Date("2026-08-08T22:59:59.000Z"));
    let resolvePreviousLoad: ((value: {
      data: ShiftStatusUpdate | null;
      error: null;
    }) => void) | null = null;
    mocks.fetchShiftStatusUpdateForRecord
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolvePreviousLoad = resolve;
      }))
      .mockResolvedValue({ data: null, error: null });

    render(<ShiftUpdateClient authContext={authContext} timezone="America/Los_Angeles" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    await act(async () => {
      resolvePreviousLoad?.({
        data: shiftUpdate(),
        error: null
      });
      await Promise.resolve();
    });

    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(null);
    expect(screen.getByLabelText(/Vents/)).toHaveValue(null);
    expect(screen.getByLabelText(/C-Sections/)).toHaveValue(0);
  });
});
