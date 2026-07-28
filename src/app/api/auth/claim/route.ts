import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { authEmailForUsername, normalizeUsername } from "@/lib/auth/username";
import type { AppRole, OperationsRole } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

type ClaimRequest = {
  username?: string;
  password?: string;
  confirmPassword?: string;
};

type ClaimedStaffProfile = {
  staff_profile_id: string;
  department_id: string;
  username: string;
  display_name: string;
  assigned_role: AppRole;
  operations_role: OperationsRole;
  phone_number: string | null;
};

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0"
};

function claimError(
  code: "not_found" | "already_claimed" | "invalid_request" | "unavailable",
  message: string,
  status: number
) {
  return NextResponse.json({ code, message }, { status, headers: noStoreHeaders });
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminConfig()) {
    return claimError("unavailable", "Account activation is not available.", 503);
  }

  const body = (await request.json().catch(() => ({}))) as ClaimRequest;
  const username = normalizeUsername(body.username ?? "");
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";

  if (
    !username
    || password.length < 12
    || password.length > 128
    || password !== confirmPassword
  ) {
    return claimError("invalid_request", "Check the username and password requirements.", 400);
  }

  const supabase = createAdminClient();
  const { data: staffProfile, error: staffError } = await supabase
    .from("staff_profiles")
    .select(
      "id, display_name, username, username_normalized, is_active, account_claimed_at, auth_user_id, profile_id"
    )
    .eq("username_normalized", username)
    .maybeSingle();

  if (staffError || !staffProfile || !staffProfile.is_active) {
    return claimError(
      "not_found",
      "We could not find an available account with that username.",
      404
    );
  }

  if (
    staffProfile.account_claimed_at
    || staffProfile.auth_user_id
    || staffProfile.profile_id
  ) {
    return claimError(
      "already_claimed",
      "This account has already been activated.",
      409
    );
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
    // The deterministic auth email is unique. Confirm that another request
    // actually completed the claim before presenting an already-activated
    // message; transient Auth failures must not be mislabeled as success.
    const { data: latestStaffProfile } = await supabase
      .from("staff_profiles")
      .select("account_claimed_at, auth_user_id, profile_id")
      .eq("id", staffProfile.id)
      .maybeSingle();

    if (
      latestStaffProfile?.account_claimed_at
      || latestStaffProfile?.auth_user_id
      || latestStaffProfile?.profile_id
    ) {
      return claimError(
        "already_claimed",
        "This account has already been activated.",
        409
      );
    }

    return claimError(
      "unavailable",
      "Unable to activate this account. Try again.",
      503
    );
  }

  const { data: claimedProfile, error: claimRpcError } = await supabase
    .rpc("claim_staff_profile", {
      requested_username: username,
      requested_auth_user_id: createdUser.user.id
    })
    .single<ClaimedStaffProfile>();

  if (claimRpcError || !claimedProfile) {
    await supabase.auth.admin.deleteUser(createdUser.user.id);

    const alreadyClaimed = claimRpcError?.message?.includes("claim_already_completed");
    return claimError(
      alreadyClaimed ? "already_claimed" : "unavailable",
      alreadyClaimed
        ? "This account has already been activated."
        : "Unable to activate this account. Try again.",
      alreadyClaimed ? 409 : 400
    );
  }

  return NextResponse.json(
    {
      authEmail,
      username: claimedProfile.username,
      displayName: claimedProfile.display_name,
      phoneNumber: claimedProfile.phone_number ?? ""
    },
    { headers: noStoreHeaders }
  );
}
