import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DepartmentAnnouncementBoard,
  DepartmentAnnouncementEditor,
  DepartmentAnnouncementManagerCard
} from "@/components/DepartmentAnnouncement";
import {
  announcementMessageLimit,
  announcementTitleLimit,
  type DepartmentAnnouncement
} from "@/lib/announcements/types";

const mocks = vi.hoisted(() => ({
  loadResult: { data: null as unknown, error: null as unknown },
  realtimeCallback: null as null | ((payload: { eventType: string; new?: unknown }) => void),
  eq: vi.fn(),
  removeChannel: vi.fn()
}));

function queryBuilder() {
  const builder = {
    select: () => builder,
    eq: (column: string, value: string) => {
      mocks.eq(column, value);
      return builder;
    },
    maybeSingle: () => Promise.resolve(mocks.loadResult)
  };
  return builder;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: (
        _kind: string,
        _filter: unknown,
        callback: (payload: { eventType: string; new?: unknown }) => void
      ) => {
        mocks.realtimeCallback = callback;
        return channel;
      },
      subscribe: () => channel
    };

    return {
      from: () => queryBuilder(),
      channel: () => channel,
      removeChannel: mocks.removeChannel
    };
  }
}));

const activeAnnouncement: DepartmentAnnouncement = {
  id: "announcement-1",
  department_id: "department-1",
  title: "Department meeting",
  message: "First line\nSecond line",
  updated_by_staff_profile_id: "staff-lead",
  updated_by_name: "Lead User",
  created_at: "2026-08-05T15:00:00.000Z",
  updated_at: "2026-08-05T16:30:00.000Z"
};

describe("department announcement UI", () => {
  beforeEach(() => {
    mocks.loadResult = { data: null, error: null };
    mocks.realtimeCallback = null;
    mocks.eq.mockReset();
    mocks.removeChannel.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the employee empty state and scopes the read to the employee department", async () => {
    render(
      <DepartmentAnnouncementBoard
        departmentId="department-1"
        timezone="America/Los_Angeles"
      />
    );

    expect(await screen.findByText("There are no current announcements.")).toBeInTheDocument();
    expect(mocks.eq).toHaveBeenCalledWith("department_id", "department-1");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a compact summary and opens the full announcement in an accessible dialog", async () => {
    mocks.loadResult = { data: activeAnnouncement, error: null };
    render(
      <DepartmentAnnouncementBoard
        departmentId="department-1"
        timezone="America/Los_Angeles"
      />
    );

    expect(await screen.findByRole("heading", { name: "Department meeting" })).toBeInTheDocument();
    expect(screen.getByText(/08\/05\/2026/)).toBeInTheDocument();
    expect(screen.queryByText((_, element) => element?.textContent === "First line\nSecond line")).not.toBeInTheDocument();
    expect(screen.queryByText(/by Lead User/)).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "View Details" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Department meeting" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const message = screen.getByText((_, element) => element?.textContent === "First line\nSecond line");
    expect(message).toHaveClass("whitespace-pre-wrap", "break-words", "[overflow-wrap:anywhere]");
    expect(screen.getByText(/by Lead User/)).toBeInTheDocument();
    const closeButton = screen.getByRole("button", { name: "Close announcement details" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("turns announcement URLs into wrapped links that open in a new window", async () => {
    mocks.loadResult = {
      data: {
        ...activeAnnouncement,
        message: "Join https://zoom.us/j/123456789?pwd=meeting.\nBackup: www.example.com/guide"
      },
      error: null
    };
    render(
      <DepartmentAnnouncementBoard
        departmentId="department-1"
        timezone="America/Los_Angeles"
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "View Details" }));

    const zoomLink = screen.getByRole("link", { name: "https://zoom.us/j/123456789?pwd=meeting" });
    expect(zoomLink).toHaveAttribute("href", "https://zoom.us/j/123456789?pwd=meeting");
    expect(zoomLink).toHaveAttribute("target", "_blank");
    expect(zoomLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(zoomLink).toHaveClass("[overflow-wrap:anywhere]");

    const backupLink = screen.getByRole("link", { name: "www.example.com/guide" });
    expect(backupLink).toHaveAttribute("href", "https://www.example.com/guide");
    expect(backupLink).toHaveAttribute("target", "_blank");
  });

  it("applies realtime replacements and clears without a manual refresh", async () => {
    render(
      <DepartmentAnnouncementBoard
        departmentId="department-1"
        timezone="America/Los_Angeles"
      />
    );
    await screen.findByText("There are no current announcements.");
    const initialReadCount = mocks.eq.mock.calls.length;

    act(() => {
      mocks.realtimeCallback?.({ eventType: "INSERT", new: activeAnnouncement });
    });
    expect(screen.getByRole("heading", { name: "Department meeting" })).toBeInTheDocument();

    act(() => {
      mocks.realtimeCallback?.({ eventType: "DELETE" });
    });
    expect(screen.getByText("There are no current announcements.")).toBeInTheDocument();
    expect(mocks.eq).toHaveBeenCalledTimes(initialReadCount);
  });

  it("creates, replaces, updates, and clears through the shared editor", async () => {
    mocks.loadResult = { data: activeAnnouncement, error: null };
    const updatedAnnouncement = {
      ...activeAnnouncement,
      title: "Updated title",
      message: "Updated message",
      updated_at: "2026-08-05T17:00:00.000Z"
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ announcement: updatedAnnouncement }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <DepartmentAnnouncementEditor
        departmentId="department-1"
        timezone="America/Los_Angeles"
      />
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/Announcement title/)).toHaveValue("Department meeting")
    );
    const titleInput = screen.getByLabelText(/Announcement title/);
    const messageInput = screen.getByLabelText(/Announcement message/);
    expect(screen.getByRole("button", { name: "Update Announcement" })).toBeInTheDocument();

    fireEvent.change(titleInput, { target: { value: "Updated title" } });
    fireEvent.change(messageInput, { target: { value: "Updated message" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Announcement" }));

    await screen.findByText("Announcement updated.");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/announcements",
      expect.objectContaining({ method: "POST" })
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear Announcement" }));
    await screen.findByText("Announcement cleared.");
    expect(window.confirm).toHaveBeenCalledWith("Clear the current department announcement?");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/announcements", { method: "DELETE" });
    expect(screen.getByRole("button", { name: "Save Announcement" })).toBeInTheDocument();
  });

  it("uses the compact management card to open the shared editor modal", async () => {
    render(
      <DepartmentAnnouncementManagerCard
        departmentId="department-1"
        timezone="America/Los_Angeles"
      />
    );

    const trigger = screen.getByRole("button", { name: /Announcement Board/ });
    expect(trigger).toHaveTextContent("Create or update the department-wide employee announcement.");
    expect(trigger).toHaveTextContent("Manage Announcement");
    expect(screen.queryByLabelText(/Announcement title/)).not.toBeInTheDocument();

    trigger.focus();
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Manage Announcement" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Announcement title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Announcement message/)).toBeInTheDocument();
    expect(screen.getByText(`0/${announcementTitleLimit}`)).toBeInTheDocument();
    expect(screen.getByText(`0/${announcementMessageLimit.toLocaleString()}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close announcement editor" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("uses the unified neutral Lead dashboard card treatment", () => {
    render(
      <DepartmentAnnouncementManagerCard
        departmentId="department-1"
        timezone="America/Los_Angeles"
        variant="dashboard"
      />
    );

    const trigger = screen.getByRole("button", { name: /Announcement Board/ });
    expect(trigger).toHaveClass("bg-white/95", "border-blue-900", "focus-visible:ring-2");
    expect(trigger).not.toHaveClass("bg-amber-50/90");
    expect(trigger).toHaveTextContent("Manage Announcement");
    expect(screen.getByTestId("lead-action-chevron")).toBeInTheDocument();
  });

  it("requires both fields before saving", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DepartmentAnnouncementEditor
        departmentId="department-1"
        timezone="America/Los_Angeles"
      />
    );

    await screen.findByRole("button", { name: "Save Announcement" });
    fireEvent.click(screen.getByRole("button", { name: "Save Announcement" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Announcement title and message are required."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
