"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical, X } from "lucide-react";

export function CardOverflowMenu({
  ariaLabel,
  title,
  subtitle,
  children
}: {
  ariaLabel: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      ));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white/90 text-slate-700 shadow-sm transition active:scale-95"
      >
        <MoreVertical size={21} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setOpen(false);
            }
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-white bg-slate-50 p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Card actions</p>
                <h2 className="mt-1 text-xl font-black text-hospital-ink">{title}</h2>
                {subtitle ? <p className="mt-1 text-sm font-bold text-slate-500">{subtitle}</p> : null}
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
              >
                <X size={16} />
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4">{children}</div>
          </section>
        </div>
      )}
    </>
  );
}
