// @vitest-environment node

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fetchScheduleEntries, loadScheduleSnapshot, recentScheduleStart } from "./load-active-schedule";
import type { ScheduleEntryRow } from "./supabase-schedule";

function entry(id: string, date: string, extra: Partial<ScheduleEntryRow> = {}): ScheduleEntryRow {
  return {
    id, schedule_version_id: "version", department_id: "department", staff_profile_id: "staff",
    shift_date: date, day_of_week: "Wednesday", shift_type: "day_shift",
    shift_start: "06:30", shift_end: "19:00", entry_status: "scheduled", is_shift_lead: false,
    staff_profiles: { id: "staff", display_name: "Test Staff", employment_type: "full_time", home_assignment: "day_shift" },
    ...extra
  };
}

// Exercise the real Supabase query builder against a synthetic HTTP response.
// No credentials or network access are needed.
function database(entries: ScheduleEntryRow[]) {
  const tables: Record<string, Record<string, unknown>[]> = {
    departments: [{ id: "department", active_schedule_version_id: "version", timezone: "America/Los_Angeles" }],
    schedule_versions: [{ id: "version", status: "published", department_id: "department" }],
    schedule_entries: entries,
    user_schedule_overrides: [], shift_shortages: [], shift_requests: [], shift_request_offers: [], coworker_titles: []
  };
  const calls: URL[] = [];
  const failures = new Set<string>();
  const supabase = createClient("https://schedule.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const url = new URL(String(input));
      calls.push(url);
      const table = url.pathname.split("/").at(-1)!;
      if (failures.has(table)) return new Response(JSON.stringify({ message: "Access denied" }), { status: 403 });
      let rows = [...(tables[table] ?? [])];
      url.searchParams.forEach((filter, key) => {
        if (filter.startsWith("eq.")) rows = rows.filter(row => String(row[key]) === filter.slice(3));
        if (filter.startsWith("gte.")) rows = rows.filter(row => String(row[key]) >= filter.slice(4));
        if (filter.startsWith("in.(")) rows = rows.filter(row => filter.slice(4, -1).split(",").includes(String(row[key])));
      });
      const orders = (url.searchParams.get("order") ?? "").split(",");
      rows.sort((a, b) => {
        for (const order of orders) {
          const [key, direction] = order.split(".");
          const comparison = String(a[key]).localeCompare(String(b[key]));
          if (comparison) return direction === "desc" ? -comparison : comparison;
        }
        return 0;
      });
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? rows.length);
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { status: 200, headers: { "Content-Type": "application/json" } });
    } }
  });
  const load = (includeHistory = false) => loadScheduleSnapshot({
    supabase, departmentId: "department", staffProfileId: "staff", includeHistory,
    signal: new AbortController().signal, now: new Date("2026-10-28T08:00:00Z")
  });
  return { supabase, tables, calls, failures, load };
}

describe("schedule date window", () => {
  it.each([
    ["2026-10-28T06:59:59Z", "2026-10-26"],
    ["2026-10-28T07:00:00Z", "2026-10-27"],
    ["2026-11-02T08:30:00Z", "2026-11-01"],
    ["2026-03-09T07:30:00Z", "2026-03-08"],
    ["2027-01-01T08:01:00Z", "2026-12-31"]
  ])("includes the prior local calendar date at %s", (instant, expected) => {
    expect(recentScheduleStart("America/Los_Angeles", new Date(instant))).toBe(expected);
  });

  it("loads recent shifts in one page, keeping yesterday's overnight shift and future entries", async () => {
    const old = Array.from({ length: 1200 }, (_, i) => entry(`old-${i}`, "2026-06-24"));
    const recent = [entry("overnight", "2026-10-27", { shift_type: "night_shift", shift_start: "18:30", shift_end: "07:00" }), entry("today", "2026-10-28"), entry("future", "2026-11-01")];
    const db = database([...old, ...recent, entry("other-version", "2026-10-28", { schedule_version_id: "other" })]);
    const result = await db.load();
    expect(result.error).toBe("");
    expect(result.activeSchedule?.entries.map(row => row.id)).toEqual(recent.map(row => row.id));
    const reads = db.calls.filter(url => url.pathname.endsWith("/schedule_entries"));
    expect(reads).toHaveLength(1);
    expect(reads[0].searchParams.get("shift_date")).toBe("gte.2026-10-27");
    expect(reads[0].searchParams.get("order")).toBe("shift_date.asc,shift_start.asc,id.asc");
  });

  it("fetches every history page without truncating at 500 or 1,000 rows", async () => {
    const db = database(Array.from({ length: 1203 }, (_, i) => entry(`entry-${i}`, "2026-06-24")));
    const result = await db.load(true);
    expect(result.activeSchedule?.entries).toHaveLength(1203);
    const reads = db.calls.filter(url => url.pathname.endsWith("/schedule_entries"));
    expect(reads.map(url => url.searchParams.get("offset"))).toEqual(["0", "500", "1000"]);
    expect(reads.every(url => !url.searchParams.has("shift_date"))).toBe(true);
  });

  it("keeps only the final published day when all schedule dates have expired", async () => {
    const db = database([entry("old", "2026-06-24"), entry("last-day", "2026-10-10"), entry("last-night", "2026-10-10", { shift_start: "18:30" })]);
    const result = await db.load();
    expect(result.activeSchedule?.entries.map(row => row.id)).toEqual(["last-day", "last-night"]);
    expect(db.calls.filter(url => url.pathname.endsWith("/schedule_entries"))).toHaveLength(3);
  });

  it("supports empty versions and no published version", async () => {
    const db = database([]);
    expect((await db.load()).activeSchedule?.days).toEqual([]);
    db.tables.departments[0].active_schedule_version_id = null;
    db.calls.length = 0;
    expect((await db.load()).activeSchedule).toBeNull();
    expect(db.calls).toHaveLength(1);
  });

  it("applies removals, self-added shifts and lead hours after filtering", async () => {
    const db = database([entry("remove", "2026-10-28"), entry("lead", "2026-10-28", { is_shift_lead: true })]);
    const common = { department_id: "department", staff_profile_id: "staff", shift_date: "2026-10-28", shift_type: "day_shift", shift_start: "06:30", shift_end: "19:00", is_active: true, staff_profiles: entry("x", "2026-10-28").staff_profiles };
    db.tables.user_schedule_overrides = [
      { ...common, id: "removal", override_type: "remove_self", base_schedule_entry_id: "remove" },
      { ...common, id: "addition", override_type: "add_self", base_schedule_entry_id: null }
    ];
    const result = await db.load();
    expect(result.activeSchedule?.effectiveEntries.map(row => row.id)).toEqual(["lead", "override-addition"]);
    expect(result.activeSchedule?.effectiveEntries[0].shift_start).toBe("05:30");
  });

  it("clears the snapshot on permission errors and does not fall back to history", async () => {
    const db = database([entry("today", "2026-10-28")]);
    db.failures.add("schedule_entries");
    const result = await db.load();
    expect(result.activeSchedule).toBeNull();
    expect(result.error).not.toBe("");
    expect(db.calls.filter(url => url.pathname.endsWith("/schedule_entries"))).toHaveLength(1);
  });

  it("does not paginate a cancelled query", async () => {
    const db = database([entry("today", "2026-10-28")]);
    const controller = new AbortController();
    controller.abort();
    const result = await fetchScheduleEntries(db.supabase, "version", "2026-10-27", controller.signal);
    expect(result.error).not.toBeNull();
    expect(db.calls).toHaveLength(0);
  });
});
