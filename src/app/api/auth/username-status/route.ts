import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { normalizeUsername } from "@/lib/auth/username";

type UsernameStatusRequest = {
  username?: string;
};

export async function POST(request: Request) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ status: "configuration_required" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as UsernameStatusRequest;
  const username = normalizeUsername(body.username ?? "");

  if (!username) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const supabase = createAdminClient();
  const { data: profile, error } = await supabase
    .from("staff_profiles")
    .select("id, display_name, username, username_normalized, is_active, account_claimed_at, auth_user_id")
    .eq("username_normalized", username)
    .maybeSingle();

  if (error || !profile || !profile.is_active) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    status: profile.account_claimed_at || profile.auth_user_id ? "claimed" : "unclaimed",
    username: profile.username ?? profile.username_normalized,
    displayName: profile.display_name
  });
}
