"use client";

import Link from "next/link";
import { ClipboardList, LogOut, Megaphone, RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function CommandCenterClient() {
  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
          <h1 className="mt-2 text-3xl font-black text-hospital-ink">Respiratory Command Center</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Department phone operations</p>
        </section>

        <div className="grid gap-3">
          <Link
            href="/command-center/shift-update"
            className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
                <ClipboardList size={24} />
              </span>
              <div>
                <h2 className="text-xl font-black text-hospital-ink">Shift Update</h2>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                  Update current shift staffing and equipment numbers.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/operations/rental-management"
            className="rounded-3xl border border-amber-100 bg-amber-50/90 p-4 shadow-soft active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-amber-600">
                <RefreshCcw size={24} />
              </span>
              <div>
                <h2 className="text-xl font-black text-hospital-ink">Rental Management</h2>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-600">
                  Order rentals, confirm delivery, and manage pickups.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/command-center/short-shift-alert"
            className="rounded-3xl border border-rose-100 bg-white/95 p-4 shadow-soft active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-600">
                <Megaphone size={24} />
              </span>
              <div>
                <h2 className="text-xl font-black text-hospital-ink">Short Shift Alert</h2>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                  Post a staffing need for the current shift.
                </p>
              </div>
            </div>
          </Link>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 shadow-sm"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </main>
  );
}
