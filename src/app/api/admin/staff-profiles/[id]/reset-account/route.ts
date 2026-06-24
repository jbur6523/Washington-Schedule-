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
    .select("id, department_id, auth_user_id")
    .eq("id", id)
    .eq("department_id", auth.context.departmentId)
    .maybeSingle();

  if (readError || !staffProfile) {
    return NextResponse.json({ message: "Unable to reset account." }, { status: 404 });
  }

  if (staffProfile.auth_user_id) {
    await supabase.auth.admin.deleteUser(staffProfile.auth_user_id);
  }

  const { error: updateError } = await supabase
    .from("staff_profiles")
    .update({
      profile_id: null,
      auth_user_id: null,
      account_claimed_at: null,
      password_reset_required: true
    })
    .eq("id", id)
    .eq("department_id", auth.context.departmentId);

  if (updateError) {
    return NextResponse.json({ message: "Unable to reset account." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
