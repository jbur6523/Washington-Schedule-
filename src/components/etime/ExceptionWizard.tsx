"use client";
import { useState } from "react";
import {
  categories,
  formatClockInput,
  periodStart,
  type EtimeForm,
  type Entry,
  type Category,
  type Identity,
} from "@/lib/etime/model";
import { Signature } from "./Signature";
export function ExceptionWizard({
  identity,
  entry,
  today,
  busy,
  forms,
  onCancel,
  onSave,
}: {
  identity: Identity;
  entry?: Entry;
  today: string;
  busy: boolean;
  forms: EtimeForm[];
  onCancel: () => void;
  onSave: (
    entry: Record<string, string>,
    name: string,
    adopted: boolean,
  ) => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    date: entry?.date ?? today,
    category: entry?.category ?? "lunch",
    reason: entry?.reason ?? "",
    clock_in: entry?.clock_in ?? "",
    clock_out: entry?.clock_out ?? "",
    lunch_out: entry?.lunch_out ?? "",
    lunch_in: entry?.lunch_in ?? "",
    hours: entry?.hours ?? "",
    department_cost_center: entry?.department_cost_center ?? "",
    job_code_transfer: entry?.job_code_transfer ?? "",
  }));
  const set = (key: string, value: string) =>
    setDraft({ ...draft, [key]: value });
  const fields =
    draft.category === "lunch"
      ? [
          ["lunch_out", "Lunch OUT"],
          ["lunch_in", "Lunch IN"],
        ]
      : draft.category === "punches"
        ? [
            ["clock_in", "IN"],
            ["clock_out", "OUT"],
          ]
        : draft.category === "transfer"
          ? [
              ["department_cost_center", "Department / Cost Center"],
              ["job_code_transfer", "Job Code Transfer"],
            ]
          : [["hours", "Exact hours"]];
  const titles = [
    "Date of exception",
    "Exception type",
    "Exact times or hours",
    "Reason for edit",
    "Review and sign",
  ];
  return (
    <section className="etime-card mx-auto max-w-xl">
      <div className="flex justify-between gap-4">
        <p className="text-sm font-bold text-cyan-700">Step {step + 1} of 5</p>
        <button disabled={busy} className="etime-link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <h2 className="my-5 text-2xl font-black">{titles[step]}</h2>
      {step === 0 && (
        <label className="block font-bold">
          Exception date
          <input
            className="etime-input"
            type="date"
            max={today}
            value={draft.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </label>
      )}
      {step === 1 && (
        <div className="grid gap-2">
          {Object.entries(categories).map(([key, label]) => (
            <button
              className={`min-h-12 rounded-xl border p-3 text-left font-bold ${draft.category === key ? "border-cyan-600 bg-cyan-50" : "border-slate-200"}`}
              key={key}
              onClick={() => set("category", key)}
              aria-pressed={draft.category === key}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {draft.category === "lunch"
              ? "Enter only the missing punch(es). Leave the other blank. Lunch duration is never assumed or adjusted."
              : "Enter exactly what should appear on the exception form."}
          </p>
          {(draft.category === "lunch" || draft.category === "punches") && (
            <p className="text-sm font-bold text-cyan-800">
              24-hour time: type 2130 for 21:30. The colon is added
              automatically. Midnight may be entered as 2400.
            </p>
          )}
          {fields.map(([key, label]) => (
            <label key={key} className="block font-bold">
              {label}
              <input
                className="etime-input"
                type={
                  key.includes("_in") || key.includes("_out")
                    ? "text"
                    : key === "hours"
                      ? "number"
                      : "text"
                }
                min={key === "hours" ? "0.01" : undefined}
                max={key === "hours" ? "24" : undefined}
                step={key === "hours" ? "0.01" : undefined}
                inputMode={
                  key.includes("_in") || key.includes("_out")
                    ? "numeric"
                    : undefined
                }
                placeholder={
                  key.includes("_in") || key.includes("_out")
                    ? "HH:MM"
                    : undefined
                }
                maxLength={key.includes("_in") || key.includes("_out") ? 5 : 14}
                value={draft[key]}
                onChange={(e) =>
                  set(
                    key,
                    key.includes("_in") || key.includes("_out")
                      ? formatClockInput(e.target.value)
                      : e.target.value,
                  )
                }
                onBlur={(e) => {
                  if (key.includes("_in") || key.includes("_out"))
                    set(key, formatClockInput(e.target.value, true));
                }}
              />
            </label>
          ))}
        </div>
      )}
      {step === 3 && (
        <label className="block font-bold">
          Reason
          <textarea
            rows={4}
            className="etime-input"
            maxLength={90}
            value={draft.reason}
            onChange={(e) => set("reason", e.target.value)}
          />
          <span className="text-sm font-normal text-slate-500">
            {draft.reason.length}/90 characters to keep the printed form
            legible. For Other Hours, specify the type.
          </span>
        </label>
      )}
      {step === 4 && (
        <div className="space-y-5">
          {forms
            .find((f) => f.period_start === periodStart(draft.date))
            ?.state.entries.filter((e) => e.id !== entry?.id)
            .map((e) => (
              <div
                key={e.id}
                className="rounded-xl border border-slate-200 p-3 text-sm"
              >
                <p className="font-bold">
                  Also covered by this signature: {e.date} ·{" "}
                  {categories[e.category]}
                </p>
                <p>
                  {[
                    e.clock_in && `IN ${e.clock_in}`,
                    e.lunch_out && `Lunch OUT ${e.lunch_out}`,
                    e.lunch_in && `Lunch IN ${e.lunch_in}`,
                    e.clock_out && `OUT ${e.clock_out}`,
                    e.hours && `${e.hours} hours`,
                    e.department_cost_center,
                    e.job_code_transfer,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p>{e.reason}</p>
              </div>
            ))}
          <dl className="space-y-2 rounded-xl bg-slate-50 p-4">
            <dt className="font-bold">
              {draft.date} · {categories[draft.category as Category]}
            </dt>
            {fields
              .filter(([key]) => draft[key])
              .map(([key, label]) => (
                <dd key={key}>
                  {label}: {draft[key]}
                </dd>
              ))}
            <dd>{draft.reason}</dd>
          </dl>
          <p className="text-sm text-slate-600">
            Your signature covers all entries on this pay-period form. Editing
            an entered exception clears that row’s initials and requires the
            manager to sign again.
          </p>
          <Signature
            expected={`${identity.first_name} ${identity.last_name}`}
            busy={busy}
            onSign={(name, adopted) => onSave(draft, name, adopted)}
          />
        </div>
      )}
      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button
            className="etime-link"
            disabled={busy}
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
        )}
        {step < 4 && (
          <button
            className="etime-button ml-auto"
            onClick={() => setStep(step + 1)}
          >
            Continue
          </button>
        )}
      </div>
    </section>
  );
}
