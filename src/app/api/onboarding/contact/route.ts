import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

type ContactSetupRequest = {
  phoneNumber?: string;
  email?: string;
};

function normalizeOptional(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function isValidEmail(value: string | null) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig() || !hasSupabaseAdminConfig()) {
    return NextResponse.json({ message: "Contact setup is not available." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as ContactSetupRequest;
  const phoneNumber = normalizeOptional(body.phoneNumber);
  const email = normalizeOptional(body.email);

  if (
    !isValidEmail(email)
    || (email?.length ?? 0) > 254
    || (phoneNumber?.length ?? 0) > 50
  ) {
    return NextResponse.json({ message: "Contact information is invalid." }, { status: 400 });
  }

  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated") {
    return NextResponse.json(
      { message: auth.status === "error" ? "Unable to verify access." : "Sign in required." },
      { status: auth.status === "error" ? 503 : 401 }
    );
  }

  const admin = createAdminClient();
  const { data: staffProfile, error: staffError } = await admin
    .from("staff_profiles")
    .select("id, auth_user_id")
    .eq("id", auth.context.staffProfileId)
    .eq("auth_user_id", auth.context.authUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (staffError || !staffProfile) {
    return NextResponse.json({ message: "Contact setup is not available." }, { status: 403 });
  }

  const { error: updateError } = await admin
    .from("staff_profiles")
    .update({
      phone_number: phoneNumber,
      email
    })
    .eq("id", staffProfile.id);

  if (updateError) {
    return NextResponse.json({ message: "Unable to save contact information." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
