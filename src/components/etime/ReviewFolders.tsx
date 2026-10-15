"use client";

import { ChevronDown, Folder, FolderCheck, FilePenLine } from "lucide-react";
import { categories, type EtimeForm } from "@/lib/etime/model";
import {
  isApproved,
  isEntryEntered,
  reviewFolder,
  type ReviewRole,
} from "@/lib/etime/workflow";

const folders = {
  pending: {
    label: "Pending",
    description: "Waiting for exception entry / initials",
    color: "bg-amber-50 text-amber-950",
    icon: Folder,
  },
  entered: {
    label: "Entered — Signature Needed",
    description: "All entries initialed · Awaiting manager signature",
    color: "bg-blue-50 text-blue-950",
    icon: FilePenLine,
  },
  approved: {
    label: "Approved Exceptions",
    description: "Exception forms signed by the manager",
    color: "bg-green-50 text-green-900",
    icon: FolderCheck,
  },
  completed: {
    label: "Completed",
    description: "All entries initialed · eTime entry complete",
    color: "bg-green-50 text-green-900",
    icon: FolderCheck,
  },
} as const;

export function ReviewFolders({
  forms,
  category,
  role,
  onOpen,
}: {
  forms: EtimeForm[];
  category: string;
  role: ReviewRole;
  onOpen: (form: EtimeForm) => void;
}) {
  const keys =
    role === "manager"
      ? (["pending", "entered", "approved"] as const)
      : (["pending", "completed"] as const);
  const matching = forms
    .filter(
      (form) =>
        !category ||
        form.state.entries.some((entry) => entry.category === category),
    )
    .sort(
      (a, b) =>
        a.state.identity.last_name.localeCompare(b.state.identity.last_name) ||
        a.state.identity.first_name.localeCompare(b.state.identity.first_name),
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Employee forms for the selected pay period and filters.
      </p>
      {keys.map((key) => {
        const { label, description, color, icon: Icon } = folders[key];
        // Classify the entire form, including entries outside the category filter.
        const grouped = matching.filter(
          (form) => reviewFolder(form.state, role) === key,
        );
        return (
          <details
            key={key}
            className="group overflow-hidden rounded-2xl border border-slate-200"
          >
            <summary
              className={`flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600 ${color}`}
              aria-label={`${label} (${grouped.length})`}
            >
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span>
                <span className="block font-black">
                  {label} ({grouped.length})
                </span>
                <span className="mt-1 block text-sm font-normal opacity-75">
                  {description}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="ml-auto h-5 w-5 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="px-4 py-2">
              {grouped.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">
                  No forms match this view.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {grouped.map((form) => (
                    <li key={form.id} className="py-3">
                      <button
                        className="w-full rounded-xl border border-slate-100 px-3 py-3 text-left hover:bg-slate-50"
                        onClick={() => onOpen(form)}
                      >
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-black">
                            {form.state.identity.last_name},{" "}
                            {form.state.identity.first_name}
                          </span>
                          <span className="text-sm font-bold text-cyan-700 underline">
                            View timecard
                          </span>
                        </span>
                        <span className="mt-1 block text-sm text-slate-600">
                          {form.state.entries.filter(isEntryEntered).length} of{" "}
                          {form.state.entries.length} entries initialed ·{" "}
                          {isApproved(form.state)
                            ? "Manager signed"
                            : "Manager signature needed"}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {Array.from(
                            new Set(
                              form.state.entries.map(
                                (entry) => categories[entry.category],
                              ),
                            ),
                          ).join(" · ")}
                        </span>
                      </button>
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
