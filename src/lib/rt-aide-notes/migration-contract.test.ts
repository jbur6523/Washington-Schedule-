import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608090001_aide_communication_threads.sql",
  ),
  "utf8",
);

describe("aide communication thread migration", () => {
  it("adds conversation direction and a durable reply table", () => {
    expect(migration).toContain(
      "add column if not exists conversation_direction",
    );
    expect(migration).toContain(
      "create table if not exists public.rt_aide_note_replies",
    );
    expect(migration).toContain(
      "references public.rt_aide_notes(id) on delete cascade",
    );
  });

  it("backfills existing responses and keeps parent status metadata synchronized", () => {
    expect(migration).toContain("from public.rt_aide_notes note");
    expect(migration).toContain("note.response_text");
    expect(migration).toContain(
      "create or replace function public.sync_rt_aide_note_reply()",
    );
    expect(migration).toContain("status = 'responded'");
    expect(migration).toContain(
      "acknowledged_at = coalesce(acknowledged_at, new.created_at)",
    );
  });

  it("allows active department participants to read and create replies", () => {
    expect(migration).toContain(
      'create policy "RT communication participants can read replies"',
    );
    expect(migration).toContain(
      'create policy "RT communication participants can create replies"',
    );
    expect(migration).toContain(
      "public.user_is_department_aide(note.department_id)",
    );
    expect(migration).toContain(
      "public.user_is_department_lead(note.department_id)",
    );
    expect(migration).toContain("note.status <> 'closed'");
  });
});
