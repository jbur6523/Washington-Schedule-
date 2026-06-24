import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { normalizeUsername } from "@/lib/auth/username";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type StaffRole = "admin" | "lead" | "staff";
type EmploymentType = "full_time" | "per_diem";
type HomeAssignment = "day_shift" | "night_shift" | "pft" | "pulmonary_rehab" | "flexible";
type PreferredContactMethod = "phone" | "email" | "app";

type StaffProfilePayload = {
  display_name?: string;
  username?: string;
  username_normalized?: string;
  assigned_role?: StaffRole;
  employment_type?: EmploymentType;
  home_assignment?: HomeAssignment;
  phone_number?: string | null;
  email?: string | null;
  preferred_contact_method?: PreferredContactMethod | null;
  is_active?: boolean;
};

const validRoles = new Set(["admin", "lead", "staff"]);
const validEmploymentTypes = new Set(["full_time", "per_diem"]);
const validHomeAssignments = new Set(["day_shift", "night_shift", "pft", "pulmonary_rehab", "flexible"]);
const validContactMethods = new Set(["phone", "email", "app"]);

function cleanOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeAssignedRole(usernameNormalized: string, requestedRole: unknown): StaffRole {
  if (usernameNormalized === "burj") {
    return "admin";
  }

  return requestedRole === "lead" ? "lead" : "staff";
}

function validatePayload(payload: StaffProfilePayload, currentUsernameNormalized: string) {
  const displayName = typeof payload.display_name === "string" ? payload.display_name.trim() : "";
  const requestedUsername = typeof payload.username === "string" ? payload.username.trim() : "";
  const usernameNormalized = normalizeUsername(
    typeof payload.username_normalized === "string" && payload.username_normalized.trim()
      ? payload.username_normalized
      : requestedUsername || currentUsernameNormalized
  );
  const employmentType = payload.employment_type;
  const homeAssignment = payload.home_assignment;
  const preferredContactMethod = payload.preferred_contact_method;

  if (!displayName) {
    return { error: "Staff name is required." };
  }

  if (!usernameNormalized) {
    return { error: "Assigned username is required." };
  }

  if (!employmentType || !validEmploymentTypes.has(employmentType)) {
    return { error: "Employment type is invalid." };
  }

  if (!homeAssignment || !validHomeAssignments.has(homeAssignment)) {
    return { error: "Home assignment is invalid." };
  }

  if (preferredContactMethod && !validContactMethods.has(preferredContactMethod)) {
    return { error: "Preferred contact method is invalid." };
  }

  if (payload.assigned_role && !validRoles.has(payload.assigned_role)) {
    return { error: "Role is invalid." };
  }

  return {
    data: {
      display_name: displayName,
      username: requestedUsername || usernameNormalized,
      username_normalized: usernameNormalized,
      assigned_role: safeAssignedRole(usernameNormalized, payload.assigned_role),
      employment_type: employmentType,
      home_assignment: homeAssignment,
      phone_number: cleanOptional(payload.phone_number),
      email: cleanOptional(payload.email),
      preferred_contact_method: preferredContactMethod || null,
      is_active: payload.is_active ?? true
    }
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ message: "Roster management is not configured." }, { status: 503 });
  }

  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated" || auth.context.role !== "admin") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  const { id } = await context.params;
  const supabase = createAdminClient();
  const { data: currentProfile, error: readError } = await supabase
    .from("staff_profiles")
    .select("id, department_id, profile_id, username_normalized")
    .eq("id", id)
    .eq("department_id", auth.context.departmentId)
    .maybeSingle();

  if (readError || !currentProfile) {
    return NextResponse.json({ message: "Unable to find staff profile." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const validation = validatePayload(body ?? {}, currentProfile.username_normalized ?? "");

  if (validation.error || !validation.data) {
    return NextResponse.json({ message: validation.error ?? "Invalid staff profile." }, { status: 400 });
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("department_id", auth.context.departmentId)
    .eq("username_normalized", validation.data.username_normalized)
    .neq("id", id)
    .maybeSingle();

  if (duplicateError) {
    return NextResponse.json({ message: "Unable to validate staff profile." }, { status: 400 });
  }

  if (duplicate) {
    return NextResponse.json({ message: "A staff profile with that username already exists." }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("staff_profiles")
    .update(validation.data)
    .eq("id", id)
    .eq("department_id", auth.context.departmentId);

  if (updateError) {
    return NextResponse.json({ message: "Unable to update staff profile." }, { status: 400 });
  }

  if (currentProfile.profile_id) {
    await supabase
      .from("department_memberships")
      .update({ role: validation.data.assigned_role })
      .eq("department_id", auth.context.departmentId)
      .eq("profile_id", currentProfile.profile_id);
  }

  return NextResponse.json({ ok: true });
}
