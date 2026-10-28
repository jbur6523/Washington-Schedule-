"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";
import { loadScheduleSnapshot, type ScheduleSnapshot } from "./load-active-schedule";

const emptySnapshot: ScheduleSnapshot = {
  activeSchedule: null, timezone: "America/Los_Angeles", error: ""
};
let subscriptionId = 0;

export function useActiveSchedule({ authContext, includeHistory, developmentFallback = false }: {
  authContext: AuthenticatedUserContext;
  includeHistory: boolean;
  developmentFallback?: boolean;
}) {
  const { authUserId, departmentId, staffProfileId } = authContext;
  const scope = JSON.stringify([authUserId, departmentId, staffProfileId, includeHistory, developmentFallback]);
  const [loaded, setLoaded] = useState<{ scope: string; snapshot: ScheduleSnapshot } | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (developmentFallback) return;

    const supabase = createClient();
    const controller = new AbortController();
    let disposed = false;
    let pending = false;
    let inFlight: Promise<void> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let changedWhileWaiting = false;

    // One request at a time. Changes during a request queue a trailing refresh,
    // so an edit cannot be lost behind a response that started before the edit.
    const run = (): Promise<void> => {
      if (disposed) return Promise.resolve();
      pending = true;
      if (inFlight) return inFlight;
      inFlight = (async () => {
        while (pending && !disposed) {
          pending = false;
          let snapshot: ScheduleSnapshot;
          try {
            snapshot = await loadScheduleSnapshot({
              supabase, departmentId, staffProfileId, includeHistory, signal: controller.signal
            });
          } catch {
            snapshot = { ...emptySnapshot, error: "Schedule could not be loaded. Please try again." };
          }
          if (!disposed) setLoaded({ scope, snapshot });
        }
      })().finally(() => { inFlight = null; });
      return inFlight;
    };
    refreshRef.current = run;

    // Focus and visibility events often arrive together. Do not queue another
    // read just because a timer/focus event fired while data was already loading.
    const scheduleRefresh = (changed: boolean) => {
      if (document.visibilityState === "hidden") return;
      changedWhileWaiting ||= changed;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        const needsRefresh = changedWhileWaiting || !inFlight;
        changedWhileWaiting = false;
        if (document.visibilityState !== "hidden" && needsRefresh) void run();
      }, 250);
    };
    const refreshOnReturn = () => scheduleRefresh(false);
    const refreshOnChange = () => scheduleRefresh(true);
    const initialTimer = setTimeout(() => { void run(); }, 0);
    const interval = setInterval(refreshOnReturn, 60_000);
    // Removal is asynchronous; a new scope must not reuse a closing channel.
    let channel = supabase.channel(`schedule-coordination-${departmentId}-${++subscriptionId}`);
    for (const table of [
      "departments", "schedule_versions", "schedule_entries", "shift_shortages",
      "user_schedule_overrides", "shift_requests", "shift_request_offers", "coworker_titles", "staff_profiles"
    ]) {
      channel = channel.on("postgres_changes", {
        event: "*", schema: "public", table,
        filter: `${table === "departments" ? "id" : "department_id"}=eq.${departmentId}`
      }, refreshOnChange);
    }
    channel.subscribe();
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);

    return () => {
      disposed = true;
      controller.abort();
      refreshRef.current = async () => {};
      clearTimeout(initialTimer);
      clearTimeout(refreshTimer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
      void supabase.removeChannel(channel);
    };
  }, [departmentId, staffProfileId, includeHistory, developmentFallback, scope]);

  // Never display a recent-only response as complete history, or reuse another
  // account's data while the effect for the new scope is starting.
  const snapshot = loaded?.scope === scope ? loaded.snapshot : emptySnapshot;
  return {
    state: { ...snapshot, loading: !developmentFallback && loaded?.scope !== scope },
    refresh
  };
}
