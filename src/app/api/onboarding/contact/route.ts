import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

type ContactSetupRequest = {
  staffProfileId?: string;
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
  const staffProfileId = body.staffProfileId ?? "";
  const phoneNumber = normalizeOptional(body.phoneNumber);
  const email = normalizeOptional(body.email);

  if (!staffProfileId || !isValidEmail(email)) {
    return NextResponse.json({ message: "Contact information is invalid." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: staffProfile, error: staffError } = await admin
    .from("staff_profiles")
    .select("id, auth_user_id")
    .eq("id", staffProfileId)
    .eq("auth_user_id", user.id)
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
