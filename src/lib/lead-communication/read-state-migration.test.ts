import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202608140002_lead_communication_read_state.sql"
);
const commandCenterReplyMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202608150005_lead_communication_command_center_replies.sql"
);
const commandCenterReadStateMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202608150006_lead_communication_command_center_read_state.sql"
);

describe("Lead Communication read-state migration", () => {
  it("keeps leadership replies independent from shared read state", () => {
    const migration = fs.readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace function public.reply_to_lead_communication_note");
    expect(migration).toContain("follow_up_text = reply_text");
    expect(migration).toContain("and note.status <> 'closed'");
    expect(migration).not.toContain("status = 'reviewed'");
    expect(migration).not.toContain("reviewed_at =");
    expect(migration).not.toContain("reviewed_by_staff_profile_id =");
    expect(migration).not.toContain("reviewed_by_name =");
  });

  it("does not add or alter Lead Communication table columns", () => {
    const migration = fs.readFileSync(migrationPath, "utf8").toLowerCase();

    expect(migration).not.toContain("alter table");
    expect(migration).not.toContain("create table");
    expect(migration).not.toContain("drop table");
  });

  it("allows narrow command-center replies without changing shared read state", () => {
    const migration = fs.readFileSync(commandCenterReplyMigrationPath, "utf8");

    expect(migration).toContain("create or replace function public.reply_to_lead_communication_note");
    expect(migration).toContain("staff.operations_role in ('leadership', 'command_center')");
    expect(migration).toContain("follow_up_text = reply_text");
    expect(migration).not.toContain("created_by_staff_profile_id");
    expect(migration).not.toContain("status = 'reviewed'");
    expect(migration).not.toContain("create table");
    expect(migration).not.toContain("alter table");
  });

  it("adds an explicit shared command-center read toggle without per-user state", () => {
    const migration = fs.readFileSync(commandCenterReadStateMigrationPath, "utf8");

    expect(migration).toContain("set_command_center_lead_communication_read_state");
    expect(migration).toContain("staff.operations_role = 'command_center'");
    expect(migration).toContain("status = case when mark_read then 'reviewed' else 'new' end");
    expect(migration).not.toContain("create table");
    expect(migration).not.toContain("alter table");
    expect(migration).not.toContain("lead_communication_note_reads");
  });
});
