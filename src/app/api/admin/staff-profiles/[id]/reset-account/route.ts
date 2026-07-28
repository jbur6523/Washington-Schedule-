import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ message: "Account reset is not available." }, { status: 503 });
  }

  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated" || auth.context.role !== "admin") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  const { id } = await context.params;
  const supabase = createAdminClient();
  const { data: staffProfile, error: readError } = await supabase
    .from("staff_profiles")
    .select("id, department_id, profile_id, auth_user_id")
    .eq("id", id)
    .eq("department_id", auth.context.departmentId)
    .maybeSingle();

  if (readError || !staffProfile) {
    return NextResponse.json({ message: "Unable to reset account." }, { status: 404 });
  }

  if (staffProfile.id === auth.context.staffProfileId || staffProfile.profile_id === auth.context.profileId) {
    return NextResponse.json({ message: "You cannot reset your own administrator account." }, { status: 400 });
  }

  if (staffProfile.auth_user_id) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(staffProfile.auth_user_id);
    if (deleteError) {
      return NextResponse.json({ message: "Unable to reset account." }, { status: 400 });
    }
  }

  const { error: resetError } = await supabase.rpc("reset_staff_account_link", {
    target_staff_profile_id: staffProfile.id,
    requested_actor_profile_id: auth.context.profileId
  });

  if (resetError) {
    return NextResponse.json({ message: "Unable to finish resetting the account." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
