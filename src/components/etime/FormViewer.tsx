"use client";
import { useEffect, useRef, useState } from "react";
import type { EtimeForm, Entry } from "@/lib/etime/model";
import { layoutRows } from "@/lib/etime/layout";
function Sheet({
  url,
  page,
  entries,
  onInitial,
  busy,
}: {
  url: string;
  page: number;
  entries: (Entry & { continuation?: boolean })[];
  onInitial?: (entry: Entry) => void;
  busy: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url, isEvalSupported: false });
        dispose = () => {
          void task.destroy();
        };
        const doc = await task.promise;
        if (cancelled) return;
        const sheet = await doc.getPage(page);
        const viewport = sheet.getViewport({ scale: 1.7 });
        const target = canvas.current;
        if (!target || cancelled) return;
        target.width = viewport.width;
        target.height = viewport.height;
        const context = target.getContext("2d");
        if (!context) return;
        await sheet.render({ canvasContext: context, canvas: target, viewport })
          .promise;
      } catch {
        if (!cancelled)
          setError(
            "Preview unavailable. Your entries are saved. Retry or open the PDF below.",
          );
      }
    })();
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [url, page]);
  return (
    <div className="relative min-w-[780px] bg-white shadow-sm">
      {error ? (
        <p role="alert" className="p-6 text-red-700">
          {error}
        </p>
      ) : (
        <canvas
          ref={canvas}
          className="block h-auto w-full"
          aria-label={`Official exception form page ${page}`}
        />
      )}
      {!error &&
        onInitial &&
        entries.map(
          (entry, index) =>
            !entry.continuation && (
              <button
                key={`${entry.id}-${index}`}
                disabled={busy}
                title={
                  entry.entered
                    ? `Entered by ${entry.entered.initials}. Click to reverse.`
                    : "Apply your initials to mark this exception entered into eTime"
                }
                aria-label={`${entry.entered ? "Reverse" : "Confirm"} eTime entry for ${entry.date}, row ${(page - 1) * 10 + index + 1}`}
                onClick={() => onInitial(entry)}
                style={{
                  position: "absolute",
                  left: `${(1649 / 1782) * 100}%`,
                  width: `${(101 / 1782) * 100}%`,
                  top: `${((523 + index * 66.9) / (610.56 / (791.04 / 1782))) * 100}%`,
                  height: `${(66.9 / (610.56 / (791.04 / 1782))) * 100}%`,
                }}
                className={`border-2 ${entry.entered ? "border-green-600 bg-green-300/10" : "border-amber-500 bg-yellow-300/65 hover:bg-yellow-300/90"}`}
              />
            ),
        )}
    </div>
  );
}
export function FormViewer({
  form,
  onInitial,
  busy,
}: {
  form: EtimeForm;
  onInitial?: (entry: Entry) => void;
  busy: boolean;
}) {
  const rows = layoutRows(form.state.entries);
  const url = `/api/etime/forms/${form.id}?revision=${form.revision}`;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <a className="etime-link" href={url} target="_blank" rel="noreferrer">
          Open / Print PDF
        </a>
        <a className="etime-link" href={url + "&download=1"}>
          Download PDF
        </a>
        <span className="text-sm text-slate-500">
          Revision {form.revision} · Landscape
        </span>
      </div>
      {onInitial && (
        <p className="text-sm text-slate-600">
          Click a yellow cell to apply your initials after entering the
          exception in payroll. Green outlines indicate entered rows.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <div className="space-y-4">
          {Array.from(
            { length: Math.max(1, Math.ceil(rows.length / 10)) },
            (_, page) => (
              <Sheet
                key={`${form.id}-${form.revision}-${page}`}
                url={url}
                page={page + 1}
                entries={rows.slice(page * 10, page * 10 + 10)}
                onInitial={onInitial}
                busy={busy}
              />
            ),
          )}
        </div>
      </div>
    </section>
  );
}
