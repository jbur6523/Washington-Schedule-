// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260824211833_special_care_nursery_counts.sql"),
  "utf8"
);

describe("Special Care Nursery migration", () => {
  it("adds nullable, non-negative counts without manufacturing historical values", () => {
    expect(migration).toContain("add column neonatal_high_flow_count integer");
    expect(migration).toContain("add column bubble_cpap_count integer");
    expect(migration).toContain("neonatal_high_flow_count is null or neonatal_high_flow_count >= 0");
    expect(migration).toContain("bubble_cpap_count is null or bubble_cpap_count >= 0");
    expect(migration).not.toMatch(/update public\.shift_status_updates\s+set\s+(neonatal|bubble)/i);
  });

  it("persists both values through the authorized canonical save", () => {
    expect(migration).toContain("create or replace function public.save_shift_status_update(shift_payload jsonb)");
    expect(migration).toContain("else current_update.neonatal_high_flow_count");
    expect(migration).toContain("else current_update.bubble_cpap_count");
    expect(migration).toContain("public.user_is_department_lead(target_department_id)");
    expect(migration).toContain("public.user_is_command_center(target_department_id)");
    expect(migration).toContain("and update_row.is_canonical = true");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated, service_role");
  });
});
