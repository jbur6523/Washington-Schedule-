import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { employee, reviewer, trialDepartment } from "@/lib/etime/server";
import { formPdf } from "@/lib/etime/pdf";
import { payrollReviewRole } from "@/lib/etime/access";
import type { EtimeForm } from "@/lib/etime/model";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    await trialDepartment();
    const { id } = await params;
    const url = new URL(request.url);
    const db = createAdminClient();
    const grant = await reviewer();
    let query = db.from("etime_trial_forms").select("*").eq("id", id);
    if (grant && payrollReviewRole(grant))
      query = query.eq("department_id", grant.department_id);
    else {
      const who = await employee();
      if (!who.identity)
        return NextResponse.json(
          { error: "Access denied." },
          { status: 403, headers },
        );
      query = query.eq("identity_id", who.identity.id);
    }
    const { data, error } = await query.single();
    if (error || !data)
      return NextResponse.json(
        { error: "Form not found." },
        { status: 404, headers },
      );
    const form = data as EtimeForm;
    if (url.searchParams.has("history")) {
      const { data: history, error: historyError } = await db
        .from("etime_trial_revisions")
        .select("revision,action,at")
        .eq("form_id", id)
        .order("revision", { ascending: false });
      if (historyError) throw historyError;
      return NextResponse.json({ history }, { headers });
    }
    const revision = url.searchParams.get("revision");
    if (revision) {
      const { data: snapshot, error: re } = await db
        .from("etime_trial_revisions")
        .select("state,revision")
        .eq("form_id", id)
        .eq("revision", Number(revision))
        .single();
      if (re || !snapshot)
        return NextResponse.json(
          { error: "Revision not found." },
          { status: 404, headers },
        );
      form.state = snapshot.state;
      form.revision = snapshot.revision;
    }
    const bytes = await formPdf(form);
    return new Response(Buffer.from(bytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="etime-trial-r${form.revision}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "PDF unavailable. Your saved entries are safe. Please retry." },
      { status: 503, headers },
    );
  }
}
