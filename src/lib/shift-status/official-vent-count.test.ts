// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { officialVentSourceLabel } from "@/lib/shift-status/utils";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202607270001_official_vent_count_updates.sql"
  ),
  "utf8"
);
const hardeningMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202607270002_production_readiness_hardening.sql"
  ),
  "utf8"
);
const persistenceMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608070001_persistent_icu_snapshot_vent_precedence.sql"
  ),
  "utf8"
);
const clientQueries = readFileSync(
  resolve(process.cwd(), "src/lib/shift-status/client-queries.ts"),
  "utf8"
);
const officialVentHook = readFileSync(
  resolve(process.cwd(), "src/lib/shift-status/use-official-vent-count.ts"),
  "utf8"
);
const directorClient = readFileSync(
  resolve(process.cwd(), "src/components/DirectorShiftStatusClient.tsx"),
  "utf8"
);
const directorIcuView = readFileSync(
  resolve(process.cwd(), "src/components/DirectorDashboardIcuSummary.tsx"),
  "utf8"
);
const icuCommandCenter = readFileSync(
  resolve(process.cwd(), "src/components/IcuCommandCenterClient.tsx"),
  "utf8"
);
const scheduleSummary = readFileSync(
  resolve(process.cwd(), "src/components/CurrentShiftStatusSummary.tsx"),
  "utf8"
);

describe("official vent count", () => {
  it("keeps shift metadata as audit context instead of a current-value boundary", () => {
    expect(clientQueries).toContain('.eq("department_id", departmentId)');
    expect(clientQueries).not.toContain('.eq("shift_date", shiftDate)');
    expect(clientQueries).not.toContain('.eq("shift_type", shiftType)');
    expect(clientQueries).toContain('.order("created_at", { ascending: false })');
    expect(officialVentHook).toContain("update: loadedUpdate");
    expect(officialVentHook).not.toContain("currentShiftStatusWindow");
    expect(officialVentHook).not.toContain("officialVentForWindow");
  });

  it("labels the actual latest source", () => {
    expect(officialVentSourceLabel("lead_command_center")).toBe(
      "Lead Command Center"
    );
    expect(officialVentSourceLabel("icu_command_center")).toBe(
      "ICU Command Center"
    );
  });

  it("stores append-only field updates with a server timestamp and audit metadata", () => {
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
    const leadPublisher = persistenceMigration.match(
      /create or replace function public\.publish_lead_official_vent_count\(\)[\s\S]+?revoke all on function public\.publish_lead_official_vent_count/
    )?.[0] ?? "";

    expect(persistenceMigration).toContain(
      "alter column vent_count drop default"
    );
    expect(persistenceMigration).toContain(
      "alter column vent_count drop not null"
    );
    expect(leadPublisher).toContain("if new.vent_count is null then");
    expect(leadPublisher).toContain(
      "previous_vent_count is distinct from new.vent_count"
    );
    expect(leadPublisher).toContain(
      "from public.official_vent_count_updates update_row"
    );
    expect(leadPublisher).toContain(
      "update_row.source = 'lead_command_center'"
    );
    expect(leadPublisher).not.toContain(
      "update_row.shift_date = new.shift_date"
    );
    expect(leadPublisher).not.toContain(
      "update_row.shift_type = new.shift_type"
    );
    expect(leadPublisher).not.toContain("from public.shift_status_updates");
    expect(leadPublisher).not.toContain("new.updated_at");
    expect(leadPublisher).not.toContain("new.bipap_count");
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

  it("assigns post-midnight ICU updates to the night shift's prior operational date", () => {
    const hardenedPublisher = hardeningMigration.match(
      /create or replace function public\.insert_icu_official_vent_count\([\s\S]+?revoke all on function public\.insert_icu_official_vent_count/
    )?.[0] ?? "";

    expect(hardenedPublisher).toContain(
      "when local_now::time < time '08:00' then local_now::date - 1"
    );
    expect(hardenedPublisher).toContain(
      "else 'night'::public.shift_status_shift_type"
    );
    expect(hardenedPublisher).not.toContain("local_now::date,\n    current_shift");
  });

  it("uses one official state value for both Director vent cards and the Schedule", () => {
    expect(directorClient).toContain(
      "useOfficialVentCount(authContext.departmentId)"
    );
    expect(directorClient).toContain("officialVent={officialVent}");
    expect(directorClient).toContain(
      'from "@/components/DirectorDashboardIcuSummary"'
    );
    expect(directorClient).not.toContain(
      'from "@/components/IcuReadOnlyViews"'
    );
    expect(directorClient).not.toContain("resolveEffectiveVentCount");
    expect(directorIcuView).toContain(
      "officialVentCount: officialVent?.vent_count ?? null"
    );
    expect(directorIcuView).not.toContain("value={rawIcuCounts.vents}");
    expect(scheduleSummary).toContain(
      'label="VENTS" value={officialVent?.vent_count ?? "—"}'
    );
    expect(scheduleSummary).not.toContain(
      "get_current_icu_snapshot_counts"
    );
    expect(icuCommandCenter).toContain(
      '<StatCard label="Vents" value={counts.vents} />'
    );
  });

  it("uses a neutral first-ever empty state everywhere the shared count is shown", () => {
    expect(directorClient).toContain("No vent count recorded yet.");
    expect(directorIcuView).toContain("No vent count recorded yet.");
    expect(`${directorClient}\n${directorIcuView}`).not.toContain(
      "No official vent update for this shift."
    );
  });
});
