import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { authEmailForUsername } from "@/lib/auth/username";
export async function portalAccount(username: string) {
  const { data, error } = await createAdminClient()
    .from("etime_trial_grants")
    .select("id,username,display_name,auth_user_id,claimed_at")
    .eq("username", username)
    .eq("portal_only", true)
    .eq("active", true)
    .maybeSingle();
  return error ? null : data;
}
export async function claimPortalAccount(
  account: NonNullable<Awaited<ReturnType<typeof portalAccount>>>,
  password: string,
) {
  if (account.claimed_at || account.auth_user_id)
    throw new Error("This account has already been activated.");
  const db = createAdminClient();
  const email = authEmailForUsername(account.username);
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(
      "Unable to activate this account. Try signing in or contact your administrator.",
    );
  const { data: linked, error: linkError } = await db
    .from("etime_trial_grants")
    .update({
      auth_user_id: data.user.id,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", account.id)
    .is("auth_user_id", null)
    .is("claimed_at", null)
    .eq("active", true)
    .select("id")
    .single();
  if (linkError || !linked) {
    await db.auth.admin.deleteUser(data.user.id);
    throw new Error("Unable to activate this account. Please try again.");
  }
  return {
    authEmail: email,
    username: account.username,
    displayName: account.display_name,
  };
}
