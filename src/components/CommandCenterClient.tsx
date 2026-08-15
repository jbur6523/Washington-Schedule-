"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, ClipboardList, LogOut, Megaphone, MessageSquareText, Phone, RefreshCcw } from "lucide-react";
import { DepartmentAnnouncementManagerCard } from "@/components/DepartmentAnnouncement";
import { LeadActionCardContent, leadActionCardClass } from "@/components/LeadActionCard";
import { signOutAndRedirect } from "@/lib/auth/client-session";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { fetchLeadCommunicationNewCount, LeadCommunicationBoardModal } from "@/components/LeadCommunicationBoardModal";
import { RtAideNotesModal } from "@/components/RtAideNotesModal";
import { LeadOperationalSummary } from "@/components/LeadOperationalSummary";

type CommandCenterClientProps = {
  authContext: AuthenticatedUserContext;
  timezone: string;
};

export function CommandCenterClient({ authContext, timezone }: CommandCenterClientProps) {
  const [rtAideNotesOpen, setRtAideNotesOpen] = useState(false);
  const [leadNotesOpen, setLeadNotesOpen] = useState(false);
  const [leadNewNoteCount, setLeadNewNoteCount] = useState(0);

  const loadLeadNewNoteCount = useCallback(async () => {
    const count = await fetchLeadCommunicationNewCount(authContext.departmentId);
    setLeadNewNoteCount(count);
  }, [authContext.departmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLeadNewNoteCount();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadLeadNewNoteCount]);

  const signOut = async () => {
    await signOutAndRedirect();
  };

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-5 lg:py-6">
      <div className="mx-auto max-w-6xl space-y-3">
        <header className="py-1 text-center sm:py-2">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
          <h1 className="mt-1 text-3xl font-black leading-tight text-hospital-ink lg:text-4xl">Lead Command Board</h1>
          <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">Lead shift operations</p>
        </header>

        <LeadOperationalSummary authContext={authContext} timezone={timezone} />

        <div data-testid="lead-action-grid" aria-label="Lead command actions" className="grid gap-2.5 md:grid-cols-2 lg:gap-3">
          <Link
            href="/command-center/shift-update"
            className={leadActionCardClass}
          >
            <LeadActionCardContent
              icon={ClipboardList}
              title="Shift Update"
              description="Update current shift staffing and equipment numbers."
              accentClass="bg-teal-500"
              iconClass="bg-teal-50 text-teal-700 ring-teal-100"
            />
          </Link>

          <button
            type="button"
            onClick={() => setLeadNotesOpen(true)}
            className={leadActionCardClass}
          >
            <LeadActionCardContent
              icon={MessageSquareText}
              title="Lead Communication Board"
              description="Shared notes for RT leads."
              accentClass="bg-blue-500"
              iconClass="bg-blue-50 text-blue-700 ring-blue-100"
              badge={leadNewNoteCount > 0 ? `${leadNewNoteCount} new` : undefined}
            />
          </button>

          <Link
            href="/command-center/phone-list"
            className={leadActionCardClass}
          >
            <LeadActionCardContent
              icon={Phone}
              title="Phone List"
              description="Assign scheduled staff to department extensions."
              accentClass="bg-green-500"
              iconClass="bg-green-50 text-green-700 ring-green-100"
            />
          </Link>

          <Link
            href="/command-center/icu-snapshot"
            className={leadActionCardClass}
          >
            <LeadActionCardContent
              icon={Activity}
              title="ICU Snapshot"
              description="View ICU respiratory devices and settings."
              accentClass="bg-cyan-600"
              iconClass="bg-cyan-50 text-cyan-700 ring-cyan-100"
            />
          </Link>

          <button
            type="button"
            onClick={() => setRtAideNotesOpen(true)}
            className={leadActionCardClass}
          >
            <LeadActionCardContent
              icon={MessageSquareText}
              title="Aide Communication Board"
              description="Send notes or questions to RT Aides."
              accentClass="bg-violet-500"
              iconClass="bg-violet-50 text-violet-700 ring-violet-100"
            />
          </button>

          <Link
            href="/operations/rental-management"
            className={leadActionCardClass}
          >
            <LeadActionCardContent
              icon={RefreshCcw}
              title="Rental Management"
              description="Order rentals, confirm delivery, and manage pickups."
              accentClass="bg-orange-500"
              iconClass="bg-orange-50 text-orange-700 ring-orange-100"
            />
          </Link>

          <Link
            href="/command-center/short-shift-alert"
            className={leadActionCardClass}
          >
            <LeadActionCardContent
              icon={Megaphone}
              title="Short Shift Alert"
              description="Post a staffing need for the current shift."
              accentClass="bg-red-500"
              iconClass="bg-red-50 text-red-700 ring-red-100"
            />
          </Link>

          <div className="h-full">
            <DepartmentAnnouncementManagerCard
              departmentId={authContext.departmentId}
              timezone={timezone}
              variant="dashboard"
            />
          </div>
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
      <LeadCommunicationBoardModal
        authContext={authContext}
        open={leadNotesOpen}
        onClose={() => {
          setLeadNotesOpen(false);
          void loadLeadNewNoteCount();
        }}
        onNotesChanged={loadLeadNewNoteCount}
        context="lead"
      />
    </main>
  );
}
