import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchLeadCommunicationNewCount,
  LeadCommunicationBoardModal
} from "@/components/LeadCommunicationBoardModal";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  rpc: vi.fn(),
  update: vi.fn()
}));

const baseNote = {
  id: "note-1",
  department_id: "department-1",
  note_text: "Please review the staffing update.",
  priority: "normal",
  status: "new",
  created_by_staff_profile_id: "staff-lead",
  created_by_name: "RT Lead",
  reviewed_at: null as string | null,
  reviewed_by_staff_profile_id: null as string | null,
  reviewed_by_name: null as string | null,
  follow_up_text: null as string | null,
  followed_up_at: null as string | null,
  followed_up_by_staff_profile_id: null as string | null,
  followed_up_by_name: null as string | null,
  closed_at: null as string | null,
  closed_by_staff_profile_id: null as string | null,
  closed_by_name: null as string | null,
  created_at: "2026-08-10T15:00:00.000Z",
  updated_at: "2026-08-10T15:00:00.000Z"
};

type TestNote = typeof baseNote;

let storedNotes: TestNote[] = [];

function makeNote(overrides: Partial<TestNote> = {}): TestNote {
  return { ...baseNote, ...overrides };
}

type QueryResult = {
  data: unknown;
  error: null;
  count?: number;
};

type QueryBuilder = PromiseLike<QueryResult> & {
  select: (columns: string, options?: { count?: string; head?: boolean }) => QueryBuilder;
  update: (payload: Partial<TestNote>) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  lte: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
  insert: (payload: unknown) => Promise<{ error: null }>;
};

function queryBuilder(table: string) {
  let head = false;
  let updatePayload: Partial<TestNote> | null = null;
  let rangeStart = 0;
  let rangeEnd = Number.POSITIVE_INFINITY;
  let orderColumn: string | null = null;
  let orderAscending = true;
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];

  const matchingNotes = () => {
    const filtered = storedNotes.filter((row) =>
      filters.every((filter) => filter(row as unknown as Record<string, unknown>))
    );

    if (orderColumn) {
      filtered.sort((left, right) => {
        const comparison = String(left[orderColumn as keyof TestNote]).localeCompare(
          String(right[orderColumn as keyof TestNote])
        );
        return orderAscending ? comparison : -comparison;
      });
    }

    return filtered;
  };

  const builder = {} as QueryBuilder;
  builder.select = (_columns, options) => {
    head = options?.head ?? false;
    return builder;
  };
  builder.update = (payload) => {
    updatePayload = payload;
    mocks.update(table, payload);
    return builder;
  };
  builder.eq = (column, value) => {
    filters.push((row) => row[column] === value);
    return builder;
  };
  builder.neq = (column, value) => {
    filters.push((row) => row[column] !== value);
    return builder;
  };
  builder.lte = (column, value) => {
    filters.push((row) => String(row[column]) <= String(value));
    return builder;
  };
  builder.in = (column, values) => {
    filters.push((row) => values.includes(row[column]));
    return builder;
  };
  builder.order = (column, options) => {
    orderColumn = column;
    orderAscending = options?.ascending ?? true;
    return builder;
  };
  builder.range = (from, to) => {
    rangeStart = from;
    rangeEnd = to;
    return builder;
  };
  builder.insert = async (payload) => {
    mocks.insert(table, payload);
    return { error: null };
  };
  builder.then = (onfulfilled, onrejected) => {
    if (table === "lead_communication_notes") {
      const matching = matchingNotes();
      if (updatePayload) {
        matching.forEach((row) => Object.assign(row, updatePayload));
        return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
      }

      const result = head
        ? { data: null, error: null, count: matching.length }
        : { data: matching.slice(rangeStart, rangeEnd + 1), error: null };
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }

    return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
  };
  return builder;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => queryBuilder(table),
    rpc: async (functionName: string, args: Record<string, unknown>) => {
      mocks.rpc(functionName, args);

      if (functionName === "reply_to_lead_communication_note") {
        const noteId = String(args.target_note_id);
        const note = storedNotes.find((item) => item.id === noteId);
        if (note) {
          note.follow_up_text = String(args.reply_text);
          note.followed_up_at = "2026-08-10T16:05:00.000Z";
          note.followed_up_by_name = "Reply Author";
        }
        return { data: true, error: null };
      }

      return { data: null, error: null };
    }
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

function reviewerContext(role: "admin" | "lead" = "lead"): AuthenticatedUserContext {
  return {
    authUserId: `auth-${role}`,
    profileId: `profile-${role}`,
    staffProfileId: `staff-${role}`,
    departmentId: "department-1",
    departmentName: "Respiratory Care",
    role,
    operationsRole: "command_center",
    displayName: role === "admin" ? "Admin User" : "Lead RT",
    hasLinkedStaffProfile: true
  };
}

function commandCenterContext(): AuthenticatedUserContext {
  return {
    authUserId: "auth-sputum",
    profileId: "profile-sputum",
    staffProfileId: "staff-sputum",
    departmentId: "department-1",
    departmentName: "Respiratory Care",
    role: "staff",
    operationsRole: "command_center",
    displayName: "Respiratory Command Center",
    hasLinkedStaffProfile: true
  };
}

describe("Lead Communication shared read state and replies", () => {
  beforeEach(() => {
    storedNotes = [makeNote()];
    mocks.insert.mockReset();
    mocks.rpc.mockReset();
    mocks.update.mockReset();
  });

  it("counts shared unread messages for the command-board badge", async () => {
    storedNotes = [
      makeNote({ id: "new-1" }),
      makeNote({ id: "new-2" }),
      makeNote({ id: "read-1", status: "reviewed" })
    ];

    await expect(fetchLeadCommunicationNewCount("department-1")).resolves.toBe(2);
  });

  it.each(["lead", "admin"] as const)(
    "acknowledges existing unread messages when the %s board is opened",
    async (role) => {
      const onNotesChanged = vi.fn();
      render(
        <LeadCommunicationBoardModal
          authContext={reviewerContext(role)}
          open
          onClose={() => undefined}
          onNotesChanged={onNotesChanged}
          context="lead"
        />
      );

      expect(await screen.findByText("Please review the staffing update.")).toBeInTheDocument();
      await waitFor(() => expect(storedNotes[0].status).toBe("reviewed"));
      expect(await screen.findByText("Read")).toBeInTheDocument();
      const markUnread = screen.getByRole("button", { name: "Mark Unread" });
      const reply = screen.getByRole("button", { name: "Reply" });
      expect(markUnread).toBeEnabled();
      expect(markUnread.parentElement).toBe(reply.parentElement);
      expect(onNotesChanged).toHaveBeenCalled();
    }
  );

  it("keeps notes that arrived after board entry unread", async () => {
    storedNotes = [
      makeNote({ id: "existing", created_at: "2020-01-01T00:00:00.000Z" }),
      makeNote({ id: "arrived-later", created_at: "2099-01-01T00:00:00.000Z" })
    ];

    render(
      <LeadCommunicationBoardModal
        authContext={reviewerContext()}
        open
        onClose={() => undefined}
        context="lead"
      />
    );

    await waitFor(() => expect(storedNotes.find((note) => note.id === "existing")?.status).toBe("reviewed"));
    expect(storedNotes.find((note) => note.id === "arrived-later")?.status).toBe("new");
    await expect(fetchLeadCommunicationNewCount("department-1")).resolves.toBe(1);
  });

  it("restores Mark Unread on read notes and acknowledges them on the next board entry", async () => {
    const historicalReview = "2026-07-01T10:00:00.000Z";
    storedNotes = [makeNote({
      status: "reviewed",
      reviewed_at: historicalReview,
      reviewed_by_staff_profile_id: "staff-original-reviewer",
      reviewed_by_name: "Original Reviewer"
    })];
    const onNotesChanged = vi.fn();
    const { rerender } = render(
      <LeadCommunicationBoardModal
        authContext={reviewerContext()}
        open
        onClose={() => undefined}
        onNotesChanged={onNotesChanged}
        context="lead"
      />
    );

    const markUnread = await screen.findByRole("button", { name: "Mark Unread" });
    fireEvent.click(markUnread);

    expect(await screen.findByText("New")).toBeInTheDocument();
    await expect(fetchLeadCommunicationNewCount("department-1")).resolves.toBe(1);
    expect(storedNotes[0]).toMatchObject({
      reviewed_at: historicalReview,
      reviewed_by_staff_profile_id: "staff-original-reviewer",
      reviewed_by_name: "Original Reviewer"
    });
    expect(onNotesChanged).toHaveBeenCalled();

    rerender(
      <LeadCommunicationBoardModal
        authContext={reviewerContext()}
        open={false}
        onClose={() => undefined}
        onNotesChanged={onNotesChanged}
        context="lead"
      />
    );
    rerender(
      <LeadCommunicationBoardModal
        authContext={reviewerContext()}
        open
        onClose={() => undefined}
        onNotesChanged={onNotesChanged}
        context="lead"
      />
    );

    await waitFor(() => expect(storedNotes[0].status).toBe("reviewed"));
    expect(await screen.findByRole("button", { name: "Mark Unread" })).toBeEnabled();
    expect(storedNotes[0].reviewed_at).toBe(historicalReview);
  });

  it("clears the shared badge after existing unread notes are acknowledged on entry", async () => {
    storedNotes = [makeNote({ id: "note-1" }), makeNote({ id: "note-2", note_text: "Second note" })];
    render(
      <LeadCommunicationBoardModal
        authContext={reviewerContext()}
        open
        onClose={() => undefined}
        context="lead"
      />
    );

    await waitFor(() => expect(storedNotes.every((note) => note.status === "reviewed")).toBe(true));
    await expect(fetchLeadCommunicationNewCount("department-1")).resolves.toBe(0);
  });

  it("allows a lead to reply to a self-authored note", async () => {
    render(
      <LeadCommunicationBoardModal authContext={reviewerContext()} open onClose={() => undefined} context="lead" />
    );

    expect(await screen.findByText("Please review the staffing update.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByPlaceholderText("Write a reply..."), {
      target: { value: "Reply for the team" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Reply" }));

    await waitFor(() => expect(storedNotes[0].follow_up_text).toBe("Reply for the team"));
    expect(mocks.update).toHaveBeenCalledWith(
      "lead_communication_notes",
      expect.objectContaining({ follow_up_text: "Reply for the team" })
    );
  });

  it("treats a Sputum-authored note as replyable for the shared command-center login", async () => {
    storedNotes = [makeNote({
      created_by_staff_profile_id: "staff-sputum",
      created_by_name: "Respiratory Command Center"
    })];

    render(
      <LeadCommunicationBoardModal authContext={commandCenterContext()} open onClose={() => undefined} context="lead" />
    );

    expect(await screen.findByText("Please review the staffing update.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByPlaceholderText("Write a reply..."), {
      target: { value: "Reply from the next person using Sputum" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Reply" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("reply_to_lead_communication_note", {
      target_note_id: "note-1",
      reply_text: "Reply from the next person using Sputum"
    }));
    expect(await screen.findByText("Reply from the next person using Sputum")).toBeInTheDocument();
  });

  it("preserves urgent styling, attribution, timestamps, and archived-note filtering", async () => {
    storedNotes = [
      makeNote({ priority: "urgent", created_by_name: "Urgent Author" }),
      makeNote({ id: "closed-note", note_text: "Archived note", status: "closed" })
    ];

    render(
      <LeadCommunicationBoardModal authContext={reviewerContext()} open onClose={() => undefined} context="lead" />
    );

    expect(await screen.findByText("Urgent")).toBeInTheDocument();
    expect(screen.getByText("Created by: Urgent Author")).toBeInTheDocument();
    expect(screen.getByText(/08\/10\/2026, \d{2}:00/)).toBeInTheDocument();
    expect(screen.queryByText("Archived note")).not.toBeInTheDocument();
  });
});

describe.each(leadershipAccounts)("Leadership communication for %s", (username, displayName) => {
  beforeEach(() => {
    storedNotes = [makeNote()];
    mocks.insert.mockReset();
    mocks.rpc.mockReset();
    mocks.update.mockReset();
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
    expect(screen.queryByRole("button", { name: "Mark Reviewed" })).not.toBeInTheDocument();
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
