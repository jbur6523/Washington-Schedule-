// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";
import type { AppRole, AuthenticatedUserContext, OperationsRole } from "@/lib/auth/types";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserContext: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  deleteRow: vi.fn(),
  eq: vi.fn()
}));

vi.mock("@/lib/auth/current-user", () => ({
  getAuthenticatedUserContext: mocks.getAuthenticatedUserContext
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from })
}));

function authenticatedContext(role: AppRole, operationsRole: OperationsRole = "none") {
  const context: AuthenticatedUserContext = {
    authUserId: "auth-1",
    profileId: "profile-1",
    staffProfileId: "staff-1",
    departmentId: "department-1",
    departmentName: "Respiratory Care",
    role,
    operationsRole,
    displayName: "Authorized User",
    hasLinkedStaffProfile: true
  };

  return { status: "authenticated" as const, context };
}

describe("department announcement API", () => {
  beforeEach(() => {
    const builder = {
      upsert: mocks.upsert,
      select: mocks.select,
      single: mocks.single,
      delete: mocks.deleteRow,
      eq: mocks.eq
    };
    mocks.getAuthenticatedUserContext.mockReset();
    mocks.from.mockReset().mockReturnValue(builder);
    mocks.upsert.mockReset().mockReturnValue(builder);
    mocks.select.mockReset().mockReturnValue(builder);
    mocks.single.mockReset().mockResolvedValue({
      data: {
        id: "announcement-1",
        department_id: "department-1",
        title: "Title",
        message: "Message",
        updated_by_staff_profile_id: "staff-1",
        updated_by_name: "Authorized User",
        created_at: "2026-08-05T15:00:00.000Z",
        updated_at: "2026-08-05T15:00:00.000Z"
      },
      error: null
    });
    mocks.deleteRow.mockReset().mockReturnValue(builder);
    mocks.eq.mockReset().mockResolvedValue({ error: null });
  });

  it.each([
    ["lead", "none"],
    ["staff", "command_center"],
    ["staff", "director"],
    ["admin", "none"]
  ] as const)("allows %s/%s users to create or replace the canonical record", async (role, operationsRole) => {
    mocks.getAuthenticatedUserContext.mockResolvedValue(authenticatedContext(role, operationsRole));

    const response = await POST(
      new Request("http://localhost/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: " Title ", message: " Message " })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        department_id: "department-1",
        title: "Title",
        message: "Message"
      },
      { onConflict: "department_id" }
    );
  });

  it("prevents regular employees from mutating announcements", async () => {
    mocks.getAuthenticatedUserContext.mockResolvedValue(authenticatedContext("staff"));

    const response = await POST(
      new Request("http://localhost/api/announcements", {
        method: "POST",
        body: JSON.stringify({ title: "Title", message: "Message" })
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("requires a valid title and message", async () => {
    mocks.getAuthenticatedUserContext.mockResolvedValue(authenticatedContext("lead"));

    const response = await POST(
      new Request("http://localhost/api/announcements", {
        method: "POST",
        body: JSON.stringify({ title: "", message: "Message" })
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    ["lead", "none"],
    ["staff", "director"]
  ] as const)("allows %s/%s users to clear only their department announcement", async (role, operationsRole) => {
    mocks.getAuthenticatedUserContext.mockResolvedValue(authenticatedContext(role, operationsRole));

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith("department_announcements");
    expect(mocks.eq).toHaveBeenCalledWith("department_id", "department-1");
  });
});
