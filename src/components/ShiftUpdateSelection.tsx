"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, CalendarDays, ChevronRight, Moon, Search, Sun } from "lucide-react";
import type { ShiftRecordSelection, ShiftUpdateSelectionOptions } from "@/lib/shift-status/reporting-window";
import { shiftTypeLabel } from "@/lib/shift-status/utils";
import { prominentBackActionClass } from "@/lib/ui/action-styles";

function shortDateLabel(dateValue: string) {
  const [, month, day] = dateValue.split("-");
  return `${month}/${day}`;
}

function selectionHref(selection: ShiftRecordSelection) {
  const params = new URLSearchParams({
    date: selection.shiftDate,
    shift: selection.shiftType
  });
  return `/command-center/shift-update?${params.toString()}`;
}

export function ShiftUpdateSelection({ options }: { options: ShiftUpdateSelectionOptions }) {
  const router = useRouter();
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherDate, setOtherDate] = useState(options[0].shiftDate);
  const [otherShift, setOtherShift] = useState<ShiftRecordSelection["shiftType"]>(options[0].shiftType);

  const continueToShift = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!otherDate) return;
    router.push(selectionHref({ shiftDate: otherDate, shiftType: otherShift }));
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Lead Command Board</p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">Please select shift to update</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          Choose the operational date and shift you intend to update.
        </p>

        <div className="mt-5 grid gap-3">
          {options.map((option) => {
            const Icon = option.shiftType === "day" ? Sun : Moon;
            const isDay = option.shiftType === "day";

            return (
              <Link
                key={`${option.shiftDate}:${option.shiftType}`}
                href={selectionHref(option)}
                className={`flex min-h-20 items-center gap-3 rounded-2xl border px-4 py-3 outline-none transition active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  isDay
                    ? "border-amber-200 bg-amber-50/80 focus-visible:ring-amber-500"
                    : "border-indigo-200 bg-indigo-50/80 focus-visible:ring-indigo-500"
                }`}
              >
                <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ${
                  isDay ? "text-amber-700" : "text-indigo-700"
                }`}>
                  <Icon size={21} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-black text-hospital-ink">
                    {shortDateLabel(option.shiftDate)} {shiftTypeLabel(option.shiftType)}
                  </span>
                  <span className="mt-0.5 block text-xs font-bold text-slate-500">
                    {option.shiftType === "day" ? "Day operations" : "Night operations"}
                  </span>
                </span>
                <ChevronRight size={20} className="shrink-0 text-slate-400" aria-hidden="true" />
              </Link>
            );
          })}

          <button
            type="button"
            aria-expanded={otherOpen}
            aria-controls="other-shift-lookup"
            onClick={() => setOtherOpen((current) => !current)}
            className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-3 text-left outline-none transition active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
              <Search size={20} aria-hidden="true" />
            </span>
            <span className="flex-1 text-base font-black text-hospital-ink">Other Shift</span>
            <ChevronRight
              size={20}
              className={`shrink-0 text-slate-400 transition-transform ${otherOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>

        {otherOpen ? (
          <form id="other-shift-lookup" onSubmit={continueToShift} className="mt-4 rounded-2xl border border-cyan-100 bg-slate-50/80 p-4">
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-cyan-700" aria-hidden="true" />
              <h2 className="font-black text-hospital-ink">Find another shift</h2>
            </div>
            <label className="mt-4 block">
              <span className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Date</span>
              <input
                type="date"
                required
                value={otherDate}
                onChange={(event) => setOtherDate(event.target.value)}
                className="mt-1 h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <fieldset className="mt-3">
              <legend className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Shift</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(["day", "night"] as const).map((shiftType) => (
                  <button
                    key={shiftType}
                    type="button"
                    aria-pressed={otherShift === shiftType}
                    onClick={() => setOtherShift(shiftType)}
                    className={`min-h-11 rounded-2xl border px-3 text-sm font-black outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 ${
                      otherShift === shiftType
                        ? "border-cyan-700 bg-cyan-700 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {shiftTypeLabel(shiftType)}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              type="submit"
              className="mt-4 min-h-12 w-full rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20"
            >
              Continue
            </button>
          </form>
        ) : null}

        <Link
          href="/command-center"
          className={`${prominentBackActionClass} mt-5 w-full`}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Back to Command Center
        </Link>
      </section>
    </main>
  );
}
