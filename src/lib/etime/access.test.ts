import { describe, expect, it } from "vitest";
import { payrollReviewRole } from "./access";

describe("explicit trial payroll permissions", () => {
  it("does not grant ordinary identity admins payroll access", () => {
    expect(payrollReviewRole(null)).toBeNull();
    expect(payrollReviewRole({ role: "identity_admin" })).toBeNull();
    expect(
      payrollReviewRole({
        role: "identity_admin",
        temporary_manager_access: false,
      }),
    ).toBeNull();
  });
  it("grants the opted-in identity admin manager capabilities without changing their base role", () => {
    const grant = {
      role: "identity_admin" as const,
      temporary_manager_access: true,
    };
    expect(payrollReviewRole(grant)).toBe("manager");
    expect(grant.role).toBe("identity_admin");
  });
  it("keeps timekeepers restricted even if a malformed grant carries the temporary flag", () => {
    expect(
      payrollReviewRole({ role: "timekeeper", temporary_manager_access: true }),
    ).toBe("timekeeper");
    expect(payrollReviewRole({ role: "manager" })).toBe("manager");
  });
});
