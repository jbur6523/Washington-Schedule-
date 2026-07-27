// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { OfficialVentCountUpdate } from "@/lib/shift-status/types";
import {
  officialVentForWindow,
  officialVentSourceLabel
} from "@/lib/shift-status/utils";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202607270001_official_vent_count_updates.sql"
  ),
  "utf8"
);
const directorClient = readFileSync(
  resolve(process.cwd(), "src/components/DirectorShiftStatusClient.tsx"),
  "utf8"
);
const directorIcuView = readFileSync(
  resolve(process.cwd(), "src/components/IcuReadOnlyViews.tsx"),
  "utf8"
);
const scheduleSummary = readFileSync(
  resolve(process.cwd(), "src/components/CurrentShiftStatusSummary.tsx"),
  "utf8"
);

function officialVent(
  overrides: Partial<OfficialVentCountUpdate> = {}
): OfficialVentCountUpdate {
  return {
    id: 1,
    department_id: "department-1",
    shift_date: "2026-07-27",
    shift_type: "day",
    vent_count: 7,
    source: "lead_command_center",
    updated_by_staff_profile_id: "staff-1",
    updated_by_name: "Lead RT",
    created_at: "2026-07-27T16:00:00.000Z",
    ...overrides
  };
}

describe("official vent count", () => {
  it("does not allow another operational shift's value to render", () => {
    const update = officialVent();

    expect(officialVentForWindow(update, "2026-07-27", "day")).toBe(update);
    expect(officialVentForWindow(update, "2026-07-27", "night")).toBeNull();
    expect(officialVentForWindow(update, "2026-07-28", "day")).toBeNull();
  });

  it("labels the actual latest source", () => {
    expect(officialVentSourceLabel("lead_command_center")).toBe(
      "Lead Command Center"
    );
    expect(officialVentSourceLabel("icu_command_center")).toBe(
      "ICU Command Center"
    );
  });

  it("stores an append-only shift-scoped value ordered by a server timestamp", () => {
    expect(migration).toContain(
      "create table if not exists public.official_vent_count_updates"
    );
    expect(migration).toContain("shift_date date not null");
    expect(migration).toContain(
      "shift_type public.shift_status_shift_type not null"
    );
    expect(migration).toContain(
      "created_at timestamptz not null default clock_timestamp()"
    );
    expect(migration).not.toMatch(
      /update\s+public\.official_vent_count_updates/i
    );
    expect(migration).toContain(
      "revoke insert, update, delete, truncate, references, trigger"
    );
  });

  it("publishes Lead updates only when the saved vent field genuinely changes", () => {
    const leadTrigger = migration.match(
      /create or replace function public\.publish_lead_official_vent_count\(\)[\s\S]+?create trigger shift_status_updates_publish_official_vent/
    )?.[0] ?? "";

    expect(leadTrigger).toContain(
      "previous_vent_count is distinct from new.vent_count"
    );
    expect(leadTrigger).toContain("prior.shift_date = new.shift_date");
    expect(leadTrigger).toContain("prior.shift_type = new.shift_type");
    expect(leadTrigger).not.toContain("new.updated_at");
    expect(leadTrigger).not.toContain("new.bipap_count");
    expect(migration).toContain("after insert on public.shift_status_updates");
  });

  it("publishes ICU updates only when active Vent membership changes and recounts persisted rows", () => {
    const icuTrigger = migration.match(
      /create or replace function public\.publish_icu_official_vent_count\(\)[\s\S]+?create trigger icu_patients_publish_official_vent/
    )?.[0] ?? "";
    const icuPublisher = migration.match(
      /create or replace function public\.insert_icu_official_vent_count\([\s\S]+?revoke all on function public\.insert_icu_official_vent_count/
    )?.[0] ?? "";

    expect(icuTrigger).toContain(
      "old.is_active and old.device_type = 'vent'"
    );
    expect(icuTrigger).toContain(
      "new.is_active and new.device_type = 'vent'"
    );
    expect(icuTrigger).toContain(
      "old_is_tracked_vent is distinct from new_is_tracked_vent"
    );
    expect(icuTrigger).not.toContain("is_critical_vent");
    expect(icuPublisher).toContain("from public.icu_patients patient");
    expect(icuPublisher).toContain("patient.is_active = true");
    expect(icuPublisher).toContain("patient.device_type = 'vent'");
  });

  it("uses one official state value for both Director vent cards and the Schedule", () => {
    expect(directorClient).toContain(
      "useOfficialVentCount(authContext.departmentId, timezone)"
    );
    expect(directorClient).toContain("officialVent={officialVent}");
    expect(directorClient).not.toContain("resolveEffectiveVentCount");
    expect(directorIcuView).toContain(
      '<SnapshotCard label="Vents" value={officialVent?.vent_count ?? "—"} />'
    );
    expect(scheduleSummary).toContain(
      'label="VENTS" value={officialVent?.vent_count ?? "—"}'
    );
    expect(scheduleSummary).not.toContain(
      "get_current_icu_snapshot_counts"
    );
  });
});
