import { NextResponse } from "next/server";
import { isCommandCenter } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { sendShortShiftNotifications } from "@/lib/notifications/web-push";
import { createClient } from "@/lib/supabase/server";
import type { ShiftShortageSeverity, ShiftType } from "@/lib/schedule/supabase-schedule";

const shiftTypes = new Set(["day_shift", "night_shift", "pft", "pulmonary_rehab", "rt_aide", "flexible"]);
const severities = new Set(["short", "urgent"]);

export const runtime = "nodejs";

type ShortShiftBody = {
  schedule_version_id?: string;
  shift_date?: string;
  shift_type?: ShiftType;
  shift_start?: string;
  shift_end?: string;
  severity?: ShiftShortageSeverity;
  message?: string;
  posted_by_name?: string;
};

function isValidDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isValidTime(value: string | undefined) {
  return Boolean(value && /^\d{2}:\d{2}$/.test(value));
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.context.role !== "admin" && auth.context.role !== "lead" && !isCommandCenter(auth.context)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = (await request.json()) as ShortShiftBody;

  if (
    !body.schedule_version_id ||
    !isValidDate(body.shift_date) ||
    !shiftTypes.has(body.shift_type ?? "") ||
    !isValidTime(body.shift_start) ||
    !isValidTime(body.shift_end) ||
    !severities.has(body.severity ?? "")
  ) {
    return NextResponse.json({ error: "Invalid Short Shift payload" }, { status: 400 });
  }

  const attribution = body.posted_by_name?.trim();
  const rawMessage = body.message?.trim() || "";
  const message = [attribution ? `Posted by ${attribution}.` : "", rawMessage]
    .filter(Boolean)
    .join(" ")
    .slice(0, 140) || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shift_shortages")
    .insert({
      schedule_version_id: body.schedule_version_id,
      department_id: auth.context.departmentId,
      shift_date: body.shift_date,
      shift_type: body.shift_type,
      shift_start: body.shift_start,
      shift_end: body.shift_end,
      severity: body.severity,
      status: "active",
      message,
      created_by: auth.context.profileId
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json({ error: "Unable to create Short Shift" }, { status: 500 });
  }

  const notificationResult = await sendShortShiftNotifications({
    departmentId: auth.context.departmentId,
    shiftShortageId: data.id as string,
    shiftDate: body.shift_date as string,
    shiftType: body.shift_type as ShiftType,
    shiftStart: body.shift_start as string,
    shiftEnd: body.shift_end as string,
    severity: body.severity as ShiftShortageSeverity
  });

  return NextResponse.json({ id: data.id, notifications: notificationResult });
}
