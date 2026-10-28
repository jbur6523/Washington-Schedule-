import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ScheduleSnapshot } from "./load-active-schedule";
import { useActiveSchedule } from "./use-active-schedule";

const mocks = vi.hoisted(() => ({
  load: vi.fn(), removeChannel: vi.fn(),
  changes: new Map<string, () => void>()
}));
vi.mock("./load-active-schedule", () => ({ loadScheduleSnapshot: mocks.load }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
  channel: () => {
    const channel = {
      on: (_event: string, filter: { table: string }, callback: () => void) => {
        mocks.changes.set(filter.table, callback);
        return channel;
      },
      subscribe: () => channel
    };
    return channel;
  },
  removeChannel: mocks.removeChannel
}) }));

const authContext: AuthenticatedUserContext = {
  authUserId: "user", profileId: "profile", staffProfileId: "staff", departmentId: "department",
  departmentName: "Test", role: "staff", operationsRole: "none", displayName: "Test", hasLinkedStaffProfile: true
};
const snapshot: ScheduleSnapshot = { activeSchedule: null, timezone: "America/Los_Angeles", error: "" };
function deferred() {
  let resolve!: (value: ScheduleSnapshot) => void;
  const promise = new Promise<ScheduleSnapshot>(done => { resolve = done; });
  return { promise, resolve };
}
const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("schedule refresh lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.load.mockReset().mockResolvedValue(snapshot);
    mocks.removeChannel.mockReset().mockResolvedValue(undefined);
    mocks.changes.clear();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });
  afterEach(() => { vi.useRealTimers(); });

  it("loads on mount and coalesces focus/visibility events into one refresh", async () => {
    const { result } = renderHook(() => useActiveSchedule({ authContext, includeHistory: false }));
    expect(result.current.state.loading).toBe(true);
    await tick();
    expect(result.current.state.loading).toBe(false);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await tick(250);
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it("skips polling and realtime reads while hidden, then refreshes on return", async () => {
    renderHook(() => useActiveSchedule({ authContext, includeHistory: false }));
    await tick();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => mocks.changes.get("schedule_entries")!());
    await tick(180_000);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick(250);
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it("does not queue redundant focus/poll refreshes while a load is in flight", async () => {
    const first = deferred();
    mocks.load.mockReturnValueOnce(first.promise);
    renderHook(() => useActiveSchedule({ authContext, includeHistory: false }));
    await tick();
    act(() => window.dispatchEvent(new Event("focus")));
    await tick(60_250);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve(snapshot));
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("queues a trailing reload for edits and awaits it before resolving onChanged", async () => {
    const first = deferred();
    const second = deferred();
    mocks.load.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useActiveSchedule({ authContext, includeHistory: false }));
    await tick();
    let completed = false;
    let refreshed!: Promise<void>;
    act(() => { refreshed = result.current.refresh().then(() => { completed = true; }); });
    await act(async () => first.resolve(snapshot));
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(completed).toBe(false);
    await act(async () => { second.resolve(snapshot); await refreshed; });
    expect(completed).toBe(true);
  });

  it("does not lose a realtime change when a focus event follows during a load", async () => {
    const first = deferred();
    mocks.load.mockReturnValueOnce(first.promise);
    renderHook(() => useActiveSchedule({ authContext, includeHistory: false }));
    await tick();
    act(() => {
      mocks.changes.get("user_schedule_overrides")!();
      window.dispatchEvent(new Event("focus"));
    });
    await tick(250);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve(snapshot));
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it("cancels a recent load when history is opened and ignores its late response", async () => {
    const recent = deferred();
    const history = deferred();
    mocks.load.mockReturnValueOnce(recent.promise).mockReturnValueOnce(history.promise);
    const { result, rerender } = renderHook(({ includeHistory }) => useActiveSchedule({ authContext, includeHistory }), { initialProps: { includeHistory: false } });
    await tick();
    const signal = mocks.load.mock.calls[0][0].signal as AbortSignal;
    rerender({ includeHistory: true });
    expect(signal.aborted).toBe(true);
    expect(result.current.state.loading).toBe(true);
    await tick();
    expect(mocks.load.mock.calls[1][0].includeHistory).toBe(true);
    await act(async () => history.resolve({ ...snapshot, timezone: "UTC" }));
    await act(async () => recent.resolve(snapshot));
    expect(result.current.state.timezone).toBe("UTC");
    expect(result.current.state.loading).toBe(false);
  });

  it("does not reuse data across accounts", async () => {
    const { result, rerender } = renderHook(({ user }) => useActiveSchedule({ authContext: { ...authContext, authUserId: user }, includeHistory: false }), { initialProps: { user: "one" } });
    await tick();
    rerender({ user: "two" });
    expect(result.current.state.loading).toBe(true);
    await tick();
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it("handles rejected requests, permits retry, and releases timers on unmount", async () => {
    mocks.load.mockRejectedValueOnce(new Error("Network unavailable"));
    const { result, unmount } = renderHook(() => useActiveSchedule({ authContext, includeHistory: false }));
    await tick();
    expect(result.current.state.loading).toBe(false);
    expect(result.current.state.error).toContain("try again");
    await act(async () => { await result.current.refresh(); });
    expect(result.current.state.error).toBe("");
    const signal = mocks.load.mock.calls[1][0].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
  });
});
