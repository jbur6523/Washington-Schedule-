"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  applySpaceDelimiter,
  buildPmmLookupStates,
  formatPmmNumbers,
  parsePmmInput
} from "@/lib/order-management/pmm";
import type { NonCatalogDraft, OrderLinesDraft, PmmCatalogRow } from "@/lib/order-management/types";

type PmmOrderFieldsProps = {
  disabled?: boolean;
  onChange: (draft: OrderLinesDraft) => void;
};

const emptyCatalogRows: PmmCatalogRow[] = [];

function makeDraftId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `non-catalog-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PmmOrderFields({ disabled = false, onChange }: PmmOrderFieldsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pmmInput, setPmmInput] = useState("");
  const [duplicateNotice, setDuplicateNotice] = useState<string[]>([]);
  const [lookupResult, setLookupResult] = useState<{ key: string; rows: PmmCatalogRow[]; error: string }>({
    key: "",
    rows: [],
    error: ""
  });
  const [nonCatalogItems, setNonCatalogItems] = useState<NonCatalogDraft[]>([]);
  const parsed = useMemo(() => parsePmmInput(pmmInput), [pmmInput]);
  const lookupKey = parsed.pmmNumbers.join(",");
  const duplicatePmmNumbers = useMemo(
    () => Array.from(new Set([...parsed.duplicatePmmNumbers, ...duplicateNotice])),
    [duplicateNotice, parsed.duplicatePmmNumbers]
  );
  const visibleCatalogRows = lookupResult.key === lookupKey ? lookupResult.rows : emptyCatalogRows;
  const lookupError = lookupResult.key === lookupKey ? lookupResult.error : "";
  const lookupStatus = lookupError ? "error" : lookupKey && lookupResult.key !== lookupKey ? "loading" : "ready";
  const lookupStates = useMemo(
    () => buildPmmLookupStates(parsed.pmmNumbers, visibleCatalogRows, lookupStatus),
    [lookupStatus, parsed.pmmNumbers, visibleCatalogRows]
  );

  useEffect(() => {
    const numbers = lookupKey ? lookupKey.split(",") : [];

    if (numbers.length === 0) return;

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pmm_catalog")
        .select("pmm_number, item_name, catalog_status, is_orderable, review_required")
        .in("pmm_number", numbers);

      if (cancelled) return;

      if (error) {
        setLookupResult({
          key: lookupKey,
          rows: [],
          error: "Could not look up PMM numbers. Your entries were kept; try again shortly."
        });
      } else {
        setLookupResult({ key: lookupKey, rows: (data ?? []) as PmmCatalogRow[], error: "" });
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lookupKey]);

  useEffect(() => {
    onChange({
      pmmNumbers: parsed.pmmNumbers,
      duplicatePmmNumbers,
      invalidTokens: parsed.invalidTokens,
      lookupStates,
      lookupLoading: lookupStatus === "loading",
      lookupError,
      nonCatalogItems
    });
  }, [duplicatePmmNumbers, lookupError, lookupStates, lookupStatus, nonCatalogItems, onChange, parsed.invalidTokens, parsed.pmmNumbers]);

  const normalizeField = () => {
    const nextParsed = parsePmmInput(pmmInput);
    if (nextParsed.invalidTokens.length > 0) return;
    setDuplicateNotice(nextParsed.duplicatePmmNumbers);
    setPmmInput(formatPmmNumbers(nextParsed.pmmNumbers));
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const input = event.currentTarget;
    const pasted = event.clipboardData.getData("text");
    const combined = `${pmmInput.slice(0, input.selectionStart ?? pmmInput.length)}${pasted}${pmmInput.slice(
      input.selectionEnd ?? pmmInput.length
    )}`;
    const nextParsed = parsePmmInput(combined);

    if (nextParsed.invalidTokens.length > 0) {
      setPmmInput(combined.replace(/[;\s]+/g, ", "));
      setDuplicateNotice(nextParsed.duplicatePmmNumbers);
      return;
    }

    setDuplicateNotice(nextParsed.duplicatePmmNumbers);
    setPmmInput(formatPmmNumbers(nextParsed.pmmNumbers));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const input = event.currentTarget;
    const next = applySpaceDelimiter(
      pmmInput,
      input.selectionStart ?? pmmInput.length,
      input.selectionEnd ?? pmmInput.length
    );
    setPmmInput(next.value);

    window.requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const removePmm = (pmmNumber: string) => {
    setPmmInput(formatPmmNumbers(parsed.pmmNumbers.filter((value) => value !== pmmNumber)));
    setDuplicateNotice((current) => current.filter((value) => value !== pmmNumber));
  };

  return (
    <section className="mt-4 rounded-3xl border border-pink-100 bg-pink-50/40 p-3">
      <label htmlFor="order-pmm-numbers" className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
        PMM Numbers
      </label>
      <input
        ref={inputRef}
        id="order-pmm-numbers"
        value={pmmInput}
        onChange={(event) => {
          setPmmInput(event.target.value);
          setDuplicateNotice([]);
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={normalizeField}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        placeholder="1356, 978, 21592..."
        aria-describedby="order-pmm-helper order-pmm-status"
        className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-hospital-ink outline-none focus:border-pink-300 disabled:opacity-60"
      />
      <p id="order-pmm-helper" className="mt-1 text-xs font-bold text-slate-500">
        Enter PMM numbers separated by spaces or commas.
      </p>

      <div id="order-pmm-status" aria-live="polite" className="mt-3 space-y-2">
        {parsed.invalidTokens.length > 0 && (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">
            PMM numbers must contain digits only. Remove: {parsed.invalidTokens.join(", ")}
          </p>
        )}
        {duplicatePmmNumbers.length > 0 && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            Duplicate {duplicatePmmNumbers.length === 1 ? "PMM" : "PMMs"} ignored: {duplicatePmmNumbers.join(", ")}
          </p>
        )}
        {lookupError && (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
            {lookupError}
          </p>
        )}
        {lookupStates.map((item) => {
          const blockedLabel = item.catalogStatus === "discontinued" ? "Discontinued" : "Do not use";
          const tone =
            item.state === "blocked" || item.state === "unknown" || item.state === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : item.state === "review"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-100 bg-white text-slate-700";

          return (
            <div key={item.pmmNumber} className={`flex items-start gap-2 rounded-2xl border px-3 py-2 ${tone}`}>
              {item.state === "review" && <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black">PMM #{item.pmmNumber}</p>
                <p className="mt-0.5 break-words text-sm font-bold">
                  {item.state === "loading" && "Looking up item..."}
                  {item.state === "error" && "Lookup unavailable"}
                  {item.state === "unknown" && `PMM #${item.pmmNumber} not found`}
                  {(item.state === "active" || item.state === "review" || item.state === "blocked") && item.itemName}
                </p>
                {item.state === "review" && <p className="mt-1 text-xs font-black">Active — department review recommended</p>}
                {item.state === "blocked" && <p className="mt-1 text-xs font-black">{blockedLabel} — cannot be ordered</p>}
              </div>
              <button
                type="button"
                onClick={() => removePmm(item.pmmNumber)}
                disabled={disabled}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-white/80"
                aria-label={`Remove PMM ${item.pmmNumber}`}
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setNonCatalogItems((current) => [...current, { id: makeDraftId(), itemName: "" }])}
        disabled={disabled}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-white px-3 text-sm font-black text-pink-700 disabled:opacity-60"
      >
        <Plus size={16} />
        Non-Catalog Item
      </button>

      {nonCatalogItems.length > 0 && (
        <div className="mt-3 space-y-2">
          {nonCatalogItems.map((item, index) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`non-catalog-${item.id}`} className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Non-Catalog Item {index + 1}
                </label>
                <button
                  type="button"
                  onClick={() => setNonCatalogItems((current) => current.filter((candidate) => candidate.id !== item.id))}
                  disabled={disabled}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
                  aria-label={`Remove Non-Catalog Item ${index + 1}`}
                >
                  <X size={14} />
                </button>
              </div>
              <input
                id={`non-catalog-${item.id}`}
                value={item.itemName}
                onChange={(event) =>
                  setNonCatalogItems((current) =>
                    current.map((candidate) =>
                      candidate.id === item.id ? { ...candidate, itemName: event.target.value.slice(0, 500) } : candidate
                    )
                  )
                }
                maxLength={500}
                disabled={disabled}
                placeholder="Item Name"
                className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-bold text-hospital-ink outline-none focus:border-pink-300 disabled:opacity-60"
              />
              {!item.itemName.trim() && <p className="mt-1 text-xs font-bold text-amber-700">Item Name is required.</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
