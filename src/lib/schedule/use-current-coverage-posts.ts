"use client";

import { useEffect, useState } from "react";
import type { ShiftPost } from "@/data/mockSchedule";
import { timeZoneParts } from "@/lib/time/zoned-date-time";

function localDate(timezone: string) {
  const { year, month, day } = timeZoneParts(new Date(), timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function useCurrentCoveragePosts(posts: ShiftPost[], timezone: string) {
  const [today, setToday] = useState(() => localDate(timezone));

  useEffect(() => {
    const refresh = () => setToday(localDate(timezone));
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [timezone]);

  // Undated demo posts remain visible. Real posts carry the full coverage date,
  // so comparisons are independent of the display label and the browser timezone.
  return posts.filter(post => !post.shiftDate || post.shiftDate >= today);
}
