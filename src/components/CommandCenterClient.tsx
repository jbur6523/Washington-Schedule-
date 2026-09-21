"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronRight, ClipboardList, LogOut, Phone, ShoppingCart, Users, type LucideIcon } from "lucide-react";
import { DepartmentAnnouncementStrip } from "@/components/DepartmentAnnouncement";
import { IcuSnapshotPreview, LeadNotePreview } from "@/components/LeadBoardPreviews";
import { signOutAndRedirect } from "@/lib/auth/client-session";
import { canViewIcuCommandCenter } from "@/lib/auth/access";
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
          <LeadNotePreview authContext={authContext} timezone={timezone} onOpen={() => setLeadNotesOpen(true)} newCount={leadNewNoteCount} revision={previewRevision} />
        </LeadOperationalSummary>

        <section aria-labelledby="quick-operations-heading">
          <h2 id="quick-operations-heading" className="mb-3 text-lg font-bold text-hospital-ink">Quick Operations</h2>
          <div data-testid="lead-action-grid" aria-label="Lead command actions" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Link href="/command-center/shift-update" className={quickOperationClass}><QuickOperation icon={ClipboardList} title="Shift Update" description="Log shift information" /></Link>
            <Link href="/command-center/phone-list" className={quickOperationClass}><QuickOperation icon={Phone} title="Phone List" description="Staff & extensions" /></Link>
            <button type="button" onClick={() => setRtAideNotesOpen(true)} aria-label="Aide Communication Board" className={quickOperationClass}><QuickOperation icon={Users} title="Aide Board" description="Notes & questions" /></button>
            <Link href="/operations/rental-management" className={quickOperationClass}><QuickOperation icon={ShoppingCart} title="Rental Management" description="Equipment & status" /></Link>
            <Link href="/command-center/short-shift-alert" className={quickOperationClass}><QuickOperation icon={CalendarDays} title="Short Shift Alert" description="Manage coverage" /></Link>
          </div>
        </section>

        <IcuSnapshotPreview departmentId={authContext.departmentId} enabled={canViewIcuCommandCenter(authContext)} />

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

const quickOperationClass = "flex min-h-20 w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/50 focus-visible:ring-2 focus-visible:ring-blue-600";

function QuickOperation({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <>
    <Icon size={23} className="shrink-0 text-blue-600" aria-hidden="true" />
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-5 text-hospital-ink">{title}</span><span className="mt-0.5 block text-xs leading-4 text-slate-500">{description}</span></span>
    <ChevronRight size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
  </>;
}
