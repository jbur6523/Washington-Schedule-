import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { buildScheduleImportPreview, ScheduleImportError } from "@/lib/schedule-import/server";
import type {
  ScheduleImportCommitResult,
  ScheduleImportResolution
} from "@/lib/schedule-import/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RpcResult = Omit<ScheduleImportCommitResult, "independentlyVerified">;

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
      expectedVersionId?: unknown;
      sourceHash?: unknown;
    };
    const sourceCode = typeof body.sourceCode === "string" ? body.sourceCode : "";
    const resolutions = Array.isArray(body.resolutions)
      ? body.resolutions as ScheduleImportResolution[]
      : [];
    const suppliedVersionId = typeof body.expectedVersionId === "string" ? body.expectedVersionId : "";
    const suppliedHash = typeof body.sourceHash === "string" ? body.sourceHash : "";
    const supabase = await createClient();
    const preview = await buildScheduleImportPreview({
      supabase,
      departmentId: auth.context.departmentId,
      sourceCode,
      resolutions
    });

    if (preview.activeVersion.id !== suppliedVersionId) {
      return NextResponse.json(
        { message: "The active schedule changed after review. Parse and review the code again." },
        { status: 409 }
      );
    }
    if (preview.sourceHash !== suppliedHash) {
      return NextResponse.json(
        { message: "The reviewed Schedule Code changed. Parse and review it again." },
        { status: 409 }
      );
    }
    if (!preview.canCommit) {
      return NextResponse.json(
        { message: "Resolve or exclude every attention row before adding to the schedule.", preview },
        { status: 409 }
      );
    }

    const included = preview.rows.filter((row) => !row.excluded);
    const entryRows = included.filter((row) => row.kind === "entry").map((row) => ({
      row_index: row.lineNumber,
      shift_date: row.shiftDate,
      shift_type: row.shiftType,
      shift_start: row.shiftStart,
      shift_end: row.shiftEnd,
      staff_profile_id: row.staffProfileId,
      raw_staff_name: row.staffIdentifier,
      entry_status: row.entryStatus,
      is_shift_lead: row.isShiftLead
    }));
    const shortageRows = included.filter((row) => row.kind === "short_shift").map((row) => ({
      row_index: row.lineNumber,
      shift_date: row.shiftDate,
      shift_type: row.shiftType,
      shift_start: row.shiftStart,
      shift_end: row.shiftEnd,
      severity: row.severity,
      message: row.message
    }));
    const auditRows = preview.rows.map((row) => ({
      row_index: row.lineNumber,
      row_type: row.kind,
      source_line: row.sourceLine,
      raw_staff_name: row.staffIdentifier || null,
      excluded: row.excluded,
      exclusion_reason: row.exclusionReason || null
    }));

    const { data, error } = await supabase.rpc("commit_schedule_import", {
      p_expected_schedule_version_id: preview.activeVersion.id,
      p_source_hash: preview.sourceHash,
      p_source_label: preview.metadata.label,
      p_source_starts_on: preview.metadata.startsOn,
      p_source_ends_on: preview.metadata.endsOn,
      p_entry_rows: entryRows,
      p_shortage_rows: shortageRows,
      p_audit_rows: auditRows
    });
    if (error || !data) {
      if (process.env.NODE_ENV !== "production") console.error("Atomic schedule import failed", error);
      return NextResponse.json(
        { message: "No schedule update was confirmed. Resolve conflicts and retry; retrying identical code is safe." },
        { status: 409 }
      );
    }

    const result = data as RpcResult;
    const verification = await supabase.rpc("verify_schedule_import", {
      p_schedule_import_id: result.importId
    });
    const verified = verification.data as { verified?: boolean; verifiedRows?: number } | null;
    const independentlyVerified = !verification.error
      && verified?.verified === true
      && verified.verifiedRows === result.expectedRows;
    const response: ScheduleImportCommitResult = { ...result, independentlyVerified };

    if (!independentlyVerified) {
      const warning = await supabase.from("schedule_import_attempts").insert({
        schedule_import_id: result.importId,
        attempted_by: auth.context.profileId,
        outcome: "verification_warning",
        result_json: {
          ...response,
          verificationMessage: verification.error?.message ?? "Independent row counts did not match."
        }
      });
      if (warning.error && process.env.NODE_ENV !== "production") {
        console.error("Schedule import verification warning could not be audited", warning.error);
      }
    }

    return NextResponse.json({
      result: response,
      message: independentlyVerified
        ? "Schedule Updated"
        : "Schedule update was committed but could not be independently verified. Retrying the same Schedule Code is safe."
    });
  } catch (error) {
    if (error instanceof ScheduleImportError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (process.env.NODE_ENV !== "production") console.error("Schedule import commit failed", error);
    return NextResponse.json({ message: "No schedule update was confirmed." }, { status: 500 });
  }
}
