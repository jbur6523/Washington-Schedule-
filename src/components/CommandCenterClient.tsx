"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronRight, ClipboardList, LogOut, Phone, ShoppingCart, Users, Zap, type LucideIcon } from "lucide-react";
import { DepartmentAnnouncementStrip } from "@/components/DepartmentAnnouncement";
import { IcuCommandCenterClient } from "@/components/IcuCommandCenterClient";
import { LeadNotePreview } from "@/components/LeadBoardPreviews";
import { signOutAndRedirect } from "@/lib/auth/client-session";
import { canManageIcuLifecycle } from "@/lib/auth/access";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { fetchLeadCommunicationNewCount, LeadCommunicationBoardModal } from "@/components/LeadCommunicationBoardModal";
import { RtAideNotesModal } from "@/components/RtAideNotesModal";
import { LeadOperationalSummary } from "@/components/LeadOperationalSummary";
import { CommandCenterTabs } from "@/components/CommandCenterTabs";

type CommandCenterClientProps = {
  authContext: AuthenticatedUserContext;
  timezone: string;
  showShiftUpdateSaved?: boolean;
};

export function CommandCenterClient({
  authContext,
  timezone,
  showShiftUpdateSaved = false
}: CommandCenterClientProps) {
  const router = useRouter();
  const [rtAideNotesOpen, setRtAideNotesOpen] = useState(false);
  const [leadNotesOpen, setLeadNotesOpen] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [leadNewNoteCount, setLeadNewNoteCount] = useState(0);
  const [successToast, setSuccessToast] = useState(showShiftUpdateSaved ? "Shift update saved" : "");

  useEffect(() => {
    if (!successToast) return;

    const timer = window.setTimeout(() => {
      setSuccessToast("");
      if (showShiftUpdateSaved) {
        router.replace("/command-center", { scroll: false });
      }
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, [router, showShiftUpdateSaved, successToast]);

  const loadLeadNewNoteCount = useCallback(async () => {
    const count = await fetchLeadCommunicationNewCount(authContext.departmentId);
    setLeadNewNoteCount(count);
    setPreviewRevision(value => value + 1);
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
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 lg:px-8">
      {successToast && (
        <p
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-extrabold text-emerald-800 shadow-lg"
        >
          {successToast}
        </p>
      )}
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="py-1 sm:py-2">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
          <h1 className="mt-1 text-3xl font-black leading-tight text-hospital-ink lg:text-4xl">Lead Command Board</h1>
          <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">Lead shift operations</p>
          <CommandCenterTabs variant="board" />
        </header>

        <DepartmentAnnouncementStrip authContext={authContext} timezone={timezone} />

        <LeadOperationalSummary authContext={authContext} timezone={timezone}>
          <LeadNotePreview authContext={authContext} timezone={timezone} onOpen={() => setLeadNotesOpen(true)} onOpenAide={() => setRtAideNotesOpen(true)} newCount={leadNewNoteCount} revision={previewRevision} />
        </LeadOperationalSummary>

        <section aria-labelledby="quick-operations-heading" className="rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 id="quick-operations-heading" className="flex items-center gap-3 text-xl font-bold text-hospital-ink"><Zap size={25} className="fill-blue-600 text-blue-600" aria-hidden="true" />Quick Operations</h2>
            <p className="text-sm font-medium text-slate-600">Common tools for lead shift operations</p>
          </div>
          <div data-testid="lead-action-grid" aria-label="Lead command actions" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Link href="/command-center/shift-update" className={quickOperationClass}><QuickOperation icon={ClipboardList} title="Shift Update" description="Log shift information" /></Link>
            <Link href="/command-center/phone-list" className={quickOperationClass}><QuickOperation icon={Phone} title="Phone List" description="Staff & extensions" /></Link>
            <button type="button" onClick={() => setRtAideNotesOpen(true)} aria-label="Aide Communication Board" className={quickOperationClass}><QuickOperation icon={Users} title="Aide Board" description="Notes & questions" /></button>
            <Link href="/operations/rental-management" className={quickOperationClass}><QuickOperation icon={ShoppingCart} title="Rental Management" description="Equipment & status" /></Link>
            <Link href="/command-center/short-shift-alert" className={quickOperationClass}><QuickOperation icon={CalendarDays} title="Short Shift Alert" description="Manage coverage" /></Link>
          </div>
        </section>

        {canManageIcuLifecycle(authContext) && <IcuCommandCenterClient authContext={authContext} surface="lead" />}

        <button
          type="button"
          onClick={signOut}
          className="inline-flex min-h-12 items-center gap-2 rounded-md px-2 text-sm font-semibold text-slate-500 hover:text-blue-700"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
      <RtAideNotesModal
        authContext={authContext}
        open={rtAideNotesOpen}
        onClose={() => { setRtAideNotesOpen(false); setPreviewRevision(value => value + 1); }}
        onNotesChanged={() => setPreviewRevision(value => value + 1)}
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

const quickOperationClass = "group relative flex min-h-24 w-full items-center gap-3 rounded-xl border border-blue-200 bg-white p-4 pr-9 text-left shadow-sm transition hover:border-blue-500 hover:bg-sky-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 lg:min-h-44 lg:flex-col lg:items-start lg:gap-3";

function QuickOperation({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <>
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700"><Icon size={27} strokeWidth={2.25} aria-hidden="true" /></span>
    <span className="min-w-0 flex-1"><span className="block text-base font-bold leading-6 text-hospital-ink">{title}</span><span className="mt-1 block text-sm font-medium leading-5 text-slate-600">{description}</span></span>
    <ChevronRight size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-700" aria-hidden="true" />
  </>;
}
