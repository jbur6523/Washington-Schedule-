// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fetchRvuStaffingMetricRows } from "@/lib/metrics/queries";

describe("fetchRvuStaffingMetricRows", () => {
  it("loads only the minimal department-scoped metrics payload with date and shift filters", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const query = {
      select(...args: unknown[]) {
        calls.push({ method: "select", args });
        return query;
      },
      eq(...args: unknown[]) {
        calls.push({ method: "eq", args });
        return query;
      },
      gte(...args: unknown[]) {
        calls.push({ method: "gte", args });
        return query;
      },
      lte(...args: unknown[]) {
        calls.push({ method: "lte", args });
        return query;
      },
      order(...args: unknown[]) {
        calls.push({ method: "order", args });
        return query;
      },
      async range(...args: unknown[]) {
        calls.push({ method: "range", args });
        return { data: [], error: null };
      }
    };
    const client = {
      from(table: string) {
        calls.push({ method: "from", args: [table] });
        return query;
      }
    } as unknown as SupabaseClient;

    await fetchRvuStaffingMetricRows(client, "department-1", {
      minimumShiftDate: "2026-07-16",
      maximumShiftDate: "2026-08-14",
      shift: "night"
    });

    expect(calls).toContainEqual({ method: "from", args: ["shift_status_updates"] });
    expect(calls).toContainEqual({ method: "eq", args: ["department_id", "department-1"] });
    expect(calls).toContainEqual({ method: "gte", args: ["shift_date", "2026-07-16"] });
    expect(calls).toContainEqual({ method: "lte", args: ["shift_date", "2026-08-14"] });
    expect(calls).toContainEqual({ method: "eq", args: ["shift_type", "night"] });
    expect(calls).toContainEqual({ method: "range", args: [0, 999] });

    const selectedColumns = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(selectedColumns).toContain("rvu_total");
    expect(selectedColumns).toContain("rts_on");
    expect(selectedColumns).not.toContain("updated_by");
    expect(selectedColumns).not.toContain("note");
    expect(selectedColumns).not.toContain("patient");
  });
});
