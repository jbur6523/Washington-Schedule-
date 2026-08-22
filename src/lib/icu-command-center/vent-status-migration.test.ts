// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260822195335_vent_card_status_tracking.sql"),
  "utf8"
).toLowerCase();

describe("Vent status tracking migration", () => {
  it("adds only the three missing persistent statuses and preserves the existing Critical field", () => {
    expect(migration).toContain("add column if not exists is_sbt boolean not null default false");
    expect(migration).toContain("add column if not exists is_flolan boolean not null default false");
    expect(migration).toContain("add column if not exists is_prone boolean not null default false");
    expect(migration).not.toContain("add column if not exists is_critical_vent");
  });

  it("atomically updates statuses with their exact audit wording under existing RLS", () => {
    expect(migration).toContain("create or replace function public.set_icu_vent_status");
    expect(migration).toContain("security invoker");
    for (const wording of [
      "sbt marked active",
      "sbt status cleared",
      "critical status marked",
      "critical status cleared",
      "flolan marked active",
      "flolan status cleared",
      "prone status marked",
      "prone status cleared"
    ]) {
      expect(migration).toContain(wording);
    }
    expect(migration).toContain("grant execute on function public.set_icu_vent_status");
  });

  it("retains one permanent CT/MRI row per Vent and 07:00/19:00 Pacific shift", () => {
    expect(migration).toContain("icu_patient_events_one_shift_note_idx");
    expect(migration).toContain("where event_type in ('ct_noted', 'mri_noted')");
    expect(migration).toContain("at time zone 'america/los_angeles'");
    expect(migration).toContain("time '07:00'");
    expect(migration).toContain("time '19:00'");
    expect(migration).toContain("on conflict (");
    expect(migration).toContain("event_summary_value := upper(target_event) || ' noted this shift'");
    expect(migration).not.toContain("delete from public.icu_patient_events");
  });
});
