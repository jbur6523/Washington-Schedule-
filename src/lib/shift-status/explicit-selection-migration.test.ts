// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260824191923_explicit_shift_update_selection.sql"),
  "utf8"
);

describe("explicit Shift Update selection migration", () => {
  it("removes automatic reporting-window enforcement from the Shift Update save", () => {
    expect(migration).toContain("create or replace function public.save_shift_status_update(shift_payload jsonb)");
    expect(migration).not.toContain("public.shift_status_record_options()");
    expect(migration).not.toContain("public.current_shift_reporting_window()");
    expect(migration).not.toContain("Selected shift record is no longer editable");
  });

  it("retains authorization and one canonical record per explicitly selected shift", () => {
    expect(migration).toContain("public.user_is_department_lead(target_department_id)");
    expect(migration).toContain("public.user_is_command_center(target_department_id)");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("and update_row.is_canonical = true");
    expect(migration).toContain("where update_row.id = current_update.id");
    expect(migration).toContain("is_canonical,");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated, service_role");
  });
});
