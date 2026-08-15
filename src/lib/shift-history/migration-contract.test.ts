// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/202608150001_shift_history_roster_snapshots.sql"),
  "utf8"
);
const historyPage = fs.readFileSync(path.join(process.cwd(), "src/app/command-center/history/page.tsx"), "utf8");

describe("Shift History migration contract", () => {
  it("preserves legacy rows while enforcing one canonical reporting date and shift", () => {
    expect(migration).toContain("add column if not exists is_canonical boolean");
    expect(migration).toContain("where is_canonical = true");
    expect(migration).toContain("shift_status_updates_one_canonical_window_idx");
    expect(migration).not.toMatch(/delete from public\.shift_status_updates/i);
  });

  it("captures one atomic stable roster snapshot per reporting date and shift", () => {
    expect(migration).toContain("phone_list_roster_snapshots_window_unique");
    expect(migration).toContain("staff_display_name text not null");
    expect(migration).toContain("area_labels text[] not null");
    expect(migration).toContain("delete from public.phone_list_roster_entries");
    expect(migration).toContain("public.save_phone_list_draft");
  });

  it("protects bounded clinical-time History retrieval on the server", () => {
    expect(migration).toContain("create or replace function public.list_shift_history");
    expect(migration).toContain("time '06:30'");
    expect(migration).toContain("time '18:30'");
    expect(migration).toContain("limit least(greatest(p_limit, 1), 50)");
    expect(historyPage).toContain("canManageShiftStatus(auth.context)");
    expect(historyPage).toContain("supabase.rpc(\"list_shift_history\"");
  });
});
