import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { canManagerSign } from "@/lib/etime/workflow";
import { payrollReviewRole } from "@/lib/etime/access";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  employee,
  endSession,
  issueSession,
  rateLimit,
  reviewer,
  sameOrigin,
  trialDepartment,
} from "@/lib/etime/server";
import {
  employeeId,
  localDate,
  periodStart,
  requireText,
  signedName,
  validateEntry,
  validDate,
  type EtimeForm,
  type FormState,
} from "@/lib/etime/model";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers });
function check(error: { message: string } | null) {
  if (error)
    throw new Error(
      error.message.includes("This form changed")
        ? "This form changed. Refresh and try again."
        : error.message.includes("closed")
          ? "This pay period is closed."
          : "Unable to save. Please retry; if this persists, contact your administrator.",
    );
}

export async function GET(request: Request) {
  try {
    await trialDepartment();
    const db = createAdminClient();
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "employee";
    const grant = await reviewer();
    if (mode === "access")
      return json({
        reviewer: Boolean(payrollReviewRole(grant)),
        identityAdmin: grant?.role === "identity_admin",
      });
    if (mode === "review" || mode === "admin") {
      if (
        !grant ||
        (mode === "admin"
          ? grant.role !== "identity_admin"
          : !payrollReviewRole(grant))
      )
        return json({ error: "Access denied." }, 403);
      const { data: identities, error: ie } = await db
        .from("etime_trial_identities")
        .select("id,employee_id,first_name,last_name,department_id")
        .eq("department_id", grant.department_id)
        .order("last_name")
        .order("first_name");
      check(ie);
      let forms: EtimeForm[] = [];
      if (mode === "review") {
        const { data, error } = await db
          .from("etime_trial_forms")
          .select("*")
          .eq("department_id", grant.department_id)
          .order("period_start", { ascending: false });
        check(error);
        forms = data ?? [];
      }
      return json({
        grant: {
          display_name: grant.display_name,
          role: mode === "review" ? payrollReviewRole(grant) : grant.role,
          temporary_manager_access: grant.temporary_manager_access,
          portal_only: grant.portal_only,
          saved_signature_name: grant.saved_signature_name ?? null,
        },
        identities,
        forms,
        today: localDate(),
        currentPeriod: periodStart(localDate()),
      });
    }
    const who = await employee();
    if (!who.identity)
      return json({
        identity: null,
        signedIn: !!who.authUserId,
        today: localDate(),
        currentPeriod: periodStart(localDate()),
      });
    const { data, error } = await db
      .from("etime_trial_forms")
      .select("*")
      .eq("identity_id", who.identity.id)
      .order("period_start", { ascending: false });
    check(error);
    const { auth_user_id: _link, ...identity } = who.identity;
    void _link;
    return json({
      identity,
      signedIn: !!who.authUserId,
      forms: data,
      today: localDate(),
      currentPeriod: periodStart(localDate()),
    });
  } catch {
    return json(
      {
        error:
          "Unable to load eTime. Please sign in with an active account, or sign out to use the QR trial.",
      },
      503,
    );
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (Number(request.headers.get("content-length")) > 20000)
      return json({ error: "Request too large." }, 413);
    const body = await request.json();
    const db = createAdminClient();
    if (body.action === "logout") {
      await endSession();
      return json({ ok: true });
    }
    await trialDepartment();
    await rateLimit(
      request,
      body.action === "identify" ? "etime-identify" : "etime-change",
    );
    if (body.action === "identify") {
      const who = await employee();
      const id = employeeId(body.employee_id);
      const { data: existing, error } = await db
        .from("etime_trial_identities")
        .select("*")
        .eq("department_id", who.departmentId)
        .eq("employee_id", id)
        .maybeSingle();
      check(error);
      if (who.identity) return json({ ok: true });
      if (existing && !who.authUserId) {
        await issueSession(existing.id);
        return json({ ok: true });
      }
      if (!body.confirm_employee_id || !body.first_name || !body.last_name)
        return json({ enroll: true });
      if (employeeId(body.confirm_employee_id) !== id)
        throw new Error("Employee IDs must match.");
      const first_name = requireText(
        body.first_name,
        "Official first name",
        35,
      );
      const last_name = requireText(body.last_name, "Official last name", 45);
      if (existing) {
        if (
          existing.auth_user_id ||
          first_name.toLowerCase() !== existing.first_name.toLowerCase() ||
          last_name.toLowerCase() !== existing.last_name.toLowerCase()
        )
          throw new Error(
            "This identity needs administrator review before it can be linked to your account.",
          );
        const { data, error: linkError } = await db
          .from("etime_trial_identities")
          .update({ auth_user_id: who.authUserId })
          .eq("id", existing.id)
          .is("auth_user_id", null)
          .select("id")
          .single();
        check(linkError);
        if (!data) throw new Error("Identity link changed. Please retry.");
        return json({ ok: true });
      }
      const { data: created, error: createError } = await db
        .from("etime_trial_identities")
        .insert({
          department_id: who.departmentId,
          employee_id: id,
          first_name,
          last_name,
          auth_user_id: who.authUserId,
        })
        .select("id")
        .single();
      check(createError);
      if (!who.authUserId) await issueSession(created!.id);
      return json({ ok: true });
    }
    if (body.action === "correct") {
      const grant = await reviewer();
      if (!grant || grant.role !== "identity_admin")
        return json({ error: "Access denied." }, 403);
      const id = employeeId(body.employee_id);
      if (id !== employeeId(body.confirm_employee_id))
        throw new Error("Employee IDs must match.");
      const { error } = await db.rpc("etime_trial_correct_identity", {
        p_identity: body.identity_id,
        p_department: grant.department_id,
        p_employee_id: id,
        p_first: requireText(body.first_name, "First name", 35),
        p_last: requireText(body.last_name, "Last name", 45),
        p_actor: `admin:${grant.id}`,
        p_reason: requireText(body.reason, "Correction reason", 200),
      });
      check(error);
      return json({ ok: true });
    }
    const management =
      body.action === "initial" || body.action === "managerSign";
    const grant = management ? await reviewer() : null;
    if (management && !payrollReviewRole(grant))
      return json({ error: "Access denied." }, 403);
    if (body.action === "managerSign" && payrollReviewRole(grant) !== "manager")
      return json({ error: "Only the assigned manager may sign." }, 403);
    const who = management ? null : await employee();
    if (!management && !who?.identity)
      return json({ error: "Enter your employee ID first." }, 401);
    let current: EtimeForm | null = null;
    if (body.form_id) {
      let query = db
        .from("etime_trial_forms")
        .select("*")
        .eq("id", body.form_id);
      query = management
        ? query.eq("department_id", grant!.department_id)
        : query.eq("identity_id", who!.identity!.id);
      const { data, error } = await query.single();
      check(error);
      current = data;
    }
    if (management && !current) return json({ error: "Form not found." }, 404);
    if (
      !Number.isInteger(body.revision) ||
      body.revision !== (current?.revision ?? 0)
    )
      throw new Error("This form changed. Refresh and try again.");
    const state: FormState = current
      ? structuredClone(current.state)
      : {
          identity: {
            employee_id: who!.identity!.employee_id,
            first_name: who!.identity!.first_name,
            last_name: who!.identity!.last_name,
          },
          entries: [],
          contentRevision: 0,
        };
    let start = current?.period_start ?? "";
    const actor = management ? `reviewer:${grant!.id}` : who!.actor;
    const at = new Date().toISOString();
    if (body.action === "save") {
      const entry = validateEntry(body.entry);
      start = periodStart(entry.date);
      if (current && start !== current.period_start)
        throw new Error("An edit must stay in the original pay period.");
      const index = body.entry_id
        ? state.entries.findIndex((e) => e.id === body.entry_id)
        : -1;
      if (body.entry_id && index < 0) throw new Error("Entry not found.");
      if (index < 0 && state.entries.length >= 100)
        throw new Error(
          "This form has reached 100 entries. Contact the timekeeper.",
        );
      const next = {
        ...entry,
        id: index < 0 ? randomUUID() : state.entries[index].id,
        revision: index < 0 ? 1 : state.entries[index].revision + 1,
      };
      if (index < 0) state.entries.push(next);
      else state.entries[index] = next;
      state.contentRevision++;
      delete state.managerSignature;
      state.employeeSignature = {
        name: signedName(
          body.name,
          `${state.identity.first_name} ${state.identity.last_name}`,
          body.adopted,
        ),
        actor,
        at,
        contentRevision: state.contentRevision,
      };
    } else if (body.action === "employeeSign") {
      if (!current) throw new Error("No form to sign.");
      state.employeeSignature = {
        name: signedName(
          body.name,
          `${state.identity.first_name} ${state.identity.last_name}`,
          body.adopted,
        ),
        actor,
        at,
        contentRevision: state.contentRevision,
      };
      delete state.managerSignature;
    } else if (body.action === "initial") {
      const entry = state.entries.find((e) => e.id === body.entry_id);
      if (!entry) throw new Error("Entry not found.");
      if (body.entered === true)
        entry.entered = {
          initials: grant!.initials,
          actor,
          at,
          revision: entry.revision,
        };
      else if (body.entered === false) delete entry.entered;
      else throw new Error("Confirm entry or reversal.");
      delete state.managerSignature;
    } else if (body.action === "managerSign") {
      if (!canManagerSign(state))
        throw new Error(
          "The employee must sign and every row must be marked entered before manager signing.",
        );
      state.managerSignature = {
        name: signedName(body.name, grant!.display_name, body.adopted),
        actor,
        at,
        contentRevision: state.contentRevision,
      };
    } else throw new Error("Unknown action.");
    if (!validDate(start)) throw new Error("Invalid pay period.");
    const { data, error } = await db.rpc("etime_trial_save", {
      p_identity: current?.identity_id ?? who!.identity!.id,
      p_period: start,
      p_expected: body.revision,
      p_state: state,
      p_actor: actor,
      p_action: body.action,
      p_employee: !management,
    });
    check(error);
    return json({ form: data });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save. Please retry.",
      },
      400,
    );
  }
}
