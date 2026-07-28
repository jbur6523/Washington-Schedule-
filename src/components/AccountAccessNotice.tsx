"use client";

import { useState } from "react";
import { signOutAndRedirect } from "@/lib/auth/client-session";

export function AccountAccessNotice({
  displayName,
  inactive = false
}: {
  displayName?: string;
  inactive?: boolean;
}) {
  const [signingOut, setSigningOut] = useState(false);

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">
          {inactive ? "Account access is inactive" : "Department assignment needed"}
        </h1>
        {displayName && <p className="mt-2 text-sm font-bold text-slate-500">Signed in as {displayName}</p>}
        <p className="mt-4 text-sm font-bold leading-6 text-slate-600">
          {inactive
            ? "Your account has been deactivated. Contact the schedule administrator if access should be restored."
            : "Your account has not been linked to an active staff profile. Contact the schedule administrator."}
        </p>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOutAndRedirect();
          }}
          className="mt-4 min-h-11 w-full rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </section>
    </main>
  );
}
