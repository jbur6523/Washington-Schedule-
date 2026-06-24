import "server-only";

import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import type { AppRole, AuthContextResult } from "@/lib/auth/types";

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

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return { status: "unassigned", displayName: user.email ?? undefined };
  }

  const { data: membership } = await supabase
    .from("department_memberships")
    .select("role, department_id, departments(id, name)")
    .eq("profile_id", profile.id)
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (!membership?.departments) {
    return { status: "unassigned", displayName: profile.display_name };
  }

  const { data: staffProfile } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("department_id", membership.department_id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  return {
    status: "authenticated",
    context: {
      authUserId: user.id,
      profileId: profile.id,
      staffProfileId: staffProfile?.id ?? null,
      departmentId: membership.department_id,
      departmentName: membership.departments.name,
      role: membership.role,
      displayName: profile.display_name,
      hasLinkedStaffProfile: Boolean(staffProfile?.id)
    }
  };
}
