import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShiftPost } from "@/data/mockSchedule";
import { useCurrentCoveragePosts } from "./use-current-coverage-posts";

function post(shiftDate: string, type: ShiftPost["type"] = "Short Shift"): ShiftPost {
  return {
    id: `${shiftDate}-${type}`, shiftDate, day: "Friday", shiftTime: "18:30-07:00",
    postedBy: "Night Shift Team", staffType: "Full-time", type,
    coverageIntensity: "low", status: type, description: "Needs coverage", scope: "shift"
  };
}

describe("Cover/Switch date expiration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T06:59:59Z")); // Still September 18 in Los Angeles.
  });
  afterEach(() => vi.useRealTimers());

  it.each(["Short Shift", "Coverage Requested", "Switch Requested", "Wants Off"] as const)(
    "hides past %s posts, keeping today's and future dates in department time",
    type => {
      const posts = [post("2026-09-09", type), post("2026-09-18", type), post("2026-09-19", type)];
      const { result } = renderHook(() => useCurrentCoveragePosts(posts, "America/Los_Angeles"));
      expect(result.current).toEqual(posts.slice(1));
      expect(posts).toHaveLength(3); // Hiding does not delete history.
    }
  );

  it("removes yesterday's posts at midnight without a reload, including night shifts", () => {
    const posts = [post("2026-09-18"), post("2026-09-19")];
    const { result, unmount } = renderHook(() => useCurrentCoveragePosts(posts, "America/Los_Angeles"));
    expect(result.current).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toEqual([posts[1]]);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes when returning to a suspended tab across a year boundary", () => {
    vi.setSystemTime(new Date("2027-01-01T07:59:59Z"));
    const posts = [post("2026-12-31"), post("2027-01-01")];
    const { result } = renderHook(() => useCurrentCoveragePosts(posts, "America/Los_Angeles"));
    act(() => {
      vi.setSystemTime(new Date("2027-01-01T08:00:01Z"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toEqual([posts[1]]);
  });
});
