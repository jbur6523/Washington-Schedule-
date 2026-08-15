// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchShiftRosterSnapshot } from "@/lib/shift-history/client-queries";

describe("fetchShiftRosterSnapshot", () => {
  it("loads exactly one ordered roster for the selected department and clinical shift", async () => {
    const filters: Array<[string, unknown]> = [];
    const orders: Array<[string, unknown]> = [];
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      order(column: string, options: unknown) {
        orders.push([column, options]);
        return query;
      },
      async maybeSingle() {
        return {
          data: {
            id: "roster-1",
            shift_date: "2026-08-09",
            shift_type: "day",
            captured_at: "2026-08-09T16:00:00.000Z",
            captured_by_name: "Lead RT",
            phone_list_roster_entries: [{
              id: "entry-1",
              display_order: 1,
              staff_display_name: "Jonathan Burdick",
              area_labels: ["4W", "5W"]
            }]
          },
          error: null
        };
      }
    };
    const client = {
      from(table: string) {
        expect(table).toBe("phone_list_roster_snapshots");
        return query;
      }
    } as unknown as SupabaseClient;

    const result = await fetchShiftRosterSnapshot(client, "department-1", "2026-08-09", "day");

    expect(filters).toEqual([
      ["department_id", "department-1"],
      ["shift_date", "2026-08-09"],
      ["shift_type", "day"]
    ]);
    expect(orders).toEqual([["display_order", { referencedTable: "phone_list_roster_entries", ascending: true }]]);
    expect(result.data?.phone_list_roster_entries[0]?.staff_display_name).toBe("Jonathan Burdick");
  });
});
