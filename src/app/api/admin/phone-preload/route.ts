import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

type PhonePreloadRow = {
  staffProfileId?: string;
  phoneNumber?: string;
};

function cleanPhone(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUsablePhone(value: string) {
  const normalized = value.trim();
  const digits = normalized.replace(/\D/g, "");

  return Boolean(normalized) && normalized.toUpperCase() !== "VERIFY" && digits.length >= 7;
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ message: "Phone preload is not configured." }, { status: 503 });
  }

  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated" || auth.context.role !== "admin") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? (body.rows as PhonePreloadRow[]) : [];

  if (rows.length === 0) {
    return NextResponse.json({ message: "No ready phone rows were provided." }, { status: 400 });
  }

  const supabase = createAdminClient();
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const staffProfileId = typeof row.staffProfileId === "string" ? row.staffProfileId : "";
    const phoneNumber = cleanPhone(row.phoneNumber);

    if (!staffProfileId || !isUsablePhone(phoneNumber)) {
      skipped += 1;
      continue;
    }

    const { data, error } = await supabase
      .from("staff_profiles")
      .update({ phone_number: phoneNumber })
      .eq("id", staffProfileId)
      .eq("department_id", auth.context.departmentId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      skipped += 1;
    } else {
      updated += 1;
    }
  }

  return NextResponse.json({ ok: true, updated, skipped });
}
