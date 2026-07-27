"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchOfficialVentCount } from "@/lib/shift-status/client-queries";
import type { OfficialVentCountUpdate } from "@/lib/shift-status/types";
import { currentShiftStatusWindow, officialVentForWindow } from "@/lib/shift-status/utils";
import { createClient } from "@/lib/supabase/client";

export function useOfficialVentCount(departmentId: string, timezone = "America/Los_Angeles") {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const currentWindow = useMemo(
    () => currentShiftStatusWindow(timezone, new Date(nowTick)),
    [nowTick, timezone]
  );
  const [loadedUpdate, setLoadedUpdate] = useState<OfficialVentCountUpdate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const latestRequestId = useRef(0);

  const load = useCallback(
    async (showLoading = true) => {
      const requestId = latestRequestId.current + 1;
      latestRequestId.current = requestId;

      if (showLoading) {
        setLoading(true);
      }

      const supabase = createClient();
      const { data, error: loadError } = await fetchOfficialVentCount(
        supabase,
        departmentId,
        currentWindow.shiftDate,
        currentWindow.shiftType
      );

      if (requestId !== latestRequestId.current) {
        return;
      }

      setLoading(false);

      if (loadError) {
        console.error("Official vent count load failed", loadError);
        setLoadedUpdate(null);
        setError("Official vent count unavailable.");
        return;
      }

      setLoadedUpdate(data);
      setError("");
    },
    [currentWindow.shiftDate, currentWindow.shiftType, departmentId]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(true);
    }, 0);
    const interval = window.setInterval(() => {
      setNowTick(Date.now());
      void load(false);
    }, 60_000);
    const supabase = createClient();
    const channel = supabase
      .channel(`official-vent-count-${departmentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "official_vent_count_updates",
          filter: `department_id=eq.${departmentId}`
        },
        () => {
          void load(false);
        }
      )
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [departmentId, load]);

  return {
    update: officialVentForWindow(
      loadedUpdate,
      currentWindow.shiftDate,
      currentWindow.shiftType
    ),
    currentWindow,
    loading,
    error,
    reload: load
  };
}
