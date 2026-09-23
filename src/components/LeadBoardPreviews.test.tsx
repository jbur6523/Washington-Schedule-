import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadNotePreview } from "@/components/LeadBoardPreviews";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], error: null as unknown, from: vi.fn(), filters: vi.fn(), order: vi.fn(), limit: vi.fn(), changed: () => {}, remove: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => {
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => { mocks.filters(...args); return query; },
    neq: (...args: unknown[]) => { mocks.filters("neq", ...args); return query; },
    order: (...args: unknown[]) => { mocks.order(...args); return query; },
    limit: (...args: unknown[]) => { mocks.limit(...args); return query; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: mocks.rows, error: mocks.error }).then(resolve)
  };
  const channel = { on: (_event: unknown, _filter: unknown, callback: () => void) => { mocks.changed = callback; return channel; }, subscribe: () => channel };
  return { from: (table: string) => { mocks.from(table); return query; }, channel: () => channel, removeChannel: mocks.remove };
} }));
const authContext = { departmentId: "department-1", role: "lead", operationsRole: "command_center" } as AuthenticatedUserContext;

describe("Lead board previews", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rows = []; mocks.error = null; });

  it("shows the latest active lead note, attribution, urgent state, and existing board entry actions", async () => {
    mocks.rows = [{ id: "note-1", note_text: "Transport vent available", priority: "urgent", created_by_name: "Jon", updated_at: "2026-09-21T15:42:00Z" }];
    const onOpen = vi.fn();
    render(<LeadNotePreview authContext={authContext} timezone="America/Los_Angeles" onOpen={onOpen} onOpenAide={vi.fn()} newCount={2} revision={0} />);
    expect(await screen.findByText("Transport vent available")).toBeInTheDocument();
    expect(screen.getByText(/Updated .*Jon/)).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.getByText("2 new")).toBeInTheDocument();
    expect(mocks.filters).toHaveBeenCalledWith("department_id", "department-1");
    expect(mocks.filters).toHaveBeenCalledWith("neq", "status", "closed");
    expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mocks.limit).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.click(screen.getByRole("button", { name: /View All/ }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("does not offer note creation to an unauthorized viewer", async () => {
    render(<LeadNotePreview authContext={{ ...authContext, role: "staff", operationsRole: "none" }} timezone="America/Los_Angeles" onOpen={vi.fn()} onOpenAide={vi.fn()} newCount={0} revision={0} />);
    await waitFor(() => expect(screen.getByText("No current lead notes.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Add note" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Aide Board" }));
    expect(await screen.findByText("No current aide notes.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add note" })).not.toBeInTheDocument();
  });

  it("switches between existing boards and routes actions to the selected board", async () => {
    const onOpen = vi.fn();
    const onOpenAide = vi.fn();
    mocks.rows = [{ id: "lead", note_text: "Lead handoff", priority: "normal", updated_at: "2026-09-21T15:42:00Z" }];
    render(<LeadNotePreview authContext={authContext} timezone="America/Los_Angeles" onOpen={onOpen} onOpenAide={onOpenAide} newCount={0} revision={0} />);
    expect(await screen.findByText("Lead handoff")).toBeInTheDocument();
    mocks.rows = [{ id: "aide", note_text: "Aide equipment note", priority: "urgent", updated_at: "2026-09-21T15:42:00Z" }];
    fireEvent.click(screen.getByRole("tab", { name: "Aide Board" }));
    expect(screen.queryByText("Lead handoff")).not.toBeInTheDocument();
    expect(await screen.findByText("Aide equipment note")).toBeInTheDocument();
    expect(mocks.from).toHaveBeenLastCalledWith("rt_aide_notes");
    expect(mocks.remove).toHaveBeenCalled();
    expect(screen.getByRole("tabpanel", { name: "Aide Board" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.click(screen.getByRole("button", { name: "View All Aide Communication Board notes" }));
    expect(onOpenAide).toHaveBeenCalledTimes(2);
    expect(onOpen).not.toHaveBeenCalled();
    mocks.rows = [];
    await act(async () => { mocks.changed(); });
    expect(await screen.findByText("No current aide notes.")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Aide Board" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Lead Note" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Lead Note" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("No current lead notes.")).toBeInTheDocument();
    expect(mocks.from).toHaveBeenLastCalledWith("lead_communication_notes");
  });
});
