import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftUpdateClient } from "@/components/ShiftUpdateClient";
import { LeadCommunicationBoardModal } from "@/components/LeadCommunicationBoardModal";
import { RtAideNotesModal } from "@/components/RtAideNotesModal";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

const mocks = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], queries: 0 }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/shift-status/client-queries", async (original) => ({
  ...await original<typeof import("@/lib/shift-status/client-queries")>(),
  fetchShiftStatusUpdateForRecord: async () => ({ data: null, error: null })
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      const query = {
        select: () => query,
        update: () => query,
        neq: () => query,
        lte: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
        order: () => query,
        range: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          if (table === "staff_profiles") mocks.queries++;
          return Promise.resolve({ data: table === "staff_profiles" ? mocks.rows.filter(row => filters.every(filter => filter(row))) : [], error: null }).then(resolve);
        }
      };
      return query;
    }
  })
}));

const anthony = {
  id: "anthony-existing-id", username: "alia", username_normalized: "alia",
  display_name: "Anthony Alix", department_id: "department-1", assigned_role: "lead",
  operations_role: "none", is_active: true
};
const context: AuthenticatedUserContext = {
  authUserId: "anthony-auth", profileId: "anthony-profile", staffProfileId: anthony.id,
  departmentId: "department-1", departmentName: "Respiratory Care", displayName: anthony.display_name,
  role: "lead", operationsRole: "none", hasLinkedStaffProfile: true
};

describe.each([
  ["Shift Update Select Lead", () => <ShiftUpdateClient authContext={context} timezone="America/Los_Angeles" selection={{ shiftDate: "2026-09-09", shiftType: "day" }} />, "Select Lead"],
  ["Lead communication attribution", () => <LeadCommunicationBoardModal authContext={context} open onClose={() => undefined} context="lead" />, "Added by"],
  ["RT Aide communication attribution", () => <RtAideNotesModal authContext={context} open onClose={() => undefined} context="lead" />, "Added by"]
] as const)("%s", (_name, component, label) => {
  beforeEach(() => { mocks.queries = 0; mocks.rows = [anthony]; window.sessionStorage.clear(); });

  it("offers active alia exactly once using the existing staff ID", async () => {
    render(component());
    const select = screen.getByLabelText(label, { exact: true });
    expect(await within(select).findByRole("option", { name: "Anthony Alix" })).toHaveValue(anthony.id);
    expect(within(select).getAllByRole("option", { name: "Anthony Alix" })).toHaveLength(1);
  });

  it.each([
    { is_active: false }, { assigned_role: "staff" }, { department_id: "other-department" }, { operations_role: "command_center" }
  ])("excludes alia when canonical eligibility changes: %j", async (change) => {
    mocks.rows = [{ ...anthony, ...change }];
    render(component());
    await waitFor(() => expect(mocks.queries).toBeGreaterThan(0));
    expect(within(screen.getByLabelText(label, { exact: true })).queryByRole("option", { name: "Anthony Alix" })).not.toBeInTheDocument();
  });
});
