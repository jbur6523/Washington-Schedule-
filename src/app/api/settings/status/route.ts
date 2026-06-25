import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

type StatusSettingsRequest = {
  statusMessage?: string;
};

function normalizeStatus(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig() || !hasSupabaseAdminConfig()) {
    return NextResponse.json({ message: "Status updates are not available." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as StatusSettingsRequest;
  const statusMessage = normalizeStatus(body.statusMessage);

  if (statusMessage && statusMessage.length > 100) {
    return NextResponse.json({ message: "Status must be 100 characters or fewer." }, { status: 400 });
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
      status_message: statusMessage,
      status_updated_at: statusMessage ? new Date().toISOString() : null
    })
    .eq("id", auth.context.staffProfileId)
    .eq("department_id", auth.context.departmentId);

  if (updateError) {
    return NextResponse.json({ message: "Unable to save status." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
