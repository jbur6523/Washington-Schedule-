import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { canManageShiftStatus, canCreateLeadCommunication, canReplyToLeadCommunication, hasOperationsDashboardAccess, hasRentalManagementAccess } from "@/lib/auth/access";

const mocks = vi.hoisted(() => ({ active: true, role: "lead" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseServerConfig: () => true,
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "anthony-auth" } } }) },
    from: () => {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "anthony-profile", display_name: "Anthony Alix" }, error: null }) };
      return query;
    }
  })
}));
vi.mock("@/lib/supabase/admin", () => ({
  hasSupabaseAdminConfig: () => true,
  createAdminClient: () => ({ from: () => {
    const query = {
      select: () => query, eq: () => query,
      limit: async () => ({ data: [{ id: "anthony-staff", username: "alia", profile_id: "anthony-profile", auth_user_id: "anthony-auth", department_id: "department-1", operations_role: "none", is_active: mocks.active }], error: null }),
      maybeSingle: async () => ({ data: { role: mocks.role, department_id: "department-1", departments: { id: "department-1", name: "Respiratory Care" } }, error: null })
    };
    return query;
  } })
}));

describe("Anthony's canonical authenticated Lead access", () => {
  beforeEach(() => { mocks.active = true; mocks.role = "lead"; });
  it("resolves the synchronized membership and grants normal Lead access", async () => {
    const result = await getAuthenticatedUserContext();
    expect(result.status).toBe("authenticated");
    if (result.status !== "authenticated") throw new Error("Expected authenticated Anthony");
    expect(result.context).toMatchObject({ role: "lead", operationsRole: "none", displayName: "Anthony Alix", staffProfileId: "anthony-staff" });
    for (const permission of [canManageShiftStatus, canCreateLeadCommunication, canReplyToLeadCommunication, hasOperationsDashboardAccess, hasRentalManagementAccess]) expect(permission(result.context)).toBe(true);
  });
  it("rejects an inactive Anthony even with Lead membership", async () => {
    mocks.active = false;
    expect(await getAuthenticatedUserContext()).toEqual({ status: "inactive", displayName: "Anthony Alix" });
  });
  it("does not grant Lead access from Anthony's name or username", async () => {
    mocks.role = "staff";
    const result = await getAuthenticatedUserContext();
    if (result.status !== "authenticated") throw new Error("Expected authenticated staff");
    expect(canManageShiftStatus(result.context)).toBe(false);
  });
});
