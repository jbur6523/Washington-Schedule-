import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneListClient } from "@/components/PhoneListClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  tableResults: new Map<string, { data: unknown; error: unknown }>()
}));

function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject)
  };

  return builder;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) =>
      queryBuilder(mocks.tableResults.get(table) ?? { data: [], error: null }),
    rpc: mocks.rpc
  })
}));

const authContext: AuthenticatedUserContext = {
  authUserId: "auth-1",
  profileId: "profile-1",
  staffProfileId: "staff-lead",
  departmentId: "department-1",
  departmentName: "Respiratory Care",
  role: "lead",
  operationsRole: "none",
  displayName: "Lead User",
  hasLinkedStaffProfile: true
};

describe("PhoneListClient", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: "draft-1", error: null });
    mocks.tableResults.clear();
    mocks.tableResults.set("departments", {
      data: { active_schedule_version_id: "version-1" },
      error: null
    });
    mocks.tableResults.set("staff_profiles", {
      data: [
        { id: "staff-1", display_name: "Alpha Therapist" },
        { id: "staff-2", display_name: "Bravo Therapist" },
        { id: "off-shift", display_name: "Off Shift Therapist" }
      ],
      error: null
    });
    mocks.tableResults.set("schedule_entries", {
      data: [
        {
          id: "entry-2",
          staff_profile_id: "staff-2",
          shift_type: "day_shift",
          entry_status: "scheduled",
          staff_profiles: { id: "staff-2", display_name: "Bravo Therapist" }
        },
        {
          id: "entry-1",
          staff_profile_id: "staff-1",
          shift_type: "day_shift",
          entry_status: "scheduled",
          staff_profiles: { id: "staff-1", display_name: "Alpha Therapist" }
        }
      ],
      error: null
    });
    mocks.tableResults.set("user_schedule_overrides", { data: [], error: null });
    mocks.tableResults.set("phone_list_drafts", { data: null, error: null });
  });

  it("shows the complete active directory and commits roster shortcuts", async () => {
    render(<PhoneListClient authContext={authContext} timezone="America/Los_Angeles" />);

    const staffInput = await screen.findByTestId("staff-name-main_lead_therapist");
    await waitFor(() => expect(staffInput).not.toBeDisabled());

    expect(document.querySelector('option[value="Off Shift Therapist"]')).toBeInTheDocument();

    fireEvent.change(staffInput, { target: { value: "2" } });
    fireEvent.keyDown(staffInput, { key: "Enter" });

    expect(staffInput).toHaveValue("Bravo Therapist");
  });

  it("renders compact accessible assignment fields and keeps the actions concise", async () => {
    render(<PhoneListClient authContext={authContext} timezone="America/Los_Angeles" />);

    const staffInput = await screen.findByLabelText("Lead Therapist staff name");
    const extensionInput = screen.getByLabelText("Lead Therapist extension");
    const firstRow = screen.getByTestId("assignment-row-main_lead_therapist");
    const firstFields = screen.getByTestId("assignment-fields-main_lead_therapist");
    const assignmentRows = screen.getAllByTestId(/^assignment-row-/);
    const printButton = screen.getByRole("button", { name: "Print Phone List" });

    expect(assignmentRows).toHaveLength(31);
    expect(staffInput).toHaveAttribute("placeholder", "Roster # or staff name");
    expect(extensionInput).toHaveAttribute("placeholder", "Ext.");
    expect(staffInput).toHaveClass("min-w-0");
    expect(extensionInput).toHaveClass("min-w-0");
    expect(firstRow).toHaveClass("p-3");
    expect(firstFields.className).toContain(
      "grid-cols-[minmax(0,1fr)_clamp(5.625rem,28vw,7.1875rem)]"
    );
    expect(screen.getAllByRole("button", { name: "Save Draft" })).toHaveLength(1);
    const lastAssignmentRow = assignmentRows.at(-1);
    expect(lastAssignmentRow).toBeDefined();
    if (!lastAssignmentRow) {
      throw new Error("Expected the final Phone List assignment row.");
    }
    expect(
      lastAssignmentRow.compareDocumentPosition(printButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("prints current unsaved values and preserves Save Draft behavior", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<PhoneListClient authContext={authContext} timezone="America/Los_Angeles" />);

    const staffInput = await screen.findByTestId("staff-name-main_lead_therapist");
    const phoneInput = screen.getByTestId("phone-number-main_lead_therapist");
    const printButton = screen.getByRole("button", { name: "Print Phone List" });
    await waitFor(() => expect(printButton).not.toBeDisabled());

    fireEvent.change(staffInput, { target: { value: "Unsubmitted Therapist" } });
    fireEvent.change(phoneInput, { target: { value: "6404" } });
    fireEvent.click(printButton);

    expect(print).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();

    const printLayout = screen.getByTestId("phone-list-print-layout");
    expect(within(printLayout).getByText("Unsubmitted Therapist")).toBeInTheDocument();
    expect(within(printLayout).getByText("6404")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Save Draft" })[0]);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());

    const rpcArguments = mocks.rpc.mock.calls[0][1];
    const savedAssignments = rpcArguments.p_assignments as Array<{
      row_key: string;
      staff_name_snapshot: string | null;
      phone_number: string | null;
    }>;
    expect(savedAssignments.find((row) => row.row_key === "main_lead_therapist")).toMatchObject({
      staff_name_snapshot: "Unsubmitted Therapist",
      phone_number: "6404"
    });
  });

  it("shows a non-destructive message when browser printing is unavailable", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {
      throw new Error("Printing unavailable");
    });
    render(<PhoneListClient authContext={authContext} timezone="America/Los_Angeles" />);

    const printButton = screen.getByRole("button", { name: "Print Phone List" });
    await waitFor(() => expect(printButton).not.toBeDisabled());
    fireEvent.click(printButton);

    expect(
      screen.getByText("Printing is not available in this browser. Your phone list has not changed.")
    ).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("stores the profile reference for an autocomplete selection and allows manual names", async () => {
    render(<PhoneListClient authContext={authContext} timezone="America/Los_Angeles" />);

    const directoryInput = await screen.findByTestId("staff-name-main_lead_therapist");
    const manualInput = screen.getByTestId("staff-name-main_rapid_response");
    await waitFor(() => expect(directoryInput).not.toBeDisabled());

    fireEvent.change(directoryInput, { target: { value: "Off Shift Therapist" } });
    fireEvent.change(manualInput, { target: { value: "Agency Therapist" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save Draft" })[0]);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    const rpcArguments = mocks.rpc.mock.calls[0][1];
    const savedAssignments = rpcArguments.p_assignments as Array<{
      row_key: string;
      selected_staff_profile_id: string | null;
      staff_name_snapshot: string | null;
    }>;

    expect(savedAssignments).toHaveLength(31);
    expect(savedAssignments.find((row) => row.row_key === "main_lead_therapist")).toMatchObject({
      selected_staff_profile_id: "off-shift",
      staff_name_snapshot: "Off Shift Therapist"
    });
    expect(savedAssignments.find((row) => row.row_key === "main_rapid_response")).toMatchObject({
      selected_staff_profile_id: null,
      staff_name_snapshot: "Agency Therapist"
    });
  });

  it("does not carry phone memory into a different shift draft", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PhoneListClient authContext={authContext} timezone="America/Los_Angeles" />);

    const staffInput = await screen.findByTestId("staff-name-main_lead_therapist");
    const phoneInput = screen.getByTestId("phone-number-main_lead_therapist");
    await waitFor(() => expect(staffInput).not.toBeDisabled());

    fireEvent.change(staffInput, { target: { value: "Alpha Therapist" } });
    fireEvent.change(phoneInput, { target: { value: "6303" } });
    fireEvent.click(screen.getByRole("button", { name: "Night Shift" }));

    await waitFor(() => expect(screen.getByTestId("phone-number-main_lead_therapist")).toHaveValue(""));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("reloads a previously saved draft", async () => {
    mocks.tableResults.set("phone_list_drafts", {
      data: {
        id: "draft-1",
        schedule_date: "2026-07-24",
        shift_type: "day",
        updated_at: "2026-07-24T12:00:00Z",
        phone_list_assignments: [
          {
            row_key: "main_lead_therapist",
            selected_staff_profile_id: "staff-1",
            staff_name_snapshot: "Alpha Therapist",
            phone_number: "6303"
          }
        ]
      },
      error: null
    });

    render(<PhoneListClient authContext={authContext} timezone="America/Los_Angeles" />);

    expect(await screen.findByTestId("staff-name-main_lead_therapist")).toHaveValue("Alpha Therapist");
    expect(screen.getByTestId("phone-number-main_lead_therapist")).toHaveValue("6303");
    expect(screen.getByText(/Saved/)).toBeInTheDocument();
  });
});
