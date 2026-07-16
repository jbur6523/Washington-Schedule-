"use client";

/* eslint-disable @next/next/no-img-element -- Order images use short-lived private Supabase signed URLs. */

import { useEffect, useMemo, useRef } from "react";
import { ImageIcon, PackageCheck, X } from "lucide-react";
import { formatOrderCreatedAt } from "@/lib/order-management/format";
import type { OrderWithPreview } from "@/lib/order-management/types";

type OrderDetailsDialogProps = {
  order: OrderWithPreview | null;
  onClose: () => void;
  onOpenImage: (url: string, label: string) => void;
};

export function OrderDetailsDialog({ order, onClose, onOpenImage }: OrderDetailsDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sortedLines = useMemo(
    () => [...(order?.department_order_lines ?? [])].sort((left, right) => left.sort_order - right.sort_order),
    [order]
  );
  const catalogLines = sortedLines.filter((line) => line.line_type === "pmm");
  const nonCatalogLines = sortedLines.filter((line) => line.line_type === "non_catalog");

  useEffect(() => {
    if (!order) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, order]);

  if (!order) return null;

  const created = formatOrderCreatedAt(order.created_at);
  const reqLabel = order.req_number?.trim() || "Not entered";
  const imageLabel = `Order Req - ${reqLabel}`;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-slate-950/60 px-3 py-3 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-order-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-pink-700">
              <PackageCheck size={14} />
              Order Details
            </p>
            <h2 id="view-order-title" className="mt-1 text-2xl font-black text-hospital-ink">
              View Order
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600"
            aria-label="Close View Order"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <dl className="grid gap-2 rounded-2xl bg-slate-50 p-3 text-sm">
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Date</dt>
              <dd className="font-black text-hospital-ink">
                {created.date}{created.time ? ` at ${created.time}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Req Number</dt>
              <dd className="break-words font-black text-hospital-ink">{reqLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Created by</dt>
              <dd className="font-black text-hospital-ink">{order.created_by_name || "User"}</dd>
            </div>
          </dl>

          {catalogLines.length > 0 && (
            <section className="mt-4" aria-labelledby="catalog-items-title">
              <h3 id="catalog-items-title" className="text-sm font-black text-hospital-ink">Catalog Items</h3>
              <div className="mt-2 space-y-2">
                {catalogLines.map((line) => (
                  <article key={line.id} className="rounded-2xl border border-pink-100 bg-pink-50/50 p-3">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-pink-700">PMM #{line.pmm_number}</p>
                    <p className="mt-1 break-words text-sm font-black text-hospital-ink">{line.item_name_snapshot}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {nonCatalogLines.length > 0 && (
            <section className="mt-4" aria-labelledby="non-catalog-items-title">
              <h3 id="non-catalog-items-title" className="text-sm font-black text-hospital-ink">Non-Catalog Items</h3>
              <div className="mt-2 space-y-2">
                {nonCatalogLines.map((line) => (
                  <article key={line.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="break-words text-sm font-black text-hospital-ink">{line.item_name_snapshot}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {sortedLines.length === 0 && (
            <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">
              No catalog or non-catalog items were recorded for this legacy order.
            </p>
          )}

          {order.notes && (
            <section className="mt-4" aria-labelledby="order-notes-title">
              <h3 id="order-notes-title" className="text-sm font-black text-hospital-ink">Notes</h3>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-600">
                {order.notes}
              </p>
            </section>
          )}

          {order.signedImageUrl && (
            <section className="mt-4" aria-labelledby="order-image-title">
              <h3 id="order-image-title" className="text-sm font-black text-hospital-ink">Order Image</h3>
              <button
                type="button"
                onClick={() => onOpenImage(order.signedImageUrl as string, imageLabel)}
                className="mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left"
                aria-label="Open full-size order image"
              >
                <img src={order.signedImageUrl} alt="Order item preview" className="max-h-72 w-full object-contain" />
                <span className="flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-black text-pink-700">
                  <ImageIcon size={16} />
                  View Full Size
                </span>
              </button>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
