type PayrollGrant = {
  role: "timekeeper" | "manager" | "identity_admin";
  temporary_manager_access?: boolean;
};

// The server checks the trial configuration before exposing this permission.
export function payrollReviewRole(grant: PayrollGrant | null) {
  if (!grant) return null;
  if (
    grant.role === "manager" ||
    (grant.role === "identity_admin" && grant.temporary_manager_access === true)
  )
    return "manager";
  return grant.role === "timekeeper" ? "timekeeper" : null;
}
