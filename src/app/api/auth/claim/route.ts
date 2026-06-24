import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { authEmailForUsername, normalizeUsername } from "@/lib/auth/username";
import type { AppRole } from "@/lib/auth/types";

type ClaimRequest = {
  username?: string;
  password?: string;
  confirmPassword?: string;
};

function roleForClaim(username: string, assignedRole: AppRole | null): AppRole {
  if (username === "burj") {
    return "admin";
  }

  return assignedRole === "lead" ? "lead" : "staff";
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ message: "Account setup is not available." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as ClaimRequest;
  const username = normalizeUsername(body.username ?? "");
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";

  if (!username || password.length < 8 || password !== confirmPassword) {
    return NextResponse.json({ message: "Unable to create account." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: staffProfile, error: staffError } = await supabase
    .from("staff_profiles")
    .select("id, department_id, display_name, username, username_normalized, is_active, account_claimed_at, auth_user_id, assigned_role, email")
    .eq("username_normalized", username)
    .maybeSingle();

  if (
    staffError ||
    !staffProfile ||
    !staffProfile.is_active ||
    staffProfile.account_claimed_at ||
    staffProfile.auth_user_id
  ) {
    return NextResponse.json({ message: "Unable to create account." }, { status: 400 });
  }

  const authEmail = authEmailForUsername(username);
  const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: staffProfile.display_name
    }
  });

  if (createUserError || !createdUser.user) {
    return NextResponse.json({ message: "Unable to create account." }, { status: 400 });
  }

  const authUserId = createdUser.user.id;
  const role = roleForClaim(username, staffProfile.assigned_role as AppRole | null);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: authUserId,
      display_name: staffProfile.display_name,
      email: authEmail
    })
    .select("id")
    .single();

  if (profileError || !profile) {
    await supabase.auth.admin.deleteUser(authUserId);
    return NextResponse.json({ message: "Unable to create account." }, { status: 400 });
  }

  const { error: membershipError } = await supabase.from("department_memberships").insert({
    department_id: staffProfile.department_id,
    profile_id: profile.id,
    role
  });

  if (membershipError) {
    await supabase.auth.admin.deleteUser(authUserId);
    return NextResponse.json({ message: "Unable to create account." }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("staff_profiles")
    .update({
      profile_id: profile.id,
      auth_user_id: authUserId,
      account_claimed_at: new Date().toISOString(),
      password_reset_required: false,
      assigned_role: role
    })
    .eq("id", staffProfile.id)
    .is("account_claimed_at", null);

  if (updateError) {
    await supabase.auth.admin.deleteUser(authUserId);
    return NextResponse.json({ message: "Unable to create account." }, { status: 400 });
  }

  return NextResponse.json({
    authEmail,
    username: staffProfile.username ?? username
  });
}
