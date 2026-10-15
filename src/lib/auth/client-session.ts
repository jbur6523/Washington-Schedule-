"use client";

import { createClient } from "@/lib/supabase/client";

export function clearAppSessionState() {
  try {
    window.sessionStorage.clear();
  } catch {
    // Session storage can be unavailable in restricted browser modes.
  }
}

export async function clearAndSignOut() {
  clearAppSessionState();
  await fetch("/api/etime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }).catch(() => undefined);
  const supabase = createClient();
  await supabase.auth.signOut({ scope: "local" });
  clearAppSessionState();
}

export async function signOutAndRedirect(path = "/login") {
  await clearAndSignOut();
  window.location.replace(path);
}
