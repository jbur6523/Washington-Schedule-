// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fetchOfficialVentCount } from "@/lib/shift-status/client-queries";
import type { OfficialVentCountUpdate } from "@/lib/shift-status/types";

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
