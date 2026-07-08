"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, ClipboardList, LogOut, Megaphone, MessageSquareText, RefreshCcw } from "lucide-react";
import { signOutAndRedirect } from "@/lib/auth/client-session";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { RtAideNotesModal } from "@/components/RtAideNotesModal";

type CommandCenterClientProps = {
  authContext: AuthenticatedUserContext;
};

export function CommandCenterClient({ authContext }: CommandCenterClientProps) {
  const [rtAideNotesOpen, setRtAideNotesOpen] = useState(false);
  const cardBaseClass =
    "h-36 rounded-3xl border p-4 text-left shadow-soft transition duration-150 active:scale-[0.99]";

  const signOut = async () => {
    await signOutAndRedirect();
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 text-center shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
          <h1 className="mt-2 text-3xl font-black text-hospital-ink">Lead Command Board</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Lead shift operations</p>
        </section>

        <div className="grid gap-3">
          <Link
            href="/command-center/shift-update"
            className={`${cardBaseClass} border-sky-100 bg-sky-50/90`}
          >
            <div className="flex h-full items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-sky-700">
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
            className={`${cardBaseClass} border-amber-100 bg-amber-50/90`}
          >
            <div className="flex h-full items-start gap-3">
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

          <button
            type="button"
            onClick={() => setRtAideNotesOpen(true)}
            className={`${cardBaseClass} border-purple-100 bg-purple-50/90`}
          >
            <div className="flex h-full items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-purple-700">
                <MessageSquareText size={24} />
              </span>
              <div>
                <h2 className="text-xl font-black text-hospital-ink">Aide Communication Board</h2>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-600">
                  Send notes or questions to RT Aides.
                </p>
              </div>
            </div>
          </button>

          <Link
            href="/command-center/icu-snapshot"
            className={`${cardBaseClass} border-teal-100 bg-teal-50/90`}
          >
            <div className="flex h-full items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-teal-700">
                <Activity size={24} />
              </span>
              <div>
                <h2 className="text-xl font-black text-hospital-ink">ICU Snapshot</h2>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                  View ICU respiratory devices and settings.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/command-center/short-shift-alert"
            className={`${cardBaseClass} border-red-200 bg-red-50/95`}
          >
            <div className="flex h-full items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-red-700">
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
      <RtAideNotesModal
        authContext={authContext}
        open={rtAideNotesOpen}
        onClose={() => setRtAideNotesOpen(false)}
        context="lead"
      />
    </main>
  );
}
