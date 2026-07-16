// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/202607150001_order_management_pmm_catalog.sql");
const migration = readFileSync(migrationPath, "utf8");
const repairMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202607150002_order_management_pmm_rpc_coalesce_repair.sql"
);
const repairMigration = readFileSync(repairMigrationPath, "utf8");
const orderClient = readFileSync(resolve(process.cwd(), "src/components/OrderManagementClient.tsx"), "utf8");
const rpcBody = migration.match(
  /create or replace function public\.create_department_order_with_lines[\s\S]+?revoke all on function public\.create_department_order_with_lines/
)?.[0] ?? "";
const repairRpcBody = repairMigration.match(
  /create or replace function public\.create_department_order_with_lines[\s\S]+?revoke all on function public\.create_department_order_with_lines/
)?.[0] ?? "";

describe("PMM migration contract", () => {
  it("contains one row for every resolved PMM and excludes unknown/review statuses", () => {
    const seedSection = migration.match(/insert into public\.pmm_catalog \([\s\S]+?on conflict \(pmm_number\)/)?.[0] ?? "";
    expect((seedSection.match(/^\s*\(/gm) ?? []).length).toBe(169);
    expect(migration).not.toMatch(/'unknown'|'review'/);
    expect(migration).toContain("('active', 'discontinued', 'do_not_use')");
  });

  it("locks down the SECURITY DEFINER RPC", () => {
    expect(rpcBody).toContain("security definer");
    expect(rpcBody).toContain("set search_path = pg_catalog");
    expect(rpcBody).toContain("auth.uid()");
    expect(rpcBody).toContain("public.user_is_department_member(p_department_id)");
    expect(rpcBody).toContain("public.user_is_department_aide(p_department_id)");
    expect(rpcBody).toContain("public.user_is_department_admin(p_department_id)");
    expect(migration).toContain(
      "revoke all on function public.create_department_order_with_lines(uuid, uuid, text, text, text, jsonb) from public"
    );
    expect(migration).toContain(
      "grant execute on function public.create_department_order_with_lines(uuid, uuid, text, text, text, jsonb) to authenticated"
    );
  });

  it("revalidates the catalog and creates the parent and snapshots in one RPC", () => {
    expect(rpcBody).toContain("from public.pmm_catalog catalog");
    expect(rpcBody).toContain("UNKNOWN_PMM");
    expect(rpcBody).toContain("PMM_NOT_ORDERABLE");
    expect(rpcBody).toContain("insert into public.department_orders");
    expect(rpcBody).toContain("insert into public.department_order_lines");
    expect(rpcBody).toContain("v_catalog_row.item_name");
  });

  it("uses the image/order UUID as a replay-safe idempotency key", () => {
    expect(rpcBody).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(rpcBody).toContain("where department_order.id = p_order_id");
    expect(rpcBody).toContain("ORDER_ID_REPLAY_MISMATCH");
    expect(rpcBody).toContain("return p_order_id");
  });

  it("preserves legacy direct insert permissions while requiring legacy content", () => {
    expect(migration).toContain('create policy "Aides and admins can create department orders"');
    expect(migration).toContain("public.user_is_department_aide(department_id)");
    expect(migration).toContain("public.user_is_department_admin(department_id)");
    expect(migration).toContain("coalesce(image_storage_path, image_url, '')");
    expect(migration).toContain("coalesce(req_number, '')");
  });

  it("uses the atomic RPC without changing explicit Req search or history page sizes", () => {
    expect(orderClient).toContain('supabase.rpc("create_department_order_with_lines"');
    expect(orderClient).not.toContain('.from("department_orders").insert');
    expect(orderClient).toContain("const recentOrderLimit = 7");
    expect(orderClient).toContain("const orderPageSize = 25");
    expect(orderClient).toContain('.ilike("req_number", `%${searchValue}%`)');
  });

  it("repairs invalid schema-qualified COALESCE calls without weakening the RPC", () => {
    expect(repairMigration).toContain("create or replace function public.create_department_order_with_lines");
    expect(repairMigration).toContain("security definer");
    expect(repairMigration).toContain("set search_path = pg_catalog");
    expect(repairMigration).toContain("v_lines jsonb := coalesce(p_lines, '[]'::jsonb)");
    expect(repairMigration).toContain("select coalesce(");
    expect(repairRpcBody).not.toContain("pg_catalog.coalesce");
    expect(repairMigration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(repairMigration).toContain("ORDER_ID_REPLAY_MISMATCH");
    expect(repairMigration).toContain("insert into public.department_orders");
    expect(repairMigration).toContain("insert into public.department_order_lines");
    expect(repairMigration).toContain(
      "revoke all on function public.create_department_order_with_lines(uuid, uuid, text, text, text, jsonb) from public"
    );
    expect(repairMigration).toContain(
      "grant execute on function public.create_department_order_with_lines(uuid, uuid, text, text, text, jsonb) to authenticated"
    );
  });
});
