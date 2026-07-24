import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canManageShiftStatus } from "@/lib/auth/access";
import type { AppRole, OperationsRole } from "@/lib/auth/types";

function access(role: AppRole, operationsRole: OperationsRole) {
  return canManageShiftStatus({ role, operationsRole });
}

describe("phone-list access contract", () => {
  it("uses the exact Lead Command Board roles", () => {
    expect(access("admin", "none")).toBe(true);
    expect(access("lead", "none")).toBe(true);
    expect(access("staff", "command_center")).toBe(true);

    expect(access("staff", "none")).toBe(false);
    expect(access("staff", "aide")).toBe(false);
    expect(access("staff", "director")).toBe(false);
    expect(access("staff", "icu_command_center")).toBe(false);
  });

  it("keeps the route on the shared Lead Command Board guard", () => {
    const routePath = resolve(process.cwd(), "src/app/command-center/phone-list/page.tsx");
    const route = readFileSync(routePath, "utf8");

    expect(route).toContain("canManageShiftStatus(auth.context)");
    expect(route).toContain('redirect("/login")');
  });

  it("limits database reads and saves to the same three access predicates", () => {
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/202607240001_lead_command_phone_list.sql"
    );
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("public.user_is_department_admin");
    expect(migration).toContain("public.user_is_department_lead");
    expect(migration).toContain("public.user_is_command_center");
    expect(migration).not.toContain("public.user_is_department_director");
    expect(migration).not.toContain("public.user_is_icu_command_center");
    expect(migration).toContain(
      "revoke all on function public.save_phone_list_draft(uuid, date, text, jsonb) from public"
    );
  });

  it("keeps draft saves atomic and server-validated", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/202607240001_lead_command_phone_list.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain("auth.uid() is null");
    expect(migration).toContain("public.user_is_department_member(p_department_id)");
    expect(migration).toContain("left join public.staff_profiles staff");
    expect(migration).toContain("delete from public.phone_list_assignments");
    expect(migration).toContain("insert into public.phone_list_assignments");
    expect(migration).not.toContain("grant insert");
    expect(migration).not.toContain("grant update");
    expect(migration).not.toContain("grant delete");
  });
});
