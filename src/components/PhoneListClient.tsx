"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from "react";
import { ArrowLeft, Check, LoaderCircle, Phone, Printer, Save, Users } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { PhoneListPrintLayout } from "@/components/PhoneListPrintLayout";
import printStyles from "@/components/PhoneListPrintLayout.module.css";
import { phoneListSections } from "@/lib/phone-list/rows";
import type {
  PhoneListAssignment,
  PhoneListDirectoryStaff,
  PhoneListDraftRow,
  PhoneListRosterMember,
  PhoneListScheduleEntry,
  PhoneListScheduleOverride,
  PhoneListShiftType
} from "@/lib/phone-list/types";
import {
  applyRosterShortcut,
  assignmentsFromDraft,
  buildScheduledRoster,
  directoryMatch,
  emptyPhoneListAssignments,
  enterManualName,
  selectStaffForAssignment,
  updatePhoneForAssignment
} from "@/lib/phone-list/utils";
import { currentShiftStatusWindow } from "@/lib/shift-status/utils";
import { createClient } from "@/lib/supabase/client";

type PhoneListClientProps = {
  authContext: AuthenticatedUserContext;
  timezone: string;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const controlClass =
  "h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";

const assignmentControlClass =
  "h-11 min-w-0 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";

function formatDraftTime(value: string | null, timezone: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function saveErrorMessage(code: string | undefined) {
  if (code === "42501") {
    return "Your account no longer has permission to save this phone list.";
  }

  if (code === "PGRST202" || code === "42883" || code === "42P01") {
    return "Phone List setup is not available yet. Ask an administrator to verify the migration.";
  }

  if (code === "23503") {
    return "A selected staff record is no longer available. Reload the roster and try again.";
  }

  return "The phone-list draft could not be saved. Your entries remain on this screen. (PL-SAVE)";
}

function Roster({
  roster,
  loading
}: {
  roster: PhoneListRosterMember[];
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-sm font-bold text-slate-500">Loading scheduled staff…</p>;
  }

  if (roster.length === 0) {
    return <p className="text-sm font-bold leading-6 text-slate-500">No scheduled staff found for this date and shift.</p>;
  }

  return (
    <ol className="space-y-2">
      {roster.map((staff) => (
        <li key={staff.id} className="flex gap-2 text-sm font-bold text-slate-700">
          <span className="w-6 shrink-0 text-right font-black text-cyan-700">{staff.rosterNumber}.</span>
          <span>{staff.displayName}</span>
        </li>
      ))}
    </ol>
  );
}

export function PhoneListClient({ authContext, timezone }: PhoneListClientProps) {
  const initialWindow = useMemo(() => currentShiftStatusWindow(timezone), [timezone]);
  const [scheduleDate, setScheduleDate] = useState(initialWindow.shiftDate);
  const [shiftType, setShiftType] = useState<PhoneListShiftType>(initialWindow.shiftType);
  const [directory, setDirectory] = useState<PhoneListDirectoryStaff[]>([]);
  const [roster, setRoster] = useState<PhoneListRosterMember[]>([]);
  const [assignments, setAssignments] = useState<PhoneListAssignment[]>(emptyPhoneListAssignments);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [printError, setPrintError] = useState("");
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);
  const saveInFlightRef = useRef(false);

  const loadPhoneList = useCallback(async () => {
    const loadSequence = ++loadSequenceRef.current;
    setLoading(true);
    setLoadError("");
    setSaveError("");
    setRoster([]);
    setAssignments(emptyPhoneListAssignments());
    setDraftUpdatedAt(null);
    setSaveState("idle");

    const supabase = createClient();
    const [{ data: department, error: departmentError }, { data: staffRows, error: staffError }] =
      await Promise.all([
        supabase
          .from("departments")
          .select("active_schedule_version_id")
          .eq("id", authContext.departmentId)
          .maybeSingle(),
        supabase
          .from("staff_profiles")
          .select("id, display_name")
          .eq("department_id", authContext.departmentId)
          .eq("is_active", true)
          .order("display_name", { ascending: true })
      ]);

    if (loadSequence !== loadSequenceRef.current) {
      return;
    }

    if (departmentError || staffError) {
      setLoading(false);
      setLoadError("The schedule or active staff directory could not be loaded.");
      return;
    }

    const activeScheduleVersionId = department?.active_schedule_version_id as string | null | undefined;
    const entriesRequest = activeScheduleVersionId
      ? supabase
          .from("schedule_entries")
          .select("id, staff_profile_id, shift_type, entry_status, staff_profiles(id, display_name)")
          .eq("schedule_version_id", activeScheduleVersionId)
          .eq("shift_date", scheduleDate)
          .order("shift_start", { ascending: true })
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null });

    const [
      { data: entryRows, error: entriesError },
      { data: overrideRows, error: overridesError },
      { data: draftRow, error: draftError }
    ] = await Promise.all([
      entriesRequest,
      supabase
        .from("user_schedule_overrides")
        .select(
          "id, staff_profile_id, base_schedule_entry_id, override_type, shift_type, is_active, staff_profiles(id, display_name)"
        )
        .eq("department_id", authContext.departmentId)
        .eq("shift_date", scheduleDate)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("phone_list_drafts")
        .select(
          "id, schedule_date, shift_type, updated_at, phone_list_assignments(row_key, selected_staff_profile_id, staff_name_snapshot, phone_number)"
        )
        .eq("department_id", authContext.departmentId)
        .eq("schedule_date", scheduleDate)
        .eq("shift_type", shiftType)
        .maybeSingle()
    ]);

    if (loadSequence !== loadSequenceRef.current) {
      return;
    }

    if (entriesError || overridesError) {
      setLoading(false);
      setLoadError("The selected shift roster could not be loaded.");
      return;
    }

    if (draftError) {
      setLoading(false);
      setLoadError(
        draftError.code === "42P01" || draftError.code === "PGRST205"
          ? "Phone List setup is not available yet. Ask an administrator to verify the migration."
          : "The saved phone-list draft could not be loaded."
      );
      return;
    }

    const nextDirectory = (staffRows ?? []).map((staff) => ({
      id: staff.id as string,
      displayName: staff.display_name as string
    }));
    const nextDraft = (draftRow ?? null) as unknown as PhoneListDraftRow | null;

    setDirectory(nextDirectory);
    setRoster(
      buildScheduledRoster(
        (entryRows ?? []) as unknown as PhoneListScheduleEntry[],
        (overrideRows ?? []) as unknown as PhoneListScheduleOverride[],
        shiftType
      )
    );
    setAssignments(assignmentsFromDraft(nextDraft));
    setDraftUpdatedAt(nextDraft?.updated_at ?? null);
    setSaveState(nextDraft ? "saved" : "idle");
    setLoading(false);
  }, [authContext.departmentId, scheduleDate, shiftType]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPhoneList();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadPhoneList]);

  useEffect(() => {
    if (saveState !== "dirty") {
      return undefined;
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [saveState]);

  const markChanged = (nextAssignments: PhoneListAssignment[]) => {
    setAssignments(nextAssignments);
    setSaveState("dirty");
    setSaveError("");
  };

  const changeSelection = (nextDate: string, nextShift: PhoneListShiftType) => {
    if (!nextDate || (nextDate === scheduleDate && nextShift === shiftType)) {
      return;
    }

    if (
      saveState === "dirty" &&
      !window.confirm("This phone list has unsaved changes. Continue without saving?")
    ) {
      return;
    }

    setScheduleDate(nextDate);
    setShiftType(nextShift);
    setSaveState("idle");
  };

  const handleNameChange = (rowKey: string, value: string) => {
    if (/^\d+$/.test(value.trim())) {
      markChanged(
        assignments.map((assignment) =>
          assignment.rowKey === rowKey
            ? { ...assignment, staffNameSnapshot: value }
            : assignment
        )
      );
      return;
    }

    const exactDirectoryMatch = directoryMatch(directory, value);
    markChanged(
      exactDirectoryMatch
        ? selectStaffForAssignment(assignments, rowKey, exactDirectoryMatch)
        : enterManualName(assignments, rowKey, value)
    );
  };

  const commitNumericShortcut = (rowKey: string, value: string) => {
    if (!/^\d+$/.test(value.trim())) {
      return;
    }

    const nextAssignments = applyRosterShortcut(assignments, rowKey, value, roster);

    if (nextAssignments !== assignments) {
      markChanged(nextAssignments);
      return;
    }

    markChanged(enterManualName(assignments, rowKey, value));
  };

  const handleStaffKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    rowKey: string,
    value: string
  ) => {
    if ((event.key === "Enter" || event.key === "Tab") && /^\d+$/.test(value.trim())) {
      if (event.key === "Enter") {
        event.preventDefault();
      }

      commitNumericShortcut(rowKey, value);
    }
  };

  const saveDraft = async () => {
    if (saveInFlightRef.current) {
      return;
    }

    saveInFlightRef.current = true;
    setSaveState("saving");
    setSaveError("");

    const supabase = createClient();
    const { error } = await supabase.rpc("save_phone_list_draft", {
      p_department_id: authContext.departmentId,
      p_schedule_date: scheduleDate,
      p_shift_type: shiftType,
      p_assignments: assignments.map((assignment) => ({
        row_key: assignment.rowKey,
        selected_staff_profile_id: assignment.staffProfileId,
        staff_name_snapshot: assignment.staffNameSnapshot || null,
        phone_number: assignment.phoneNumber || null
      }))
    });

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Phone List save failed", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
      }

      setSaveState("error");
      setSaveError(saveErrorMessage(error.code));
      saveInFlightRef.current = false;
      return;
    }

    setDraftUpdatedAt(new Date().toISOString());
    setSaveState("saved");
    saveInFlightRef.current = false;
  };

  const printPhoneList = () => {
    setPrintError("");

    try {
      if (typeof window.print !== "function") {
        throw new Error("Printing is unavailable.");
      }

      window.print();
    } catch {
      setPrintError("Printing is not available in this browser. Your phone list has not changed.");
    }
  };

  const saveLabel =
    saveState === "saving"
      ? "Saving"
      : saveState === "saved"
        ? "Saved"
        : saveState === "dirty"
          ? "Unsaved changes"
          : "Not saved yet";

  return (
    <main className={`${printStyles.page} min-h-screen px-3 py-5 sm:px-5 sm:py-8`}>
      <div className={printStyles.screen}>
        <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <Link
            href="/command-center"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl text-sm font-extrabold text-cyan-800"
          >
            <ArrowLeft size={18} />
            Lead Command Board
          </Link>
          <div className="mt-3 flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
              <Phone size={24} />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Respiratory operations</p>
              <h1 className="mt-1 text-3xl font-black text-hospital-ink">Phone List</h1>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                Staff assignments and department extensions only. Do not enter patient information.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft sm:p-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Phone-list date</span>
              <input
                type="date"
                value={scheduleDate}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  changeSelection(event.target.value, shiftType)
                }
                className={`mt-1 ${controlClass}`}
                disabled={loading || saveState === "saving"}
              />
            </label>

            <fieldset>
              <legend className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Shift</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(["day", "night"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={shiftType === option}
                    onClick={() => changeSelection(scheduleDate, option)}
                    disabled={loading || saveState === "saving"}
                    className={`min-h-11 rounded-2xl border px-3 text-sm font-black transition ${
                      shiftType === option
                        ? "border-cyan-600 bg-cyan-600 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {option === "day" ? "Day Shift" : "Night Shift"}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div aria-live="polite" className="min-h-5 text-sm font-extrabold">
              {saveState === "saving" && (
                <span className="inline-flex items-center gap-2 text-cyan-700">
                  <LoaderCircle className="animate-spin" size={16} />
                  Saving
                </span>
              )}
              {saveState === "saved" && (
                <span className="inline-flex items-center gap-2 text-emerald-700">
                  <Check size={16} />
                  Saved{draftUpdatedAt ? ` ${formatDraftTime(draftUpdatedAt, timezone)}` : ""}
                </span>
              )}
              {(saveState === "idle" || saveState === "dirty") && (
                <span className={saveState === "dirty" ? "text-amber-700" : "text-slate-500"}>{saveLabel}</span>
              )}
              {saveState === "error" && <span className="text-red-700">Save failed</span>}
            </div>
            <div className="w-full sm:w-auto">
              <button
                type="button"
                onClick={() => void saveDraft()}
                disabled={loading || saveState === "saving" || Boolean(loadError)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-5 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveState === "saving" ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}
                Save Draft
              </button>
            </div>
          </div>

          {loadError && (
            <p role="alert" className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
              {loadError}
            </p>
          )}
          {saveError && (
            <p role="alert" className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
              {saveError}
            </p>
          )}
          {printError && (
            <p role="alert" className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
              {printError}
            </p>
          )}
        </section>

        <details className="rounded-3xl border border-cyan-100 bg-cyan-50/95 p-4 shadow-soft lg:hidden">
          <summary className="cursor-pointer text-sm font-black text-cyan-900">
            Scheduled roster ({roster.length})
          </summary>
          <div className="mt-4 max-h-72 overflow-y-auto pr-2">
            <Roster roster={roster} loading={loading} />
          </div>
        </details>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section className="space-y-3">
            <datalist id="phone-list-active-staff">
              {directory.map((staff) => (
                <option key={staff.id} value={staff.displayName} />
              ))}
            </datalist>

            {phoneListSections.map((section) => (
              <fieldset
                key={section.key}
                disabled={loading || Boolean(loadError)}
                className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-soft sm:p-4"
              >
                <legend className="sr-only">
                  {section.label}
                </legend>
                <h2 className="mb-2 px-1 text-sm font-black uppercase tracking-wide text-hospital-ink sm:text-base">
                  {section.label}
                </h2>
                <div className="space-y-2">
                  {section.rows.map((row) => {
                    const assignment = assignments.find((item) => item.rowKey === row.key);

                    if (!assignment) {
                      return null;
                    }

                    return (
                      <div
                        key={row.key}
                        data-testid={`assignment-row-${row.key}`}
                        className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                      >
                        <p className="mb-2 text-sm font-black leading-5 text-slate-700">{row.label}</p>
                        <div
                          data-testid={`assignment-fields-${row.key}`}
                          className="grid min-w-0 grid-cols-[minmax(0,1fr)_clamp(5.625rem,28vw,7.1875rem)] gap-2 max-[319px]:grid-cols-1"
                        >
                          <label className="block min-w-0">
                            <span className="sr-only">{row.label} staff name</span>
                          <input
                            type="text"
                            list="phone-list-active-staff"
                            value={assignment.staffNameSnapshot}
                            onChange={(event) => handleNameChange(row.key, event.target.value)}
                            onKeyDown={(event) =>
                              handleStaffKeyDown(event, row.key, assignment.staffNameSnapshot)
                            }
                            onBlur={() => commitNumericShortcut(row.key, assignment.staffNameSnapshot)}
                            placeholder="Roster # or staff name"
                            aria-label={`${row.label} staff name`}
                            autoComplete="off"
                            data-testid={`staff-name-${row.key}`}
                            className={assignmentControlClass}
                          />
                          </label>
                          <label className="block min-w-0 max-[319px]:max-w-[7.1875rem]">
                            <span className="sr-only">{row.label} extension</span>
                          <input
                            type="text"
                            inputMode="tel"
                            value={assignment.phoneNumber}
                            onChange={(event) =>
                              markChanged(
                                updatePhoneForAssignment(assignments, row.key, event.target.value)
                              )
                            }
                            placeholder="Ext."
                            aria-label={`${row.label} extension`}
                            maxLength={30}
                            data-testid={`phone-number-${row.key}`}
                            className={assignmentControlClass}
                          />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <button
              type="button"
              onClick={printPhoneList}
              disabled={loading || Boolean(loadError)}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer size={18} />
              Print Phone List
            </button>
          </section>

          <aside className="sticky top-5 hidden max-h-[calc(100vh-2.5rem)] overflow-y-auto rounded-3xl border border-cyan-100 bg-cyan-50/95 p-5 shadow-soft lg:block">
            <div className="mb-4 flex items-center gap-2 text-cyan-900">
              <Users size={20} />
              <h2 className="text-lg font-black">Scheduled roster</h2>
            </div>
            <p className="mb-4 text-xs font-bold leading-5 text-cyan-900/70">
              Enter a roster number in any Staff Name field, then press Enter or Tab.
            </p>
            <Roster roster={roster} loading={loading} />
          </aside>
        </div>
      </div>
      </div>
      <PhoneListPrintLayout
        scheduleDate={scheduleDate}
        shiftType={shiftType}
        assignments={assignments}
      />
    </main>
  );
}
