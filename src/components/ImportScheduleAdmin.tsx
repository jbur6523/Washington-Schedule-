"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type {
  ScheduleImportCommitResult,
  ScheduleImportPreview,
  ScheduleImportPreviewRow,
  ScheduleImportResolution
} from "@/lib/schedule-import/types";
import { shiftTypeLabels, type ShiftType } from "@/lib/schedule/supabase-schedule";

type ImportScheduleAdminProps = { authContext: AuthenticatedUserContext };
type Step = "paste" | "review" | "upload";

const steps: Array<{ id: Step; label: string }> = [
  { id: "paste", label: "Paste Code" },
  { id: "review", label: "Review" },
  { id: "upload", label: "Upload" }
];

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T12:00:00Z`));
}

function dispositionLabel(row: ScheduleImportPreviewRow) {
  const labels = {
    new: "Ready to add",
    exact_duplicate: "Already on schedule — will be skipped",
    needs_review: "Needs review",
    internal_duplicate: "Duplicate inside pasted code",
    conflict: "Conflicts with an existing row",
    excluded: "Excluded"
  };
  return labels[row.disposition];
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-3 py-3 shadow-sm">
      <p className="text-2xl font-black text-hospital-ink">{value}</p>
      <p className="mt-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

export function ImportScheduleAdmin({ authContext }: ImportScheduleAdminProps) {
  const [step, setStep] = useState<Step>("paste");
  const [sourceCode, setSourceCode] = useState("");
  const [preview, setPreview] = useState<ScheduleImportPreview | null>(null);
  const [resolutions, setResolutions] = useState<ScheduleImportResolution[]>([]);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScheduleImportCommitResult | null>(null);
  const [resultMessage, setResultMessage] = useState("");

  const attentionRows = useMemo(
    () => preview?.rows.filter((row) =>
      row.disposition === "needs_review"
      || row.disposition === "internal_duplicate"
      || row.disposition === "conflict"
      || row.disposition === "excluded"
    ) ?? [],
    [preview]
  );

  const requestPreview = async (nextResolutions = resolutions) => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/schedule-imports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCode, resolutions: nextResolutions })
      });
      const body = await response.json().catch(() => ({})) as {
        preview?: ScheduleImportPreview;
        message?: string;
        code?: string;
      };
      if (!response.ok || !body.preview) {
        setError(body.message ?? "Schedule Code could not be reviewed.");
        return;
      }
      setPreview(body.preview);
      setReviewDirty(false);
      setStep("review");
    } catch {
      setError("Schedule Code could not be reviewed. Check the local server and try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateResolution = (
    row: ScheduleImportPreviewRow,
    patch: Omit<ScheduleImportResolution, "lineNumber">
  ) => {
    setResolutions((current) => {
      const previous = current.find((item) => item.lineNumber === row.lineNumber) ?? {
        lineNumber: row.lineNumber
      };
      return [
        ...current.filter((item) => item.lineNumber !== row.lineNumber),
        { ...previous, ...patch }
      ];
    });
    setPreview((current) => current ? {
      ...current,
      rows: current.rows.map((item) => item.lineNumber === row.lineNumber ? {
        ...item,
        ...(patch.staffProfileId !== undefined ? {
          staffProfileId: patch.staffProfileId,
          staffDisplayName: current.staff.find((staff) => staff.id === patch.staffProfileId)?.displayName ?? ""
        } : {}),
        ...(patch.shiftDate !== undefined ? { shiftDate: patch.shiftDate } : {}),
        ...(patch.shiftType !== undefined ? { shiftType: patch.shiftType } : {}),
        ...(patch.shiftStart !== undefined ? { shiftStart: patch.shiftStart } : {}),
        ...(patch.shiftEnd !== undefined ? { shiftEnd: patch.shiftEnd } : {}),
        ...(patch.entryStatus !== undefined ? { entryStatus: patch.entryStatus } : {}),
        ...(patch.isShiftLead !== undefined ? { isShiftLead: patch.isShiftLead } : {}),
        ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
        ...(patch.message !== undefined ? { message: patch.message } : {}),
        ...(patch.excluded !== undefined ? {
          excluded: patch.excluded,
          exclusionReason: patch.exclusionReason ?? item.exclusionReason,
          disposition: patch.excluded ? "excluded" : item.disposition
        } : {})
      } : item)
    } : current);
    setReviewDirty(true);
  };

  const commitImport = async () => {
    if (!preview || reviewDirty) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/schedule-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCode,
          resolutions,
          expectedVersionId: preview.activeVersion.id,
          sourceHash: preview.sourceHash
        })
      });
      const body = await response.json().catch(() => ({})) as {
        result?: ScheduleImportCommitResult;
        message?: string;
      };
      if (!response.ok || !body.result) {
        setError(body.message ?? "No schedule update was confirmed.");
        return;
      }
      setResult(body.result);
      setResultMessage(body.message ?? "Schedule Updated");
    } catch {
      setError("No schedule update was confirmed. Retrying the same Schedule Code is safe.");
    } finally {
      setLoading(false);
    }
  };

  const resetToPaste = () => {
    setStep("paste");
    setPreview(null);
    setResolutions([]);
    setReviewDirty(false);
    setResult(null);
    setResultMessage("");
    setError("");
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-hospital-ink">
      <div className="mx-auto w-full max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-extrabold text-cyan-700">
          <ArrowLeft size={16} /> Back to Admin
        </Link>
        <div className="mt-4 rounded-3xl border border-cyan-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-700">WHHS Schedule</p>
          <h1 className="mt-1 text-3xl font-black">Import Schedule</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Add Schedule Code to the current active schedule. Existing exact rows are safely skipped.
          </p>
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">
            Privacy: Schedule Code must contain staffing data only. Never paste patient names, medical record numbers, or other patient information.
          </p>
        </div>

        <ol aria-label="Import progress" className="mt-4 grid grid-cols-3 gap-2">
          {steps.map((item, index) => {
            const currentIndex = steps.findIndex((candidate) => candidate.id === step);
            const active = index <= currentIndex;
            return (
              <li key={item.id} className={`rounded-2xl px-3 py-3 text-center text-xs font-black ${
                active ? "bg-cyan-700 text-white" : "border border-slate-200 bg-white text-slate-400"
              }`}>
                {index + 1}. {item.label}
              </li>
            );
          })}
        </ol>

        {step === "paste" && (
          <section className="mt-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Paste Code</h2>
            <label className="mt-4 block">
              <span className="text-sm font-extrabold text-slate-700">Paste Schedule Code</span>
              <textarea
                value={sourceCode}
                onChange={(event) => setSourceCode(event.target.value)}
                rows={18}
                spellCheck={false}
                placeholder={"SCHEDULE_VERSION | Week 2 Daily RVU Sheets | 2026-08-23 | 2026-08-26\n\nENTRY | 2026-08-23 | day_shift | 06:30 | 19:00 | localadmin | scheduled | lead\nSHORT_SHIFT | 2026-08-24 | night_shift | 18:30 | 07:00 | short | Night shift short one RT"}
                className="mt-2 w-full rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4 font-mono text-sm leading-6 outline-none focus:border-cyan-400"
              />
            </label>
            <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
              SCHEDULE_VERSION is optional metadata only. Imports always append to the active published schedule.
            </p>
            <button
              type="button"
              onClick={() => void requestPreview([])}
              disabled={loading || !sourceCode.trim()}
              className="mt-4 min-h-12 w-full rounded-2xl bg-cyan-700 px-4 text-base font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Parsing..." : "Parse & Review"}
            </button>
          </section>
        )}

        {step === "review" && preview && (
          <section className="mt-4 space-y-4">
            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">Review</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Adding to <span className="text-cyan-800">{preview.activeVersion.label}</span>
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryCard label="ENTRY rows" value={preview.summary.entryRows} />
                <SummaryCard label="SHORT_SHIFT rows" value={preview.summary.shortShiftRows} />
                <SummaryCard label="Matched" value={preview.summary.matched} />
                <SummaryCard label="New" value={preview.summary.newRows} />
                <SummaryCard label="Duplicates skipped" value={preview.summary.duplicatesSkipped} />
                <SummaryCard label="Needs review" value={preview.summary.unresolved + preview.summary.internalDuplicates} />
                <SummaryCard label="Conflicts" value={preview.summary.conflicts} />
                <SummaryCard label="Dates" value={preview.summary.uniqueDates} />
              </div>
              <p className="mt-4 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-600">
                {formatDate(preview.summary.firstDate)} – {formatDate(preview.summary.lastDate)} · Projected schedule range {formatDate(preview.resultingRange.startsOn)} – {formatDate(preview.resultingRange.endsOn)}
              </p>
            </div>

            {attentionRows.length > 0 && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-center gap-2 text-amber-900">
                  <AlertTriangle size={18} />
                  <h3 className="text-lg font-black">Rows requiring attention</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {attentionRows.map((row) => (
                    <ReviewRowEditor
                      key={row.lineNumber}
                      row={row}
                      staff={preview.staff}
                      onChange={(patch) => updateResolution(row, patch)}
                    />
                  ))}
                </div>
              </div>
            )}

            <details className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer text-sm font-black text-cyan-800">View All Rows</summary>
              <div className="mt-4 space-y-2">
                {preview.rows.map((row) => (
                  <div key={`all-${row.lineNumber}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm">
                    <p className="font-black">Line {row.lineNumber > 0 ? row.lineNumber : "document"}: {dispositionLabel(row)}</p>
                    <p className="mt-1 break-words font-mono text-xs text-slate-500">{row.sourceLine || row.issues.join(" ")}</p>
                  </div>
                ))}
              </div>
            </details>

            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={resetToPaste} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 font-black text-slate-600">
                Back to Paste Code
              </button>
              {reviewDirty ? (
                <button type="button" onClick={() => void requestPreview()} disabled={loading} className="min-h-12 rounded-2xl bg-cyan-700 px-4 font-black text-white disabled:opacity-60">
                  {loading ? "Reviewing..." : "Apply Review Changes"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep("upload")}
                  disabled={!preview.canCommit}
                  className="min-h-12 rounded-2xl bg-cyan-700 px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {preview.canCommit ? "Continue to Upload" : "Resolve Attention Rows"}
                </button>
              )}
            </div>
          </section>
        )}

        {step === "upload" && preview && (
          <section className="mt-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            {!result ? (
              <>
                <h2 className="text-xl font-black">Upload</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                  Confirm the verified plan for <span className="text-cyan-800">{preview.activeVersion.label}</span>.
                </p>
                <dl className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100 px-4">
                  {[
                    ["Expected new rows", preview.summary.newRows],
                    ["Existing duplicates to skip", preview.summary.duplicatesSkipped],
                    ["Short Shift source rows", preview.summary.shortShiftRows],
                    ["Conflicts", preview.summary.conflicts],
                    ["Affected dates", `${formatDate(preview.summary.firstDate)} – ${formatDate(preview.summary.lastDate)}`],
                    ["Resulting schedule range", `${formatDate(preview.resultingRange.startsOn)} – ${formatDate(preview.resultingRange.endsOn)}`]
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 py-3 text-sm">
                      <dt className="font-bold text-slate-500">{label}</dt>
                      <dd className="text-right font-black text-hospital-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => setStep("review")} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 font-black text-slate-600">
                    Back to Review
                  </button>
                  <button type="button" onClick={() => void commitImport()} disabled={loading || !preview.canCommit} className="min-h-12 rounded-2xl bg-cyan-700 px-4 font-black text-white disabled:opacity-60">
                    {loading ? "Adding..." : "Add to Schedule"}
                  </button>
                </div>
              </>
            ) : (
              <div className={result.independentlyVerified ? "text-center" : "text-center text-amber-900"}>
                {result.independentlyVerified ? <CheckCircle2 className="mx-auto text-emerald-600" size={46} /> : <AlertTriangle className="mx-auto" size={46} />}
                <h2 className="mt-3 text-2xl font-black">{resultMessage}</h2>
                <p className="mt-3 text-sm font-bold leading-6 text-slate-600">
                  {result.independentlyVerified
                    ? `${result.insertedCount} / ${result.insertedCount} new rows verified`
                    : `${result.insertedCount} new rows reported by the database; independent verification is incomplete`}<br />
                  {result.duplicateCount} existing rows safely skipped<br />
                  {result.conflictCount} conflicts · {result.firstDate && result.lastDate ? `${formatDate(result.firstDate)} – ${formatDate(result.lastDate)}` : "No dates changed"}<br />
                  Schedule range: {formatDate(result.startsOn)} – {formatDate(result.endsOn)}
                </p>
                <button type="button" onClick={resetToPaste} className="mt-5 min-h-12 rounded-2xl border border-cyan-200 bg-cyan-50 px-5 font-black text-cyan-800">
                  Import More Schedule Code
                </button>
              </div>
            )}
          </section>
        )}

        {error && (
          <div role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-800">
            {error}
            {error.startsWith("No active published schedule") && (
              <> <Link href="/admin/schedule-versions" className="underline">Open Schedule Versions</Link>.</>
            )}
          </div>
        )}
        <p className="mt-4 text-center text-xs font-bold text-slate-400">
          Signed in as {authContext.displayName}. No schedule version is created by this workflow.
        </p>
      </div>
    </main>
  );
}

function ReviewRowEditor({
  row,
  staff,
  onChange
}: {
  row: ScheduleImportPreviewRow;
  staff: ScheduleImportPreview["staff"];
  onChange: (patch: Omit<ScheduleImportResolution, "lineNumber">) => void;
}) {
  if (row.kind === "invalid") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-white p-4">
        <p className="font-black text-rose-800">Document issue</p>
        {row.issues.map((issue) => <p key={issue} className="mt-1 text-sm font-bold text-rose-700">{issue}</p>)}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border bg-white p-4 ${row.excluded ? "border-slate-200 opacity-75" : "border-amber-200"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black">Line {row.lineNumber}: {dispositionLabel(row)}</p>
        <button
          type="button"
          onClick={() => onChange({
            excluded: !row.excluded,
            exclusionReason: row.excluded ? "" : "Excluded during administrator review"
          })}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-black text-slate-600"
        >
          {row.excluded ? "Include row" : "Exclude row"}
        </button>
      </div>
      {row.issues.map((issue) => <p key={issue} className="mt-1 text-xs font-bold text-rose-700">{issue}</p>)}
      {!row.excluded && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-extrabold text-slate-600">
            Date
            <input type="date" value={row.shiftDate} onChange={(event) => onChange({ shiftDate: event.target.value })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-2" />
          </label>
          <label className="text-xs font-extrabold text-slate-600">
            Shift
            <select value={row.shiftType} onChange={(event) => onChange({ shiftType: event.target.value as ShiftType })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-2">
              <option value="">Select</option>
              {Object.entries(shiftTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs font-extrabold text-slate-600">
            Start
            <input type="time" value={row.shiftStart} onChange={(event) => onChange({ shiftStart: event.target.value })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-2" />
          </label>
          <label className="text-xs font-extrabold text-slate-600">
            End
            <input type="time" value={row.shiftEnd} onChange={(event) => onChange({ shiftEnd: event.target.value })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-2" />
          </label>
          {row.kind === "entry" ? (
            <>
              <label className="text-xs font-extrabold text-slate-600 sm:col-span-2">
                Staff Directory profile
                <select value={row.staffProfileId} onChange={(event) => onChange({ staffProfileId: event.target.value })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-2">
                  <option value="">Select staff</option>
                  {staff.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} ({profile.username})</option>)}
                </select>
              </label>
              <label className="text-xs font-extrabold text-slate-600">
                Status
                <select value={row.entryStatus} onChange={(event) => onChange({ entryStatus: event.target.value as "scheduled" | "available" })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-2">
                  <option value="scheduled">Scheduled</option>
                  <option value="available">Available</option>
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-xs font-extrabold text-slate-600">
                <input type="checkbox" checked={row.isShiftLead} onChange={(event) => onChange({ isShiftLead: event.target.checked })} className="h-5 w-5" /> Shift Lead
              </label>
            </>
          ) : (
            <>
              <label className="text-xs font-extrabold text-slate-600">
                Severity
                <select value={row.severity} onChange={(event) => onChange({ severity: event.target.value as "short" | "urgent" })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-2">
                  <option value="short">Short</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label className="text-xs font-extrabold text-slate-600 sm:col-span-3">
                Message
                <input value={row.message} maxLength={140} onChange={(event) => onChange({ message: event.target.value })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-2" />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
