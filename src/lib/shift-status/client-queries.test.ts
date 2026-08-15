// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  fetchDirectorShiftStatusUpdates,
  fetchOfficialVentCount,
  fetchReportingWindowShiftStatusUpdates
} from "@/lib/shift-status/client-queries";
import { reportingWindowForInstant } from "@/lib/shift-status/reporting-window";
import type { OfficialVentCountUpdate, ShiftStatusUpdate } from "@/lib/shift-status/types";

type QueryCall = {
  column: string;
  value?: unknown;
  ascending?: boolean;
};

function officialVent(
  overrides: Partial<OfficialVentCountUpdate> = {}
): OfficialVentCountUpdate {
  return {
    id: 1,
    department_id: "department-1",
    shift_date: "2026-08-06",
    shift_type: "night",
    vent_count: 5,
    source: "lead_command_center",
    updated_by_staff_profile_id: null,
    updated_by_name: "Lead RT",
    created_at: "2026-08-07T02:00:00.000Z",
    ...overrides
  };
}

function fakeSupabase(rows: OfficialVentCountUpdate[]) {
  const filters: QueryCall[] = [];
  const orders: QueryCall[] = [];
  let requestedLimit: number | null = null;
  let selectedColumns = "";
  let selectedTable = "";

  const query = {
    select(columns: string) {
      selectedColumns = columns;
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, value });
      return query;
    },
    order(column: string, options: { ascending: boolean }) {
      orders.push({ column, ascending: options.ascending });
      return query;
    },
    limit(value: number) {
      requestedLimit = value;
      return query;
    },
    async maybeSingle() {
      const matching = rows.filter((row) =>
        filters.every(({ column, value }) =>
          (row as unknown as Record<string, unknown>)[column] === value
        )
      );
      const sorted = [...matching].sort((left, right) => {
        const timestampDifference =
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime();

        return timestampDifference || right.id - left.id;
      });

      return { data: sorted[0] ?? null, error: null };
    }
  };

  const client = {
    from(table: string) {
      selectedTable = table;
      return query;
    }
  } as unknown as SupabaseClient;

  return {
    client,
    calls: {
      filters,
      orders,
      get limit() {
        return requestedLimit;
      },
      get columns() {
        return selectedColumns;
      },
      get table() {
        return selectedTable;
      }
    }
  };
}

describe("fetchOfficialVentCount", () => {
  it.each([
    [
      "newer Lead",
      officialVent({ id: 2, vent_count: 8, source: "lead_command_center", created_at: "2026-08-08T16:00:00.000Z" }),
      officialVent({ id: 1, vent_count: 6, source: "icu_command_center", created_at: "2026-08-07T16:00:00.000Z" })
    ],
    [
      "newer ICU",
      officialVent({ id: 3, vent_count: 4, source: "icu_command_center", created_at: "2026-08-09T16:00:00.000Z" }),
      officialVent({ id: 2, vent_count: 8, source: "lead_command_center", created_at: "2026-08-08T16:00:00.000Z" })
    ]
  ])("returns the %s update across dates and shifts", async (_label, newer, older) => {
    const { client, calls } = fakeSupabase([older, newer]);

    const result = await fetchOfficialVentCount(client, "department-1");

    expect(result).toEqual({ data: newer, error: null });
    expect(calls.table).toBe("official_vent_count_updates");
    expect(calls.filters).toEqual([
      { column: "department_id", value: "department-1" }
    ]);
    expect(calls.orders).toEqual([
      { column: "created_at", ascending: false },
      { column: "id", ascending: false }
    ]);
    expect(calls.limit).toBe(1);
    expect(calls.columns).not.toContain("updated_at");
  });

  it("preserves zero and returns null only when no Vent event has ever been recorded", async () => {
    const zero = officialVent({ vent_count: 0 });
    const withZero = await fetchOfficialVentCount(
      fakeSupabase([zero]).client,
      "department-1"
    );
    const empty = await fetchOfficialVentCount(
      fakeSupabase([]).client,
      "department-1"
    );

    expect(withZero.data?.vent_count).toBe(0);
    expect(empty.data).toBeNull();
  });
});

function shiftStatus(overrides: Partial<ShiftStatusUpdate> = {}): ShiftStatusUpdate {
  return {
    id: "status-1",
    department_id: "department-1",
    shift_date: "2026-08-08",
    shift_type: "night",
    rts_on: 8,
    rts_required: 8,
    rvu_total: null,
    vent_count: 5,
    bipap_count: 2,
    c_section_count: 0,
    vaginal_delivery_count: 0,
    cabg_count: 0,
    bronch_count: 0,
    sputum_induction_count: 0,
    other_procedure_count: 0,
    other_procedure_note: null,
    shift_note: null,
    updated_by_staff_profile_id: "lead-1",
    updated_by_name: "Lead RT",
    created_at: "2026-08-09T03:00:00.000Z",
    updated_at: "2026-08-09T03:00:00.000Z",
    ...overrides
  };
}

function fakeDirectorSupabase(rows: ShiftStatusUpdate[]) {
  const filters: QueryCall[] = [];
  const ranges: Array<{ from: number; to: number }> = [];
  const orders: QueryCall[] = [];
  let selectedTable = "";

  const query = {
    select() {
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, value });
      return query;
    },
    lte(column: string, value: unknown) {
      filters.push({ column, value });
      return query;
    },
    order(column: string, options: { ascending: boolean }) {
      orders.push({ column, ascending: options.ascending });
      return query;
    },
    async range(from: number, to: number) {
      ranges.push({ from, to });
      const maximumShiftDate = filters.find(({ column }) => column === "shift_date")?.value as string;
      const matching = rows
        .filter((row) => row.department_id === "department-1" && row.shift_date <= maximumShiftDate)
        .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
        .slice(from, to + 1);

      return { data: matching, error: null };
    }
  };

  return {
    client: {
      from(table: string) {
        selectedTable = table;
        return query;
      }
    } as unknown as SupabaseClient,
    calls: {
      filters,
      orders,
      ranges,
      get table() {
        return selectedTable;
      }
    }
  };
}

describe("fetchDirectorShiftStatusUpdates", () => {
  it("loads all eligible history through a Director-only, future-bounded query", async () => {
    const prior = shiftStatus();
    const current = shiftStatus({
      id: "status-2",
      shift_date: "2026-08-09",
      shift_type: "day",
      updated_at: "2026-08-09T16:00:00.000Z"
    });
    const future = shiftStatus({
      id: "status-3",
      shift_date: "2026-08-10",
      shift_type: "day",
      updated_at: "2026-08-10T16:00:00.000Z"
    });
    const { client, calls } = fakeDirectorSupabase([prior, current, future]);

    const result = await fetchDirectorShiftStatusUpdates(client, "department-1", "2026-08-09");

    expect(result).toEqual({
      data: [current, prior],
      error: null,
      usedLegacyProcedureSelect: false
    });
    expect(calls.table).toBe("shift_status_updates");
    expect(calls.filters).toEqual([
      { column: "department_id", value: "department-1" },
      { column: "shift_date", value: "2026-08-09" }
    ]);
    expect(calls.orders).toEqual([
      { column: "updated_at", ascending: false },
      { column: "created_at", ascending: false },
      { column: "id", ascending: false }
    ]);
    expect(calls.ranges).toEqual([{ from: 0, to: 999 }]);
  });
});

describe("fetchReportingWindowShiftStatusUpdates", () => {
  it("bounds the query by the active window's created_at timestamps", async () => {
    const filters: QueryCall[] = [];
    const orders: QueryCall[] = [];
    const current = shiftStatus({ created_at: "2026-08-09T13:00:00.000Z" });
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, value });
        return query;
      },
      gte(column: string, value: unknown) {
        filters.push({ column, value });
        return query;
      },
      lt(column: string, value: unknown) {
        filters.push({ column, value });
        return query;
      },
      order(column: string, options: { ascending: boolean }) {
        orders.push({ column, ascending: options.ascending });
        return query;
      },
      async limit() {
        return { data: [current], error: null };
      }
    };
    const client = { from: () => query } as unknown as SupabaseClient;
    const window = reportingWindowForInstant(new Date("2026-08-09T16:00:00.000Z"));

    const result = await fetchReportingWindowShiftStatusUpdates(client, "department-1", window);

    expect(result.data).toEqual([current]);
    expect(filters).toEqual([
      { column: "department_id", value: "department-1" },
      { column: "created_at", value: window.startsAt },
      { column: "created_at", value: window.endsAt }
    ]);
    expect(orders).toEqual([
      { column: "created_at", ascending: false },
      { column: "id", ascending: false }
    ]);
  });
});
