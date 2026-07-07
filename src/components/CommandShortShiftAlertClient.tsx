"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ShiftStatusStaffOption } from "@/lib/shift-status/types";
import { createClient } from "@/lib/supabase/client";
import { currentShiftType, formatShiftStatusNumber, getStaffingStatus, staffingStatusLabel, todayInTimezone } from "@/lib/shift-status/utils";

type ShortShiftForm = {
  shiftDate: string;
  shiftType: "day_shift" | "night_shift";
  rtsOn: string;
  rtsRequired: string;
  note: string;
  postedByStaffProfileId: string;
  postedByName: string;
};

function standardTimes(shiftType: "day_shift" | "night_shift") {
  return shiftType === "day_shift"
    ? { shift_start: "06:30", shift_end: "19:00" }
    : { shift_start: "18:30", shift_end: "07:00" };
}

export function CommandShortShiftAlertClient({
  authContext,
  timezone
}: {
  authContext: AuthenticatedUserContext;
  timezone: string;
}) {
  const [activeScheduleVersionId, setActiveScheduleVersionId] = useState("");
  const [staffOptions, setStaffOptions] = useState<ShiftStatusStaffOption[]>([]);
  const [form, setForm] = useState<ShortShiftForm>(() => ({
    shiftDate: todayInTimezone(timezone),
    shiftType: currentShiftType(timezone) === "day" ? "day_shift" : "night_shift",
    rtsOn: "",
    rtsRequired: "",
    note: "",
    postedByStaffProfileId: "",
    postedByName: ""
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      const [{ data: department }, { data: staff }] = await Promise.all([
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

      setActiveScheduleVersionId((department?.active_schedule_version_id as string | null | undefined) ?? "");
      setStaffOptions((staff ?? []) as ShiftStatusStaffOption[]);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authContext.departmentId]);

  const postedBy = useMemo(
    () => staffOptions.find((staff) => staff.id === form.postedByStaffProfileId)?.display_name ?? form.postedByName.trim(),
    [form.postedByName, form.postedByStaffProfileId, staffOptions]
  );
  const staffing = getStaffingStatus(
    form.rtsOn === "" ? null : Number(form.rtsOn),
    form.rtsRequired === "" ? null : Number(form.rtsRequired)
  );
  const canPost = Boolean(
    activeScheduleVersionId &&
      form.shiftDate &&
      form.rtsOn !== "" &&
      form.rtsRequired !== "" &&
      postedBy &&
      staffing.status === "short"
  );

  const postShortShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canPost) {
      setError(
        staffing.status === "staffed"
          ? "Only post a Short Shift Alert when RTs Needed is at least 0.5 above RTs Scheduled."
          : "Shift date, RT counts, and posted-by attribution are required."
      );
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const times = standardTimes(form.shiftType);
    const noteParts = [
      `RTs ${form.rtsOn} scheduled / ${form.rtsRequired} needed`,
      `Short by ${formatShiftStatusNumber(staffing.shortAmount)}`
    ];
    if (form.note.trim()) {
      noteParts.push(form.note.trim());
    }

    const response = await fetch("/api/short-shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule_version_id: activeScheduleVersionId,
        shift_date: form.shiftDate,
        shift_type: form.shiftType,
        shift_start: times.shift_start,
        shift_end: times.shift_end,
        severity: staffing.shortAmount >= 2 ? "urgent" : "short",
        message: noteParts.join(". "),
        posted_by_name: postedBy
      })
    });

    setSaving(false);

    if (!response.ok) {
      setError("Unable to post Short Shift Alert.");
      return;
    }

    setMessage("Short Shift Alert posted.");
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Respiratory Command Center</p>
          <h1 className="mt-2 text-2xl font-black text-hospital-ink">Short Shift Alert</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Post a staffing need for the current shift.
          </p>
          <Link
            href="/command-center"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
          >
            Back to Command Center
          </Link>
        </section>

        <form onSubmit={postShortShift} className="space-y-4">
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Shift date</span>
                <input
                  type="date"
                  value={form.shiftDate}
                  onChange={(event) => setForm((current) => ({ ...current, shiftDate: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Shift</span>
                <select
                  value={form.shiftType}
                  onChange={(event) => setForm((current) => ({ ...current, shiftType: event.target.value as ShortShiftForm["shiftType"] }))}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                >
                  <option value="day_shift">Day Shift</option>
                  <option value="night_shift">Night Shift</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Staffing Need</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">RTs Scheduled</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.rtsOn}
                  onChange={(event) => setForm((current) => ({ ...current, rtsOn: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">RTs Needed</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  inputMode="decimal"
                  value={form.rtsRequired}
                  onChange={(event) => setForm((current) => ({ ...current, rtsRequired: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
              </label>
            </div>
            <p
              className={`mt-3 rounded-2xl px-3 py-2 text-sm font-black ${
                staffing.status === "short"
                  ? "bg-rose-50 text-rose-700"
                  : staffing.status === "staffed"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-50 text-slate-500"
              }`}
            >
              {staffing.status === "short"
                ? `Short by: ${formatShiftStatusNumber(staffing.shortAmount)}`
                : staffingStatusLabel(staffing.status)}
            </p>
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Optional note</span>
              <textarea
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value.slice(0, 140) }))}
                maxLength={140}
                placeholder="Anything staff should know?"
                className="mt-1 min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              />
              <span className="mt-1 flex justify-between gap-3 text-xs font-bold text-slate-500">
                <span>No patient information.</span>
                <span>{form.note.length}/140</span>
              </span>
            </label>
          </section>

          <section className="rounded-3xl border border-cyan-100 bg-cyan-50/80 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Posted By</h2>
            <label className="mt-3 block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Select staff member</span>
              <select
                value={form.postedByStaffProfileId}
                onChange={(event) => setForm((current) => ({ ...current, postedByStaffProfileId: event.target.value, postedByName: "" }))}
                className="mt-1 min-h-11 w-full rounded-2xl border border-cyan-100 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              >
                <option value="">Select staff</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Or enter name/initials</span>
              <input
                value={form.postedByName}
                onChange={(event) => setForm((current) => ({ ...current, postedByStaffProfileId: "", postedByName: event.target.value.slice(0, 120) }))}
                placeholder="Initials or name"
                className="mt-1 min-h-11 w-full rounded-2xl border border-cyan-100 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              />
            </label>
          </section>

          {error && <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
          {message && <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p>}

          <button
            type="submit"
            disabled={saving || !canPost}
            className="min-h-12 w-full rounded-2xl bg-rose-700 px-4 text-sm font-black text-white shadow-md shadow-rose-900/20 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
          >
            {saving ? "Posting..." : "Post Short Shift Alert"}
          </button>
        </form>
      </div>
    </main>
  );
}
