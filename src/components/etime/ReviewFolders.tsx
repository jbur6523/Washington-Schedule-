"use client";

import { ChevronDown, Folder } from "lucide-react";
import { categories, type EtimeForm } from "@/lib/etime/model";

export function ReviewFolders({
  forms,
  category,
  onOpen,
}: {
  forms: EtimeForm[];
  category: string;
  onOpen: (form: EtimeForm) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Exceptions for the selected pay period and filters. Completed means
        initialed as entered into eTime.
      </p>
      {([false, true] as const).map((completed) => {
        const label = completed ? "Completed" : "Pending";
        const groups = forms
          .map((form) => ({
            form,
            entries: form.state.entries.filter(
              (entry) =>
                Boolean(entry.entered) === completed &&
                (!category || entry.category === category),
            ),
          }))
          .filter((group) => group.entries.length > 0);
        const count = groups.reduce(
          (total, group) => total + group.entries.length,
          0,
        );
        return (
          <details
            key={label}
            className="group overflow-hidden rounded-2xl border border-slate-200"
          >
            <summary
              className={`flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-4 font-black [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600 ${completed ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-950"}`}
              aria-label={`${label} exceptions (${count})`}
            >
              <Folder aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span>
                {label} ({count})
              </span>
              <ChevronDown
                aria-hidden="true"
                className="ml-auto h-5 w-5 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="px-4 py-2">
              {count === 0 ? (
                <p className="py-4 text-sm text-slate-500">
                  No {label.toLowerCase()} exceptions match this view.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {groups.map(({ form, entries }) => (
                    <li key={form.id} className="py-4">
                      <h3 className="font-black">
                        {form.state.identity.last_name},{" "}
                        {form.state.identity.first_name}
                      </h3>
                      <ul className="mt-2 space-y-2">
                        {entries.map((entry) => (
                          <li key={entry.id}>
                            <button
                              className="w-full rounded-xl border border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                              onClick={() => onOpen(form)}
                            >
                              <span className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-bold text-hospital-ink">
                                  {entry.date.slice(5, 7)}/
                                  {entry.date.slice(8, 10)}/
                                  {entry.date.slice(2, 4)} ·{" "}
                                  {categories[entry.category]}
                                </span>
                                <span className="text-sm font-bold text-cyan-700 underline">
                                  View timecard
                                </span>
                              </span>
                              <span className="mt-1 block text-sm text-slate-600">
                                {entry.reason}
                              </span>
                              {entry.entered && (
                                <span className="mt-1 block text-xs font-bold text-green-700">
                                  Entered: {entry.entered.initials}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
