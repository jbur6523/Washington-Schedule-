// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608140003_rvu_staffing_metrics.sql"),
  "utf8"
);

describe("RVU staffing migration contract", () => {
  it("adds an exact nullable RVU field without backfilling or deleting history", () => {
    const additiveSchemaSection = migration.slice(
      0,
      migration.indexOf("create or replace function public.save_shift_status_update")
    );

    expect(migration).toContain("add column if not exists rvu_total numeric");
    expect(migration).not.toMatch(/rvu_total\s+numeric[^;]*not\s+null/i);
    expect(additiveSchemaSection).not.toMatch(/update\s+public\.shift_status_updates/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.shift_status_updates/i);
    expect(migration).not.toMatch(/drop\s+(table|column)/i);
  });

  it("derives the existing RT need field on the server with divisor 27 and normal rounding", () => {
    expect(migration).toContain("new.rts_required := pg_catalog.round(new.rvu_total / 27, 1)");
    expect(migration).not.toMatch(/ceil(?:ing)?\s*\(/i);
    expect(migration).toContain("before insert or update on public.shift_status_updates");
  });

  it("uses an atomic same-window canonical save that preserves omitted fields", () => {
    expect(migration).toContain("create or replace function public.save_shift_status_update(shift_payload jsonb)");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("else current_update.rvu_total");
    expect(migration).toContain("else current_update.rts_on");
    expect(migration).toContain("where update_row.id = current_update.id");
    expect(migration).toContain("if found then");
    expect(migration).not.toMatch(/pg_catalog\.(coalesce|nullif)/i);
  });

  it("enforces the shared 04:00 and 16:00 Pacific reporting boundaries", () => {
    expect(migration).toContain("America/Los_Angeles");
    expect(migration).toContain("local_now::time < time '04:00'");
    expect(migration).toContain("local_now::time >= time '04:00' and local_now::time < time '16:00'");
  });
});
