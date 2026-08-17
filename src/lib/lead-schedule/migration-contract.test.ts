// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608150003_lead_schedule_employee_directory.sql"),
  "utf8"
);
const route = readFileSync(
  resolve(process.cwd(), "src/app/command-center/schedule/page.tsx"),
  "utf8"
);
const foundationMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202606230001_backend_foundation.sql"),
  "utf8"
);
const removalMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608150004_remove_ruth_deguzman_from_lead_directory.sql"),
  "utf8"
);
const directoryCorrectionMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817112607_correct_lead_schedule_directory_staff.sql"),
  "utf8"
);

describe("Lead Schedule employee directory migration contract", () => {
  it("extends the canonical staff model and keeps directory PII behind authenticated staff RLS", () => {
    expect(migration).toContain("alter table public.staff_profiles");
    expect(migration).toContain("add column if not exists hire_date date");
    expect(migration).toContain("add column if not exists directory_shift public.staff_directory_shift");
    expect(migration).toContain("add column if not exists name_aliases text[]");
    expect(migration).not.toMatch(/create table if not exists public\.employee_directory/i);
    expect(migration).toContain("alter table public.staff_directory_seed_conflicts enable row level security");
    expect(migration).toContain("revoke all on table public.staff_directory_seed_conflicts from public, anon, authenticated");
    expect(foundationMigration).toMatch(/create policy "Department members can read staff profiles"[\s\S]*?to authenticated/);
    expect(foundationMigration).not.toMatch(/create policy "Department members can read staff profiles"[\s\S]*?to anon/);
  });

  it("seeds supplied RTs idempotently while preserving non-null conflicts", () => {
    expect(migration).toContain("on conflict (department_id, display_name) do nothing");
    expect(migration).toContain("coalesce(profile.phone_number, resolution.phone_number)");
    expect(migration).toContain("staff_directory_seed_conflicts");
    expect(migration).toContain("'Rudy', 'Teodosio', '1994-08-08', '510-453-1868'");
    expect(migration).toContain("'Renae', 'Waldschmidt', '2017-12-19'");
    expect(migration.match(/\('Renae', 'Waldschmidt'/g)).toHaveLength(1);
    expect(migration).toContain("resolution.first_name = 'Renae' and resolution.last_name = 'Waldschmidt'");
    expect(migration).not.toMatch(/\('RT', 'Aide'|\('Payroll'|\('Department', 'Director'/i);
  });

  it("removes Ruth Deguzman from the Lead directory without deleting her canonical profile", () => {
    expect(removalMigration).toContain("update public.staff_profiles");
    expect(removalMigration).toContain("set directory_shift = null");
    expect(removalMigration).toContain("lower(trim(first_name)) = 'ruth'");
    expect(removalMigration).toContain("lower(trim(last_name)) = 'deguzman'");
    expect(removalMigration).not.toMatch(/delete\s+from/i);
  });

  it("corrects Stephanie Ortiz and reclassifies Harjot Kaur and Tom Macasaet without replacing profiles", () => {
    expect(directoryCorrectionMigration).toContain("display_name = 'Stephanie Ortiz'");
    expect(directoryCorrectionMigration).toContain("first_name = 'Stephanie'");
    expect(directoryCorrectionMigration).toContain("array['Stefanie Ortiz']");
    expect(directoryCorrectionMigration).toContain("lower(pg_catalog.btrim(profile.first_name)) = 'harjot'");
    expect(directoryCorrectionMigration).toContain("lower(pg_catalog.btrim(profile.last_name)) = 'kaur'");
    expect(directoryCorrectionMigration).toContain("lower(pg_catalog.btrim(profile.first_name)) = 'tom'");
    expect(directoryCorrectionMigration).toContain("lower(pg_catalog.btrim(profile.last_name)) = 'macasaet'");
    expect(directoryCorrectionMigration.match(/set employment_type = 'full_time'/g)).toHaveLength(2);
    expect(directoryCorrectionMigration).not.toMatch(/delete\s+from|insert\s+into\s+public\.staff_profiles/i);
    expect(directoryCorrectionMigration).not.toMatch(/username\s*=|auth_user_id\s*=/i);
  });

  it("resolves required aliases without fuzzy matching or duplicate canonical employees", () => {
    expect(migration).toContain("'Pawanjit Khera', 'Pawanjit Khera (Kinty)'");
    expect(migration).toContain("'Yiqin Meng', 'Yiqin Meng (Maggie)'");
    expect(migration).toContain("'Beth Ricker', 'Elizabeth Ricker (Beth)'");
    expect(migration).toContain("'Marshall Roberts', 'John Roberts (Marshall)'");
    expect(migration).toContain("'Pete Van Dal', 'Peter Van Dal (Pete)'");
    expect(migration).toContain("'Joy Kaur', 'Harjot Kaur (Joy)'");
    expect(migration).toContain("'Aby Perenia', 'Jemin Perenia (Aby)'");
    expect(migration).toContain("'Peter Vandal', 'Pete Vandal'");
    expect(migration).toContain("array['Victoria Mohseni']");
    expect(migration).toContain("array['Stephanie Ortiz']");
    expect(migration).not.toMatch(/levenshtein|similarity|fuzzy/i);
  });

  it("protects the route with the existing Lead Command Board authorization", () => {
    expect(route).toContain("canManageShiftStatus(auth.context)");
    expect(route).toContain('redirect("/login")');
    expect(route).toContain("notFound()");
    expect(route).toContain('.from("schedule_entries")');
    expect(route).toContain('.from("user_schedule_overrides")');
    expect(route).toContain('.from("staff_profiles")');
  });
});
