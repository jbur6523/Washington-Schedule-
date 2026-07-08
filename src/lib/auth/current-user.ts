import "server-only";

import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import type { AppRole, AuthContextResult, OperationsRole } from "@/lib/auth/types";

type MembershipRow = {
  role: AppRole;
  department_id: string;
  departments: {
    id: string;
    name: string;
  } | null;
};

function authContextError(message: string, error: unknown): AuthContextResult {
  console.error(message, error);
  return {
    status: "error",
    message: "Could not verify access. Please refresh or try again."
  };
}

export async function getAuthenticatedUserContext(): Promise<AuthContextResult> {
  if (!hasSupabaseServerConfig()) {
    return { status: "unauthenticated" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    return authContextError("Supabase user verification failed", userError);
  }

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return authContextError("Profile lookup failed during auth context resolution", profileError);
  }

  if (!profile) {
    return { status: "unassigned", displayName: user.email ?? undefined };
  }

  const privilegedLookupClient = hasSupabaseAdminConfig() ? createAdminClient() : supabase;
  const { data: membership, error: membershipError } = await privilegedLookupClient
    .from("department_memberships")
    .select("role, department_id, departments(id, name)")
    .eq("profile_id", profile.id)
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (membershipError) {
    return authContextError("Department membership lookup failed during auth context resolution", membershipError);
  }

  if (!membership?.departments) {
    return { status: "unassigned", displayName: profile.display_name };
  }

  const { data: staffProfile, error: staffProfileError } = await privilegedLookupClient
    .from("staff_profiles")
    .select("id, operations_role, is_active")
    .eq("department_id", membership.department_id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (staffProfileError) {
    return authContextError("Staff profile lookup failed during auth context resolution", staffProfileError);
  }

  if (!staffProfile) {
    return { status: "unassigned", displayName: profile.display_name };
  }

  if (!staffProfile.is_active) {
    return { status: "inactive", displayName: profile.display_name };
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
