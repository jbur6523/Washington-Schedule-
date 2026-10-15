import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import {
  createAdminClient,
  hasSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import type { Identity } from "./model";

export const COOKIE = "etime_trial_session";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type Grant = {
  id: string;
  department_id: string;
  auth_user_id: string | null;
  username: string;
  display_name: string;
  initials: string;
  saved_signature_name: string | null;
  temporary_manager_access: boolean;
  role: "timekeeper" | "manager" | "identity_admin";
  portal_only: boolean;
  active: boolean;
};
export async function reviewer() {
  if (!hasSupabaseAdminConfig() || !hasSupabaseServerConfig()) return null;
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data, error } = await db
    .from("etime_trial_grants")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (error) return null;
  if (data && !data.portal_only) {
    const auth = await getAuthenticatedUserContext();
    if (
      auth.status !== "authenticated" ||
      auth.context.departmentId !== data.department_id
    )
      return null;
  }
  if (data?.temporary_manager_access) {
    const { data: trial, error: trialError } = await db
      .from("etime_trial_config")
      .select("department_id")
      .eq("id", true)
      .eq("enabled", true)
      .eq("department_id", data.department_id)
      .maybeSingle();
    if (trialError || !trial) data.temporary_manager_access = false;
  }
  return data as Grant | null;
}
export async function trialDepartment() {
  const { data, error } = await createAdminClient()
    .from("etime_trial_config")
    .select("department_id")
    .eq("id", true)
    .eq("enabled", true)
    .single();
  if (error || !data) throw new Error("The eTime trial is unavailable.");
  return data.department_id as string;
}
export async function employee(): Promise<{
  identity: Identity | null;
  authUserId: string | null;
  departmentId: string;
  actor: string;
}> {
  const departmentId = await trialDepartment();
  const auth = await getAuthenticatedUserContext();
  const db = createAdminClient();
  if (auth.status === "authenticated") {
    if (auth.context.departmentId !== departmentId)
      throw new Error("This trial is not available for your department.");
    const { data, error } = await db
      .from("etime_trial_identities")
      .select("*")
      .eq("auth_user_id", auth.context.authUserId)
      .eq("department_id", departmentId)
      .maybeSingle();
    if (error) throw new Error("Unable to load your payroll identity.");
    return {
      identity: data,
      authUserId: auth.context.authUserId,
      departmentId,
      actor: `app:${auth.context.authUserId}`,
    };
  }
  // A signed-in but inactive/unassigned account must not inherit another person's QR cookie.
  if (auth.status !== "unauthenticated")
    throw new Error(
      "Use an active employee account or sign out to use the QR trial.",
    );
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) {
    const { data } = await db
      .from("etime_trial_sessions")
      .select("identity_id")
      .eq("token_hash", hash(token))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (data) {
      const { data: identity } = await db
        .from("etime_trial_identities")
        .select("*")
        .eq("id", data.identity_id)
        .eq("department_id", departmentId)
        .single();
      if (identity)
        return {
          identity,
          authUserId: null,
          departmentId,
          actor: `qr:${identity.id}`,
        };
    }
  }
  return {
    identity: null,
    authUserId: null,
    departmentId,
    actor: "qr:enrollment",
  };
}
export async function issueSession(identityId: string) {
  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient()
    .from("etime_trial_sessions")
    .insert({
      token_hash: hash(token),
      identity_id: identityId,
      expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
    });
  if (error) throw new Error("Could not start your session.");
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 3600,
  });
}
export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token)
    await createAdminClient()
      .from("etime_trial_sessions")
      .delete()
      .eq("token_hash", hash(token));
  jar.delete(COOKIE);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new Error("Please use this website to submit changes.");
}
export async function rateLimit(request: Request, scope: string) {
  const ip =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "local";
  const { data, error } = await createAdminClient().rpc(
    "etime_trial_rate_limit",
    { p_key: hash(scope + ":" + ip) },
  );
  if (error || !data)
    throw new Error("Too many requests. Please wait a minute and try again.");
}
