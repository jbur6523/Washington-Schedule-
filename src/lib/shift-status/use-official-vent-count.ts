"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOfficialVentCount } from "@/lib/shift-status/client-queries";
import type { OfficialVentCountUpdate } from "@/lib/shift-status/types";
import { createClient } from "@/lib/supabase/client";

export function useOfficialVentCount(departmentId: string) {
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
      const { data, error: loadError } = await fetchOfficialVentCount(supabase, departmentId);

      if (requestId !== latestRequestId.current) {
        return;
      }

      setLoading(false);

      if (loadError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Official vent count load failed", loadError);
        }
        setLoadedUpdate(null);
        setError("Official vent count unavailable.");
        return;
      }

      setLoadedUpdate(data);
      setError("");
    },
    [departmentId]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(true);
    }, 0);
    const interval = window.setInterval(() => {
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
    update: loadedUpdate,
    loading,
    error,
    reload: load
  };
}
