import "server-only";

import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import type { AppRole, AuthContextResult, OperationsRole } from "@/lib/auth/types";

type MembershipRow = {
  role: AppRole;
  department_id: string;
  departments: {
    id: string;
    name: string;
  } | null;
};

export async function getAuthenticatedUserContext(): Promise<AuthContextResult> {
  if (!hasSupabaseServerConfig()) {
    return { status: "unauthenticated" };
  }

  if (!hasSupabaseAdminConfig()) {
    return { status: "error", message: "Account verification is not configured." };
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return { status: "error", message: "Could not verify your account profile." };
  }

  if (!profile) {
    return { status: "unassigned" };
  }

  // Inactive users are intentionally invisible through normal RLS. Resolve
  // only the staff row linked to this already-verified Auth profile on the
  // server so deactivation can produce a clear inactive state while still
  // denying every application data query.
  const admin = createAdminClient();
  const { data: staffProfiles, error: staffProfileError } = await admin
    .from("staff_profiles")
    .select("id, department_id, profile_id, auth_user_id, operations_role, is_active")
    .eq("profile_id", profile.id)
    .limit(2);

  if (staffProfileError) {
    return { status: "error", displayName: profile.display_name, message: "Could not verify your staff access." };
  }

  if ((staffProfiles ?? []).length > 1) {
    return { status: "error", displayName: profile.display_name, message: "Multiple staff assignments require administrator review." };
  }

  const staffProfile = staffProfiles?.[0] ?? null;

  if (!staffProfile) {
    return { status: "unassigned", displayName: profile.display_name };
  }

  if (staffProfile.auth_user_id && staffProfile.auth_user_id !== user.id) {
    return { status: "error", displayName: profile.display_name, message: "Could not verify your staff access." };
  }

  if (!staffProfile.is_active) {
    return { status: "inactive", displayName: profile.display_name };
  }

  const { data: membership, error: membershipError } = await admin
    .from("department_memberships")
    .select("role, department_id, departments(id, name)")
    .eq("profile_id", profile.id)
    .eq("department_id", staffProfile.department_id)
    .maybeSingle<MembershipRow>();

  if (membershipError) {
    return { status: "error", displayName: profile.display_name, message: "Could not verify your department access." };
  }

  if (!membership?.departments) {
    return { status: "unassigned", displayName: profile.display_name };
  }

  const operationsRoleValues = new Set<OperationsRole>([
    "none",
    "aide",
    "command_center",
    "director",
    "icu_command_center"
  ]);
  const operationsRole = operationsRoleValues.has(staffProfile?.operations_role as OperationsRole)
    ? (staffProfile?.operations_role as OperationsRole)
    : "none";

  return {
    status: "authenticated",
    context: {
      authUserId: user.id,
      profileId: profile.id,
      staffProfileId: staffProfile.id,
      departmentId: membership.department_id,
      departmentName: membership.departments.name,
      role: membership.role,
      operationsRole: operationsRole as OperationsRole,
      displayName: profile.display_name,
      hasLinkedStaffProfile: true
    }
  };
}
