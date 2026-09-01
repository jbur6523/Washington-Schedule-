import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IcuCommandCenterClient } from "@/components/IcuCommandCenterClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { IcuDeviceType, IcuPatientEventRecord, IcuPatientRecord } from "@/lib/icu-command-center/types";

const mocks = vi.hoisted(() => ({
  activeRecords: [] as IcuPatientRecord[],
  activityEvents: [] as IcuPatientEventRecord[],
  patientInserts: vi.fn(),
  patientUpdates: vi.fn(),
  eventInserts: vi.fn()
}));

function patientRecord(overrides: Partial<IcuPatientRecord> = {}): IcuPatientRecord {
  return {
    id: "patient-1",
    department_id: "department-1",
    bed: "C223",
    device_type: "hfnc",
    airway_size: null,
    airway_at: null,
    airway_location: null,
    vent_mode: null,
    rate: null,
    tidal_volume: null,
    peep: null,
    fio2: 40,
    ps: null,
    t_high: null,
    t_low: null,
    p_high: null,
    p_low: null,
    percent_min_vol: null,
    ipap: null,
    epap: null,
    cpap: null,
    flow: 40,
    notes: null,
    is_critical_vent: false,
    is_sbt: false,
    is_flolan: false,
    is_prone: false,
    is_standby: false,
    ventilator_outcome: null,
    discontinued_at: null,
    discontinued_by_staff_profile_id: null,
    is_active: true,
    created_by_staff_profile_id: "staff-1",
    updated_by_staff_profile_id: "staff-1",
    created_at: "2026-09-01T19:00:00.000Z",
    updated_at: "2026-09-01T19:00:00.000Z",
    ...overrides
  };
}

function activityEvent(overrides: Partial<IcuPatientEventRecord> = {}): IcuPatientEventRecord {
  return {
    id: "event-1",
    department_id: "department-1",
    icu_patient_id: "patient-1",
    event_type: "updated",
    event_time: "2026-09-01T20:39:00.000Z",
    event_summary: "ICU note updated.",
    event_data: {
      action: "note_updated",
      bed: "C223",
      device: "HFNC",
      settings: "Flow 40 L/min - FiO2 40%",
      notes: "Updated note"
    },
    created_by_staff_profile_id: "staff-1",
    created_by_name: "ICU Command Center",
    operational_shift_date: null,
    operational_shift_type: null,
    created_at: "2026-09-01T20:39:00.000Z",
    ...overrides
  };
}

function queryBuilder(table: string) {
  let operation: "select" | "insert" | "update" = "select";
  let payload: Record<string, unknown> | null = null;

  const selectedResult = () => ({
    data: table === "icu_patients" ? mocks.activeRecords : mocks.activityEvents,
    error: null
  });
  const savedPatientResult = () => ({
    data: patientRecord({
      ...(payload ?? {}),
      id: operation === "update" ? mocks.activeRecords[0]?.id ?? "patient-1" : "patient-new"
    } as Partial<IcuPatientRecord>),
    error: null
  });
  const result = () => table === "icu_patients" && operation !== "select"
    ? savedPatientResult()
    : selectedResult();

  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    gte() {
      return builder;
    },
    lte() {
      return builder;
    },
    in() {
      return builder;
    },
    order() {
      return builder;
    },
    insert(value: Record<string, unknown>) {
      operation = "insert";
      payload = value;
      if (table === "icu_patients") {
        mocks.patientInserts(value);
      } else if (table === "icu_patient_events") {
        mocks.eventInserts(value);
      }
      return builder;
    },
    update(value: Record<string, unknown>) {
      operation = "update";
      payload = value;
      mocks.patientUpdates(value);
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(result());
    },
    then(
      resolve: (value: { data: unknown; error: null }) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(result()).then(resolve, reject);
    }
  };

  return builder;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on() {
        return channel;
      },
      subscribe() {
        return channel;
      }
    };

    return {
      from: (table: string) => queryBuilder(table),
      channel: () => channel,
      removeChannel: vi.fn(),
      rpc: vi.fn()
    };
  }
}));

const authContext: AuthenticatedUserContext = {
  authUserId: "auth-1",
  profileId: "profile-1",
  staffProfileId: "staff-1",
  departmentId: "department-1",
  departmentName: "Respiratory Care",
  role: "lead",
  operationsRole: "icu_command_center",
  displayName: "ICU Command Center",
  hasLinkedStaffProfile: true
};

describe("ICU patient notes", () => {
  beforeEach(() => {
    mocks.activeRecords = [];
    mocks.activityEvents = [];
    mocks.patientInserts.mockReset();
    mocks.patientUpdates.mockReset();
    mocks.eventInserts.mockReset();
  });

  it("shows the optional Notes field after every supported device settings section and saves a trimmed note", async () => {
    render(<IcuCommandCenterClient authContext={authContext} />);
    await screen.findByText("No active ICU respiratory devices.");

    fireEvent.click(screen.getByRole("button", { name: "Add Patient" }));
    const dialog = screen.getByRole("dialog", { name: "Add Patient" });
    const deviceSelect = within(dialog).getByLabelText("Device");
    const devices: Array<[IcuDeviceType, string]> = [
      ["vent", "Vent Settings"],
      ["bipap", "BiPAP Settings"],
      ["cpap", "CPAP Settings"],
      ["hfnc", "HFNC Settings"],
      ["cool_aerosol", "Cool Aerosol Settings"]
    ];

    for (const [device, settingsHeading] of devices) {
      fireEvent.change(deviceSelect, { target: { value: device } });
      const settings = within(dialog).getByRole("heading", { name: settingsHeading });
      const notes = within(dialog).getByLabelText(/^Notes/);
      expect(settings.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    fireEvent.change(within(dialog).getByLabelText("Bed"), { target: { value: "C223" } });
    fireEvent.change(deviceSelect, { target: { value: "hfnc" } });
    fireEvent.change(within(dialog).getByLabelText(/^Notes/), {
      target: { value: "  Weaning trial planned after rounds  " }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.patientInserts).toHaveBeenCalledOnce());
    expect(mocks.patientInserts).toHaveBeenCalledWith(expect.objectContaining({
      notes: "Weaning trial planned after rounds"
    }));
    await waitFor(() => expect(mocks.eventInserts).toHaveBeenCalledWith(expect.objectContaining({
      event_data: expect.objectContaining({ notes: "Weaning trial planned after rounds" })
    })));
  });

  it.each([
    ["replaces", "New note after rounds", "New note after rounds"],
    ["clears", "   ", null]
  ])("prepopulates and %s an existing note on update", async (_action, editedNote, expectedNote) => {
    mocks.activeRecords = [patientRecord({ notes: "Existing ICU note" })];
    render(<IcuCommandCenterClient authContext={authContext} />);
    await screen.findByRole("button", { name: "Edit note" });

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    const dialog = screen.getByRole("dialog", { name: "Update Patient" });
    const notes = within(dialog).getByLabelText(/^Notes/);
    expect(notes).toHaveValue("Existing ICU note");

    fireEvent.change(notes, { target: { value: editedNote } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.patientUpdates).toHaveBeenCalledOnce());
    expect(mocks.patientUpdates).toHaveBeenCalledWith(expect.objectContaining({ notes: expectedNote }));
  });

  it.each([
    ["adds", null, "  New inline note  ", "New inline note", "ICU note updated."],
    ["updates", "Existing ICU note", "  Updated inline note  ", "Updated inline note", "ICU note updated."],
    ["clears", "Existing ICU note", "   ", null, "ICU note cleared."]
  ])("%s a note directly from the compact patient card without updating device settings", async (_action, initialNote, noteDraft, expectedNote, eventSummary) => {
    mocks.activeRecords = [patientRecord({ notes: initialNote })];
    render(<IcuCommandCenterClient authContext={authContext} />);
    fireEvent.click(await screen.findByRole("button", { name: initialNote ? "Edit note" : "+ Add Note" }));
    const note = screen.getByLabelText("Notes");

    fireEvent.change(note, { target: { value: noteDraft } });
    fireEvent.click(screen.getByRole("button", { name: "Save Note" }));

    await waitFor(() => expect(mocks.patientUpdates).toHaveBeenCalledOnce());
    expect(mocks.patientUpdates).toHaveBeenCalledWith({
      notes: expectedNote,
      updated_by_staff_profile_id: "staff-1"
    });
    expect(mocks.eventInserts).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "updated",
      event_summary: eventSummary,
      event_data: expect.objectContaining({
        action: "note_updated",
        previousNotes: initialNote,
        notes: expectedNote
      })
    }));
    expect(screen.queryByRole("dialog", { name: "Update Patient" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument());
    if (expectedNote) {
      expect(screen.getByRole("article")).toHaveTextContent(`Note: ${expectedNote}`);
      expect(screen.getByRole("button", { name: "Edit note" })).toBeInTheDocument();
    } else {
      expect(screen.getByRole("button", { name: "+ Add Note" })).toBeInTheDocument();
      expect(screen.getByRole("article")).not.toHaveTextContent("Note:");
    }
  });

  it("labels note-only activity as a note update rather than a settings update", async () => {
    mocks.activityEvents = [activityEvent()];
    render(<IcuCommandCenterClient authContext={authContext} />);

    expect(await screen.findByText(/C223 HFNC note updated by ICU Command Center/)).toBeInTheDocument();
    expect(screen.queryByText(/C223 HFNC updated settings by ICU Command Center/)).not.toBeInTheDocument();
  });
});
