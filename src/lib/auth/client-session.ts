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
  const supabase = createClient();
  await supabase.auth.signOut();
  clearAppSessionState();
}

export async function signOutAndRedirect(path = "/login") {
  await clearAndSignOut();
  window.location.replace(path);
}
