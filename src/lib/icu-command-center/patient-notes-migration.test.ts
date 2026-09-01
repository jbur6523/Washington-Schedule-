// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260901201130_add_icu_patient_notes.sql"),
  "utf8"
).toLowerCase();

describe("ICU patient notes migration", () => {
  it("adds an optional notes column to the existing patient record", () => {
    expect(migration).toContain("alter table public.icu_patients");
    expect(migration).toContain("add column if not exists notes text");
    expect(migration).not.toContain("create table");
    expect(migration).not.toContain("not null");
  });
});
