import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

type PreferredContactMethod = "phone" | "email" | "app";

type ContactSettingsRequest = {
  phoneNumber?: string;
  email?: string;
  preferredContactMethod?: PreferredContactMethod | "";
};

const validContactMethods = new Set(["phone", "email", "app"]);

function normalizeOptional(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizePreferredContactMethod(value: unknown) {
  return typeof value === "string" && validContactMethods.has(value) ? value : null;
}

function isValidEmail(value: string | null) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig() || !hasSupabaseAdminConfig()) {
    return NextResponse.json({ message: "Settings are not available." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as ContactSettingsRequest;
  const phoneNumber = normalizeOptional(body.phoneNumber);
  const email = normalizeOptional(body.email);
  const preferredContactMethod = normalizePreferredContactMethod(body.preferredContactMethod);

  if (!isValidEmail(email)) {
    return NextResponse.json({ message: "Contact information is invalid." }, { status: 400 });
  }

  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated") {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  if (!auth.context.staffProfileId) {
    return NextResponse.json({ message: "Your staff profile could not be found." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("staff_profiles")
    .update({
      phone_number: phoneNumber,
      email,
      preferred_contact_method: preferredContactMethod
    })
    .eq("id", auth.context.staffProfileId)
    .eq("department_id", auth.context.departmentId);

  if (updateError) {
    return NextResponse.json({ message: "Unable to save settings." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
