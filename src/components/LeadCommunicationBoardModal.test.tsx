import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadCommunicationBoardModal } from "@/components/LeadCommunicationBoardModal";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  rpc: vi.fn()
}));

const note = {
  id: "note-1",
  department_id: "department-1",
  note_text: "Please review the staffing update.",
  priority: "normal",
  status: "new",
  created_by_staff_profile_id: "staff-lead",
  created_by_name: "RT Lead",
  reviewed_at: null,
  reviewed_by_staff_profile_id: null,
  reviewed_by_name: null,
  follow_up_text: null,
  followed_up_at: null,
  followed_up_by_staff_profile_id: null,
  followed_up_by_name: null,
  closed_at: null,
  closed_by_staff_profile_id: null,
  closed_by_name: null,
  created_at: "2026-08-10T15:00:00.000Z",
  updated_at: "2026-08-10T15:00:00.000Z"
};

type QueryResult = {
  data: unknown;
  error: null;
  count?: number;
};

type QueryBuilder = PromiseLike<QueryResult> & {
  select: (columns: string, options?: { count?: string; head?: boolean }) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
  insert: (payload: unknown) => Promise<{ error: null }>;
};

function queryBuilder(table: string) {
  let head = false;
  const result = (): QueryResult => {
    if (table === "lead_communication_notes") {
      return head
        ? { data: null, error: null, count: 1 }
        : { data: [note], error: null };
    }

    return { data: [], error: null };
  };

  const builder = {} as QueryBuilder;
  builder.select = (_columns, options) => {
    head = options?.head ?? false;
    return builder;
  };
  builder.eq = () => builder;
  builder.neq = () => builder;
  builder.order = () => builder;
  builder.range = () => builder;
  builder.insert = async (payload) => {
    mocks.insert(table, payload);
    return { error: null };
  };
  builder.then = (onfulfilled, onrejected) =>
    Promise.resolve(result()).then(onfulfilled, onrejected);
  return builder;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => queryBuilder(table),
    rpc: mocks.rpc
  })
}));

const leadershipAccounts = [
  ["holr", "Ramon Hollander"],
  ["chaj", "Jimmy Chang"],
  ["lead", "Lead/Leadership"]
] as const;

function leadershipContext(username: string, displayName: string): AuthenticatedUserContext {
  return {
    authUserId: `auth-${username}`,
    profileId: `profile-${username}`,
    staffProfileId: `staff-${username}`,
    departmentId: "department-1",
    departmentName: "Respiratory Care",
    role: "staff",
    operationsRole: "leadership",
    displayName,
    hasLinkedStaffProfile: true
  };
}

describe.each(leadershipAccounts)("Leadership communication for %s", (username, displayName) => {
  beforeEach(() => {
    mocks.insert.mockReset();
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("uses the authenticated author for new notes", async () => {
    render(
      <LeadCommunicationBoardModal
        authContext={leadershipContext(username, displayName)}
        open
        onClose={() => undefined}
        context="leadership"
      />
    );

    expect(await screen.findByText("Please review the staffing update.")).toBeInTheDocument();
    expect(screen.getByText(displayName)).toBeInTheDocument();
    expect(screen.queryByText("Not listed? Type name manually")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Add note for RT leads..."), {
      target: { value: `Update from ${username}` }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Note" }));

    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        "lead_communication_notes",
        expect.objectContaining({
          note_text: `Update from ${username}`,
          created_by_staff_profile_id: `staff-${username}`,
          created_by_name: displayName
        })
      )
    );
  });

  it("replies through the restricted server-side attribution function", async () => {
    render(
      <LeadCommunicationBoardModal
        authContext={leadershipContext(username, displayName)}
        open
        onClose={() => undefined}
        context="leadership"
      />
    );

    expect(await screen.findByText("Please review the staffing update.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByPlaceholderText("Write a reply..."), {
      target: { value: `Reply from ${username}` }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Reply" }));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("reply_to_lead_communication_note", {
        target_note_id: "note-1",
        reply_text: `Reply from ${username}`
      })
    );
  });
});
