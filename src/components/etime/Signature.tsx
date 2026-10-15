"use client";
import { useState } from "react";
export function Signature({
  expected,
  busy,
  label = "Sign and Submit",
  onSign,
}: {
  expected: string;
  busy: boolean;
  label?: string;
  onSign: (name: string, adopted: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [adopted, setAdopted] = useState(false);
  return (
    <div className="space-y-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
      <label className="block font-bold">
        Type your full name
        <input
          className="etime-input"
          value={name}
          maxLength={100}
          placeholder={expected}
          onChange={(e) => {
            setName(e.target.value);
            setAdopted(false);
          }}
          autoComplete="name"
        />
      </label>
      <div
        className="min-h-16 border-b border-slate-400 px-2 py-3 text-4xl"
        style={{ fontFamily: "Allura, cursive" }}
        aria-label="Signature preview"
      >
        {name || "Signature preview"}
      </div>
      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          checked={adopted}
          onChange={(e) => setAdopted(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0"
        />
        I confirm the information on this form is correct and adopt the
        signature shown above as my electronic signature.
      </label>
      <button
        className="etime-button"
        disabled={busy || !adopted || !name.trim()}
        onClick={() => onSign(name, adopted)}
      >
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}
