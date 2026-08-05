import { NextResponse } from "next/server";
import { validateAnnouncementInput } from "@/lib/announcements/types";
import { canManageDepartmentAnnouncement } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated") {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  if (!canManageDepartmentAnnouncement(auth.context)) {
    return NextResponse.json({ message: "You do not have permission to manage announcements." }, { status: 403 });
  }

  if (!auth.context.staffProfileId) {
    return NextResponse.json({ message: "Your staff profile could not be found." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; message?: unknown };
  const validated = validateAnnouncementInput(body.title, body.message);

  if ("error" in validated) {
    return NextResponse.json({ message: validated.error }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("department_announcements")
    .upsert(
      {
        department_id: auth.context.departmentId,
        title: validated.title,
        message: validated.message
      },
      { onConflict: "department_id" }
    )
    .select("id, department_id, title, message, updated_by_staff_profile_id, updated_by_name, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ message: "Unable to save the announcement." }, { status: 500 });
  }

  return NextResponse.json({ announcement: data });
}

export async function DELETE() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated") {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  if (!canManageDepartmentAnnouncement(auth.context)) {
    return NextResponse.json({ message: "You do not have permission to manage announcements." }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("department_announcements")
    .delete()
    .eq("department_id", auth.context.departmentId);

  if (error) {
    return NextResponse.json({ message: "Unable to clear the announcement." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
