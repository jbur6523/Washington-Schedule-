import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { normalizeUsername } from "@/lib/auth/username";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

type StaffRole = "admin" | "lead" | "staff";
type EmploymentType = "full_time" | "per_diem";
type HomeAssignment = "day_shift" | "night_shift" | "pft" | "pulmonary_rehab" | "rt_aide" | "flexible";
type PreferredContactMethod = "phone" | "email" | "app";
type OperationsRole = "none" | "aide" | "command_center" | "director";

type StaffProfilePayload = {
  department_id?: string;
  display_name?: string;
  username?: string;
  username_normalized?: string;
  assigned_role?: StaffRole;
  operations_role?: OperationsRole;
  employment_type?: EmploymentType;
  home_assignment?: HomeAssignment;
  phone_number?: string | null;
  email?: string | null;
  preferred_contact_method?: PreferredContactMethod | null;
  is_active?: boolean;
};

const validRoles = new Set(["admin", "lead", "staff"]);
const validEmploymentTypes = new Set(["full_time", "per_diem"]);
const validHomeAssignments = new Set(["day_shift", "night_shift", "pft", "pulmonary_rehab", "rt_aide", "flexible"]);
const validContactMethods = new Set(["phone", "email", "app"]);
const validOperationsRoles = new Set(["none", "aide", "command_center", "director"]);

function cleanOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeAssignedRole(usernameNormalized: string, requestedRole: unknown): StaffRole {
  if (usernameNormalized === "burj") {
    return "admin";
  }

  return requestedRole === "lead" ? "lead" : "staff";
}

function validatePayload(payload: StaffProfilePayload, departmentId: string) {
  const displayName = typeof payload.display_name === "string" ? payload.display_name.trim() : "";
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const usernameNormalized = normalizeUsername(
    typeof payload.username_normalized === "string" && payload.username_normalized.trim()
      ? payload.username_normalized
      : username
  );
  const employmentType = payload.employment_type;
  const homeAssignment = payload.home_assignment;
  const preferredContactMethod = payload.preferred_contact_method;
  const operationsRole = payload.operations_role ?? "none";

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

  if (!validOperationsRoles.has(operationsRole)) {
    return { error: "Operations dashboard access is invalid." };
  }

  if (payload.assigned_role && !validRoles.has(payload.assigned_role)) {
    return { error: "Role is invalid." };
  }

  return {
    data: {
      department_id: departmentId,
      display_name: displayName,
      username: username || usernameNormalized,
      username_normalized: usernameNormalized,
      assigned_role: safeAssignedRole(usernameNormalized, payload.assigned_role),
      operations_role: operationsRole,
      employment_type: employmentType,
      home_assignment: homeAssignment,
      phone_number: cleanOptional(payload.phone_number),
      email: cleanOptional(payload.email),
      preferred_contact_method: preferredContactMethod || null,
      is_active: payload.is_active ?? true
    }
  };
}

async function requireAdmin() {
  if (!hasSupabaseAdminConfig()) {
    return { error: NextResponse.json({ message: "Roster management is not configured." }, { status: 503 }) };
  }

  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated" || auth.context.role !== "admin") {
    return { error: NextResponse.json({ message: "Not found." }, { status: 404 }) };
  }

  return { context: auth.context, supabase: createAdminClient() };
}

export async function POST(request: Request) {
  const guard = await requireAdmin();

  if (guard.error) {
    return guard.error;
  }

  const body = await request.json().catch(() => null);
  const inputProfiles = Array.isArray(body?.profiles) ? body.profiles : [body];
  const payloads = [];

  for (const item of inputProfiles) {
    const validation = validatePayload(item ?? {}, guard.context.departmentId);

    if (validation.error || !validation.data) {
      return NextResponse.json({ message: validation.error ?? "Invalid staff profile." }, { status: 400 });
    }

    payloads.push(validation.data);
  }

  const usernameCounts = new Map<string, number>();
  for (const payload of payloads) {
    usernameCounts.set(payload.username_normalized, (usernameCounts.get(payload.username_normalized) ?? 0) + 1);
  }

  if (Array.from(usernameCounts.values()).some((count) => count > 1)) {
    return NextResponse.json({ message: "Batch contains duplicate usernames." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await guard.supabase
    .from("staff_profiles")
    .select("id, username_normalized, display_name")
    .eq("department_id", guard.context.departmentId)
    .in(
      "username_normalized",
      payloads.map((payload) => payload.username_normalized)
    );

  if (existingError) {
    return NextResponse.json({ message: "Unable to validate staff profiles." }, { status: 400 });
  }

  if (existing && existing.length > 0) {
    return NextResponse.json({ message: "A staff profile with that username already exists." }, { status: 409 });
  }

  const { data, error } = await guard.supabase.from("staff_profiles").insert(payloads).select("id");

  if (error) {
    return NextResponse.json({ message: "Unable to create staff profile." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ids: data?.map((row) => row.id) ?? [] });
}
