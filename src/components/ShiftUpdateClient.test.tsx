import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftUpdateClient } from "@/components/ShiftUpdateClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftRecordSelection } from "@/lib/shift-status/reporting-window";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

const mocks = vi.hoisted(() => ({
  fetchShiftStatusUpdateForRecord: vi.fn(),
  rpc: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  staffOptions: [] as Array<{ id: string; display_name: string }>
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

const selectedShift = {
  shiftDate: "2026-08-08",
  shiftType: "day" as const
};

function renderShiftUpdate(selection: ShiftRecordSelection = selectedShift) {
  return render(
    <ShiftUpdateClient
      authContext={authContext}
      timezone="America/Los_Angeles"
      selection={selection}
    />
  );
}

function populateRequiredFields() {
  fireEvent.change(screen.getByLabelText(/RTs On Shift/), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText(/RVU Count/), { target: { value: "216" } });
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
    neonatal_high_flow_count: 2,
    bubble_cpap_count: 1,
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
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for one successful save, then immediately returns to a refreshed Lead Command Board", async () => {
    let resolveInsert: ((value: { error: null }) => void) | null = null;
    mocks.rpc.mockImplementation(
      () => new Promise<{ error: null }>((resolve) => {
        resolveInsert = resolve;
      })
    );

    renderShiftUpdate();
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

    expect(submitButton).toBeDisabled();
    expect(mocks.replace).toHaveBeenCalledWith("/command-center?shiftUpdate=saved");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.replace.mock.invocationCallOrder[0]
    );
    expect(mocks.replace.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refresh.mock.invocationCallOrder[0]
    );
    expect(screen.queryByText("Update Submitted")).not.toBeInTheDocument();
  });

  it("keeps form values and allows retry when persistence fails", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "insert failed" } });

    renderShiftUpdate();
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

    renderShiftUpdate();
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

    renderShiftUpdate();
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

  it("places Special Care Nursery between current counts and procedures and persists both counts", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    renderShiftUpdate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings.indexOf("Current Counts")).toBeLessThan(headings.indexOf("Special Care Nursery"));
    expect(headings.indexOf("Special Care Nursery")).toBeLessThan(headings.indexOf("Scheduled Procedures"));
    expect(screen.getByLabelText(/Neonatal High Flow/)).toHaveValue(0);
    expect(screen.getByLabelText(/Bubble CPAP/)).toHaveValue(0);

    fireEvent.change(screen.getByLabelText(/Neonatal High Flow/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/Bubble CPAP/), { target: { value: "2" } });
    populateRequiredFields();
    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(savedPayload()).toEqual(expect.objectContaining({
      neonatal_high_flow_count: 3,
      bubble_cpap_count: 2
    }));
  });

  it("shows RVU Count and places emphasized Shift Notes above Updated By", async () => {
    renderShiftUpdate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings.indexOf("Shift Notes")).toBeLessThan(headings.indexOf("Updated By"));
    expect(screen.getByLabelText(/RVU Count/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/RTs Needed/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Shift Notes")).toHaveClass("border-2", "border-cyan-300", "shadow-sm");
    expect(screen.getByLabelText("Select Lead", { exact: true })).toHaveClass("border-2", "border-cyan-300", "shadow-sm");
  });

  it("disables nursery entry and omits unsupported fields until the database migration is present", async () => {
    mocks.fetchShiftStatusUpdateForRecord.mockResolvedValue({
      data: shiftUpdate({
        neonatal_high_flow_count: undefined,
        bubble_cpap_count: undefined,
        rvu_total: 189
      }),
      error: null,
      usedLegacyNurserySelect: true
    });
    mocks.rpc.mockResolvedValue({ error: null });

    renderShiftUpdate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByLabelText(/Neonatal High Flow/)).toBeDisabled();
    expect(screen.getByLabelText(/Bubble CPAP/)).toBeDisabled();
    expect(screen.getByText("Nursery tracking will be available after the database update is applied.")).toBeInTheDocument();

    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(savedPayload()).not.toHaveProperty("neonatal_high_flow_count");
    expect(savedPayload()).not.toHaveProperty("bubble_cpap_count");
  });

  it("requires a custom updater name for Not Listed and never persists the sentinel", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    renderShiftUpdate();
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
    renderShiftUpdate();
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

    renderShiftUpdate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(7);
    expect(screen.getByLabelText(/RVU Count/)).toHaveValue(202.5);
    expect(screen.getByText(/Last: 202\.5 ·/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter RVUs")).toBe(screen.getByLabelText(/RVU Count/));
    expect(screen.queryByText("Enter RVUs")).not.toBeInTheDocument();
    expect(screen.queryByText(/Calculated:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Vents/)).toHaveValue(6);
    expect(screen.getByLabelText(/BiPAPs/)).toHaveValue(4);
    expect(screen.getByLabelText(/Neonatal High Flow/)).toHaveValue(2);
    expect(screen.getByLabelText(/Bubble CPAP/)).toHaveValue(1);
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
      neonatal_high_flow_count: 2,
      bubble_cpap_count: 1,
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

  it("waits for a successful canonical update before printing the persisted visible values", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    let resolveUpdate: ((value: { error: null }) => void) | null = null;
    mocks.rpc.mockImplementation(
      () => new Promise<{ error: null }>((resolve) => {
        resolveUpdate = resolve;
      })
    );
    mocks.fetchShiftStatusUpdateForRecord.mockResolvedValue({
      data: shiftUpdate({
        shift_date: "2026-08-08",
        shift_type: "day",
        rts_on: 7,
        rvu_total: 190.66,
        vent_count: 6,
        bipap_count: 13,
        c_section_count: 3,
        updated_by_staff_profile_id: null,
        updated_by_name: "Stephanie Ortiz",
        shift_note: "Original saved note"
      }),
      error: null
    });

    renderShiftUpdate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    fireEvent.change(screen.getByLabelText(/Shift Notes/), {
      target: { value: "Visible unsaved note" }
    });
    fireEvent.change(screen.getByPlaceholderText("Enter procedure type"), {
      target: { value: "Four scopes expected" }
    });
    const updateAndPrintButton = screen.getByRole("button", { name: "Update & Print" });
    fireEvent.click(updateAndPrintButton);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(print).not.toHaveBeenCalled();
    expect(updateAndPrintButton).toBeDisabled();

    await act(async () => {
      resolveUpdate?.({ error: null });
      await Promise.resolve();
    });

    const report = screen.getByTestId("shift-status-print-layout");
    expect(report).toHaveTextContent("08/08/2026");
    expect(report).toHaveTextContent("Day Shift");
    expect(report).toHaveTextContent("Updated by: Stephanie Ortiz");
    expect(report).toHaveTextContent("RTs Needed7.1");
    expect(report).toHaveTextContent("RVUs190.66");
    expect(report).toHaveTextContent("Four scopes expected");
    expect(report).toHaveTextContent("Visible unsaved note");
    expect(print).toHaveBeenCalledTimes(1);
    expect(updateAndPrintButton).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();

    print.mockRestore();
  });

  it("does not print or navigate when Update & Print persistence fails", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValue({ error: { message: "update failed" } });

    renderShiftUpdate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    populateRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Update & Print" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save shift update.");
    expect(print).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Update & Print" })).toBeEnabled();

    print.mockRestore();
  });

  it("prefills and preserves the active reporting window's saved shift note", async () => {
    mocks.fetchShiftStatusUpdateForRecord.mockResolvedValue({
      data: shiftUpdate({ shift_note: "Cover the north pod after 19:00." }),
      error: null
    });
    mocks.rpc.mockResolvedValue({ error: null });

    renderShiftUpdate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByLabelText(/Shift Notes/)).toHaveValue("Cover the north pod after 19:00.");
    fireEvent.change(screen.getByLabelText(/RVU Count/), { target: { value: "202.5" } });
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

    renderShiftUpdate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    fireEvent.change(screen.getByLabelText(/Shift Notes/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/RVU Count/), { target: { value: "202.5" } });
    fireEvent.change(screen.getByLabelText("Select Lead", { exact: true }), { target: { value: "lead-1" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save Shift Update" }).closest("form") as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });

    expect(savedPayload()).toEqual(expect.objectContaining({ shift_note: null }));
  });

  it("loads and saves the exact explicitly selected operational record", async () => {
    mocks.fetchShiftStatusUpdateForRecord.mockResolvedValue({
      data: shiftUpdate({
        shift_date: "2026-08-07",
        shift_type: "night",
        rts_on: 9,
        rvu_total: 188.65,
        shift_note: "Night note"
      }),
      error: null
    });
    mocks.rpc.mockResolvedValue({ error: null });

    renderShiftUpdate({ shiftDate: "2026-08-07", shiftType: "night" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(mocks.fetchShiftStatusUpdateForRecord).toHaveBeenCalledWith(
      expect.anything(),
      "department-1",
      "2026-08-07",
      "night"
    );
    expect(screen.getByLabelText("Date")).toHaveValue("2026-08-07");
    expect(screen.getByLabelText("Shift")).toHaveValue("Night Shift");
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

  it("keeps decimal RVUs visible while submitting the calculated RT need", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    renderShiftUpdate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    populateRequiredFields();

    const rvuInput = screen.getByLabelText(/RVU Count/) as HTMLInputElement;
    fireEvent.change(rvuInput, { target: { value: "188.65" } });

    expect(rvuInput).toHaveValue(188.65);
    fireEvent.blur(rvuInput);
    expect(rvuInput.value).toBe("188.65");
    expect(screen.queryByText(/Calculated:/)).not.toBeInTheDocument();

    fireEvent.focus(rvuInput);
    expect(rvuInput.value).toBe("188.65");
    fireEvent.blur(rvuInput);
    expect(rvuInput.value).toBe("188.65");

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
    renderShiftUpdate();
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

  it.each([
    ["2026-08-08T22:59:59.000Z", { shiftDate: "2026-08-08", shiftType: "day" as const }],
    ["2026-08-09T10:59:59.000Z", { shiftDate: "2026-08-08", shiftType: "night" as const }]
  ])("does not switch or clear the selected shift at an old reporting boundary (%s)", async (instant, selection) => {
    vi.setSystemTime(new Date(instant));
    mocks.fetchShiftStatusUpdateForRecord.mockResolvedValue({
      data: shiftUpdate({
        shift_date: selection.shiftDate,
        shift_type: selection.shiftType,
        shift_note: "Keep this selected shift"
      }),
      error: null
    });

    renderShiftUpdate(selection);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(7);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(mocks.fetchShiftStatusUpdateForRecord).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/RTs On Shift/)).toHaveValue(7);
    expect(screen.getByLabelText(/Shift Notes/)).toHaveValue("Keep this selected shift");
  });
});
