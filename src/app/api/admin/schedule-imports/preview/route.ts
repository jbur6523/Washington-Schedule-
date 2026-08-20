import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { buildScheduleImportPreview, ScheduleImportError } from "@/lib/schedule-import/server";
import type { ScheduleImportResolution } from "@/lib/schedule-import/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await getAuthenticatedUserContext();
  if (auth.status !== "authenticated") {
    return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
  }
  if (auth.context.role !== "admin") {
    return NextResponse.json({ message: "Administrator access is required." }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      sourceCode?: unknown;
      resolutions?: unknown;
    };
    const sourceCode = typeof body.sourceCode === "string" ? body.sourceCode : "";
    const resolutions = Array.isArray(body.resolutions)
      ? body.resolutions as ScheduleImportResolution[]
      : [];
    const preview = await buildScheduleImportPreview({
      supabase: await createClient(),
      departmentId: auth.context.departmentId,
      sourceCode,
      resolutions
    });
    return NextResponse.json({ preview });
  } catch (error) {
    if (error instanceof ScheduleImportError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (process.env.NODE_ENV !== "production") console.error("Schedule import preview failed", error);
    return NextResponse.json({ message: "Schedule Code could not be reviewed." }, { status: 500 });
  }
}
