type PayrollGrant = {
  role: "timekeeper" | "manager" | "identity_admin";
  temporary_manager_access?: boolean;
};

// The server checks the trial configuration before exposing this permission.
export function payrollReviewRole(
  grant: PayrollGrant | null,
  demoView?: unknown,
) {
  if (!grant) return null;
  if (
    grant.role === "identity_admin" &&
    grant.temporary_manager_access === true
  )
    return demoView === "timekeeper" ? "timekeeper" : "manager";
  if (grant.role === "manager") return "manager";
  return grant.role === "timekeeper" ? "timekeeper" : null;
}
