import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RtAideNotesModal } from "@/components/RtAideNotesModal";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
}));

const note = {
  id: "note-1",
  department_id: "department-1",
  note_text: "Please confirm the equipment count.",
  priority: "urgent",
  status: "responded",
  conversation_direction: "to_aides",
  created_by_staff_profile_id: "staff-lead",
  created_by_name: "Lead One",
  acknowledged_at: "2026-08-09T15:05:00.000Z",
  acknowledged_by_staff_profile_id: "staff-aide",
  acknowledged_by_name: "Aide One",
  response_text: "Count confirmed.",
  responded_at: "2026-08-09T15:10:00.000Z",
  responded_by_staff_profile_id: "staff-aide",
  responded_by_name: "Aide One",
  closed_at: null,
  closed_by_staff_profile_id: null,
  closed_by_name: null,
  created_at: "2026-08-09T15:00:00.000Z",
  updated_at: "2026-08-09T15:10:00.000Z",
};

const reply = {
  id: "reply-1",
  note_id: "note-1",
  reply_text: "Count confirmed.",
  created_by_staff_profile_id: "staff-aide",
  created_by_name: "Aide One",
  created_at: "2026-08-09T15:10:00.000Z",
};

type QueryResult = {
  data: unknown;
  error: null;
  count?: number;
};

type QueryBuilder = PromiseLike<QueryResult> & {
  select: (
    columns: string,
    options?: { count?: string; head?: boolean },
  ) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
  insert: (payload: unknown) => Promise<{ error: null }>;
};

function queryBuilder(table: string) {
  let head = false;
  const result = (): QueryResult => {
    if (table === "rt_aide_notes") {
      return head
        ? { data: null, error: null, count: 1 }
        : { data: [note], error: null };
    }

    if (table === "rt_aide_note_replies") {
      return { data: [reply], error: null };
    }

    if (table === "staff_profiles") {
      return {
        data: [
          { id: "staff-aide", display_name: "Aide One" },
          { id: "staff-lead", display_name: "Lead One" },
        ],
        error: null,
      };
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
  builder.in = () => builder;
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
  }),
}));

const aideAuthContext: AuthenticatedUserContext = {
  authUserId: "user-aide",
  profileId: "profile-aide",
  staffProfileId: "staff-aide",
  departmentId: "department-1",
  departmentName: "Respiratory Care",
  role: "staff",
  operationsRole: "aide",
  displayName: "Aide One",
  hasLinkedStaffProfile: true,
};

const leadAuthContext: AuthenticatedUserContext = {
  authUserId: "user-lead",
  profileId: "profile-lead",
  staffProfileId: "staff-lead",
  departmentId: "department-1",
  departmentName: "Respiratory Care",
  role: "lead",
  operationsRole: "none",
  displayName: "Lead One",
  hasLinkedStaffProfile: true,
};

describe("RtAideNotesModal conversation flow", () => {
  beforeEach(() => {
    mocks.insert.mockReset();
  });

  it("starts a new aide-to-lead conversation from a separate composer", async () => {
    render(
      <RtAideNotesModal
        authContext={aideAuthContext}
        open
        onClose={() => undefined}
        context="aide"
      />,
    );

    const newNoteButton = await screen.findByRole("button", {
      name: "+ New Note to Leads",
    });
    expect(
      screen.queryByText("Starts a new conversation with the RT Leads."),
    ).not.toBeInTheDocument();

    fireEvent.click(newNoteButton);
    expect(
      screen.getByText("Starts a new conversation with the RT Leads."),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText("Write a new note to the RT Leads..."),
      {
        target: { value: "Could a lead review tomorrow's assignment?" },
      },
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Added by" }), {
      target: { value: "staff-aide" },
    });
    fireEvent.click(screen.getByRole("button", { name: "urgent" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to Leads" }));

    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        "rt_aide_notes",
        expect.objectContaining({
          note_text: "Could a lead review tomorrow's assignment?",
          conversation_direction: "to_leads",
          priority: "urgent",
          created_by_staff_profile_id: "staff-aide",
          created_by_name: "Aide One",
        }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "New note sent to RT Leads.",
    );
  });

  it("labels existing actions as replies and appends them to the selected conversation", async () => {
    render(
      <RtAideNotesModal
        authContext={aideAuthContext}
        open
        onClose={() => undefined}
        context="aide"
      />,
    );

    expect(
      await screen.findByText("Please confirm the equipment count."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Conversation replies")).toHaveTextContent(
      "Reply from Aide One",
    );
    expect(screen.getByLabelText("Conversation replies")).toHaveTextContent(
      "Count confirmed.",
    );
    expect(
      screen.queryByRole("button", { name: "+ Add Note" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(
      screen.getByText("Replying to this conversation."),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText("Write a reply to this conversation..."),
      {
        target: { value: "The final count is twelve." },
      },
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Added by" }), {
      target: { value: "staff-aide" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Reply" }));

    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith("rt_aide_note_replies", {
        note_id: "note-1",
        reply_text: "The final count is twelve.",
        created_by_staff_profile_id: "staff-aide",
        created_by_name: "Aide One",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Reply sent.");
  });

  it("allows leads to continue the same conversation thread", async () => {
    render(
      <RtAideNotesModal
        authContext={leadAuthContext}
        open
        onClose={() => undefined}
        context="lead"
      />,
    );

    expect(
      await screen.findByText("Please confirm the equipment count."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(
      screen.getByPlaceholderText("Write a reply to this conversation..."),
      { target: { value: "Thanks for confirming." } },
    );
    const replyAuthorSelect = screen.getAllByRole("combobox", { name: "Added by" }).at(-1);
    expect(replyAuthorSelect).toBeDefined();
    fireEvent.change(replyAuthorSelect as HTMLSelectElement, {
      target: { value: "staff-lead" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Reply" }));

    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith("rt_aide_note_replies", {
        note_id: "note-1",
        reply_text: "Thanks for confirming.",
        created_by_staff_profile_id: "staff-lead",
        created_by_name: "Lead One",
      }),
    );
  });
});
