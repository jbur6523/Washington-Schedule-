// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608140001_shift_status_notes.sql"),
  "utf8"
);
const clientQueries = readFileSync(
  resolve(process.cwd(), "src/lib/shift-status/client-queries.ts"),
  "utf8"
);
const shiftUpdate = readFileSync(
  resolve(process.cwd(), "src/components/ShiftUpdateClient.tsx"),
  "utf8"
);

describe("shift status note migration", () => {
  it("adds only a nullable, length-limited operational note column", () => {
    expect(migration).toContain("add column if not exists shift_note text");
    expect(migration).toContain("shift_note is null or char_length(shift_note) <= 500");
    expect(migration).not.toMatch(/shift_note\s+text\s+not\s+null/i);
    expect(migration).not.toMatch(/drop\s+(table|column)/i);
    expect(migration).not.toContain("other_procedure_note =");
  });

  it("reads and writes the dedicated note without repurposing procedure text", () => {
    expect(clientQueries).toContain('"shift_note"');
    expect(shiftUpdate).toContain("shift_note: form.shiftNote.trim() || null");
    expect(shiftUpdate).toContain("shiftNote: update?.shift_note ?? \"\"");
    expect(shiftUpdate).toContain("other_procedure_note: form.otherProcedureNote.trim() || null");
  });
});
