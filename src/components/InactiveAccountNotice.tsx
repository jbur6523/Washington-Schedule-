"use client";

import { useEffect } from "react";
import { clearAndSignOut } from "@/lib/auth/client-session";

export function InactiveAccountNotice({ displayName }: { displayName?: string }) {
  useEffect(() => {
    void clearAndSignOut();
  }, []);

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">Account inactive</h1>
        {displayName && <p className="mt-2 text-sm font-bold text-slate-500">Signed in as {displayName}</p>}
        <p className="mt-4 text-sm font-bold leading-6 text-slate-600">
          This account is inactive. Please contact an administrator.
        </p>
      </section>
    </main>
  );
}
