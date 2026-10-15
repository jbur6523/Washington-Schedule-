"use client";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import {
  addDays,
  categories,
  periodStart,
  TRIAL_NOTICE,
  type EtimeForm,
  type Entry,
  type Identity,
} from "@/lib/etime/model";
import { signOutAndRedirect } from "@/lib/auth/client-session";
import { ExceptionWizard } from "./ExceptionWizard";
import { Signature } from "./Signature";
import { ReviewFolders } from "./ReviewFolders";
const FormViewer = dynamic(
  () => import("./FormViewer").then((m) => m.FormViewer),
  { ssr: false, loading: () => <p>Loading official form…</p> },
);
type Data = {
  identity?: Identity | null;
  identities?: Identity[];
  signedIn?: boolean;
  forms?: EtimeForm[];
  today: string;
  currentPeriod: string;
  grant?: {
    role: string;
    display_name: string;
    portal_only: boolean;
    saved_signature_name: string | null;
  };
};
type Mode = "employee" | "review" | "admin";
const fullName = (i: Identity) => `${i.first_name} ${i.last_name}`;
const shortDate = (date: string) =>
  `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(2, 4)}`;
const payPeriodDate = (date: string) =>
  `${date.slice(5, 7)}${date.slice(8, 10)}${date.slice(2, 4)}`;
export function EtimeClient({ mode = "employee" }: { mode?: Mode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [period, setPeriod] = useState("");
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [wizard, setWizard] = useState<{
    entry?: Entry;
    form?: EtimeForm;
  } | null>(null);
  const [pendingInitial, setPendingInitial] = useState<Entry | null>(null);
  const [id, setId] = useState("");
  const [enroll, setEnroll] = useState(false);
  const [confirmId, setConfirmId] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [correction, setCorrection] = useState<Identity | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<
    { revision: number; action: string; at: string }[] | null
  >(null);
  const [qr, setQr] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/etime?mode=${mode}`, {
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to load eTime.");
    setData(result);
    setPeriod((p) => p || result.currentPeriod);
  }, [mode]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/etime?mode=${mode}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!cancelled) {
          setData(result);
          setPeriod(result.currentPeriod);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);
  async function act(
    body: Record<string, unknown>,
    after?: (result: Record<string, unknown>) => void,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/etime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save.");
      await load();
      after?.(result);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection failed. Retry without closing this page.",
      );
    } finally {
      setBusy(false);
    }
  }
  const form = data?.forms?.find((f) => f.id === selected);
  const entry = form?.state.entries.find((e) => e.id === selectedEntry);
  const open = (f: EtimeForm) => {
    setSelected(f.id);
    setSelectedEntry(null);
    setHistory(null);
    setNotice("");
    setError("");
  };
  const isOpen = (f: EtimeForm) =>
    Boolean(
      data &&
        data.today >= f.period_start &&
        data.today <= addDays(f.period_start, 16),
    );
  const periods = Array.from(
    new Set([
      data?.currentPeriod ?? "",
      ...(data?.forms ?? []).map((f) => f.period_start),
    ]),
  )
    .filter(Boolean)
    .sort()
    .reverse();
  const visible = (data?.forms ?? [])
    .filter(
      (f) =>
        f.period_start === period &&
        (!filter || f.state.entries.some((e) => e.category === filter)) &&
        `${f.state.identity.first_name} ${f.state.identity.last_name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        a.state.identity.last_name.localeCompare(b.state.identity.last_name) ||
        a.state.identity.first_name.localeCompare(b.state.identity.first_name),
    );
  async function showHistory() {
    setError("");
    try {
      const response = await fetch(`/api/etime/forms/${form!.id}?history=1`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setHistory(result.history);
    } catch {
      setError("Could not load revision history. Try again.");
    }
  }
  async function makeQr() {
    try {
      const QRCode = await import("qrcode");
      setQr(
        await QRCode.toDataURL(`${window.location.origin}/etime`, {
          width: 260,
          margin: 2,
        }),
      );
    } catch {
      setError("Unable to create QR code.");
    }
  }
  return (
    <main
      className={`mx-auto min-h-screen space-y-5 px-4 py-6 ${mode === "employee" ? "max-w-3xl" : "max-w-7xl"}`}
    >
      <style>{`@font-face{font-family:Allura;src:url('/fonts/Allura-Regular.ttf') format('truetype');font-display:swap}.etime-card{border:1px solid #e2e8f0;border-radius:24px;background:white;padding:24px}.etime-input{display:block;width:100%;min-height:48px;margin-top:6px;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px;background:white;color:#0f172a;font-weight:400}.etime-button{min-height:48px;border-radius:12px;background:#0e7490;color:white;font-weight:800;padding:12px 20px}.etime-button:disabled{opacity:.5;cursor:wait}.etime-link{display:inline-flex;align-items:center;min-height:44px;color:#0e7490;font-weight:700;text-decoration:underline;text-underline-offset:3px}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #0891b2;outline-offset:3px}`}</style>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-cyan-700">
            Washington Schedule
          </p>
          <h1 className="mt-1 text-3xl font-black text-hospital-ink">
            {mode === "review"
              ? "E-time Portal"
              : mode === "admin"
                ? "Payroll Identity Corrections"
                : "Time Card Exceptions"}
          </h1>
        </div>
        <div className="flex gap-4">
          {!data?.grant?.portal_only && (
            <Link className="etime-link" href="/">
              Back to app
            </Link>
          )}
          <button
            className="etime-link"
            onClick={() => void signOutAndRedirect("/etime")}
          >
            {data?.signedIn || data?.grant ? "Sign out" : "End session"}
          </button>
        </div>
      </header>
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
        {TRIAL_NOTICE}
      </p>
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}{" "}
          <button
            className="etime-link ml-3"
            onClick={() =>
              load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Refresh
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">
          {notice}
        </p>
      )}
      {!data && !error && <p role="status">Loading eTime…</p>}
      {data && mode === "employee" && !data.identity && (
        <section className="etime-card mx-auto max-w-lg space-y-5">
          <h2 className="text-xl font-black">
            {enroll || data.signedIn
              ? "Official payroll identity"
              : "Enter your employee ID"}
          </h2>
          <p className="text-sm text-slate-600">
            {data.signedIn
              ? "Set your official payroll name once. This stays separate from your app display name."
              : "Trial access uses your employee ID only, including access to your prior trial forms. End your session on shared devices."}
          </p>
          <label className="block font-bold">
            Employee ID
            <input
              className="etime-input"
              inputMode="numeric"
              maxLength={20}
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="off"
            />
          </label>
          {(enroll || data.signedIn) && (
            <>
              <p className="rounded-xl bg-amber-50 p-3 font-bold">
                Please verify this is your correct employee ID.
              </p>
              <label className="block font-bold">
                Re-enter employee ID
                <input
                  className="etime-input"
                  inputMode="numeric"
                  maxLength={20}
                  value={confirmId}
                  onChange={(e) => setConfirmId(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block font-bold">
                Official first name
                <input
                  className="etime-input"
                  value={first}
                  maxLength={35}
                  onChange={(e) => setFirst(e.target.value)}
                />
              </label>
              <label className="block font-bold">
                Official last name
                <input
                  className="etime-input"
                  value={last}
                  maxLength={45}
                  onChange={(e) => setLast(e.target.value)}
                />
              </label>
            </>
          )}
          <button
            className="etime-button w-full"
            disabled={busy}
            onClick={() =>
              act(
                {
                  action: "identify",
                  employee_id: id,
                  ...(enroll || data.signedIn
                    ? {
                        confirm_employee_id: confirmId,
                        first_name: first,
                        last_name: last,
                      }
                    : {}),
                },
                (result) => {
                  if (result.enroll) setEnroll(true);
                },
              )
            }
          >
            {busy
              ? "Checking…"
              : enroll || data.signedIn
                ? "Confirm identity"
                : "Continue"}
          </button>
          <a href="/login" className="etime-link">
            Employee / payroll account sign in
          </a>
        </section>
      )}
      {data && mode === "admin" && (
        <section className="etime-card space-y-4">
          <p>
            Correct the identity on its existing record. Forms and prior signed
            revisions remain attached. This does not grant payroll review
            access.
          </p>
          <label className="block font-bold">
            Employee
            <select
              className="etime-input"
              value={correction?.id ?? ""}
              onChange={(e) => {
                const i =
                  data.identities?.find((i) => i.id === e.target.value) ?? null;
                setCorrection(i);
                setId(i?.employee_id ?? "");
                setFirst(i?.first_name ?? "");
                setLast(i?.last_name ?? "");
                setConfirmId("");
              }}
            >
              <option value="">Choose employee</option>
              {data.identities?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.last_name}, {i.first_name} · {i.employee_id}
                </option>
              ))}
            </select>
          </label>
          {correction && (
            <>
              <label className="block">
                First name
                <input
                  className="etime-input"
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                />
              </label>
              <label className="block">
                Last name
                <input
                  className="etime-input"
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                />
              </label>
              <label className="block">
                Employee ID
                <input
                  className="etime-input"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                />
              </label>
              <label className="block">
                Confirm employee ID
                <input
                  className="etime-input"
                  value={confirmId}
                  onChange={(e) => setConfirmId(e.target.value)}
                />
              </label>
              <label className="block">
                Reason for correction
                <textarea
                  className="etime-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <p className="text-sm text-amber-800">
                Current forms will need new signatures. Previously issued
                revisions stay unchanged.
              </p>
              <button
                className="etime-button"
                disabled={busy}
                onClick={() =>
                  act(
                    {
                      action: "correct",
                      identity_id: correction.id,
                      employee_id: id,
                      confirm_employee_id: confirmId,
                      first_name: first,
                      last_name: last,
                      reason,
                    },
                    () => {
                      setCorrection(null);
                      setNotice(
                        "Identity corrected. All prior forms were preserved.",
                      );
                    },
                  )
                }
              >
                Save correction
              </button>
            </>
          )}
        </section>
      )}
      {data && mode === "employee" && data.identity && !form && !wizard && (
        <section className="etime-card space-y-4">
          <div>
            <h2 className="text-xl font-black">{fullName(data.identity)}</h2>
            <p className="text-sm text-slate-500">
              Employee ID {data.identity.employee_id} · Contact Jonathan for
              name or ID corrections.
            </p>
          </div>
          <button className="etime-button" onClick={() => setWizard({})}>
            Enter New Exception
          </button>
          <p className="text-sm">
            Current pay period: {payPeriodDate(data.currentPeriod)} –{" "}
            {payPeriodDate(addDays(data.currentPeriod, 13))}. Submit or edit
            through {payPeriodDate(addDays(data.currentPeriod, 16))}, 11:59 p.m.
            Pacific.
          </p>
        </section>
      )}
      {data && wizard && data.identity && (
        <ExceptionWizard
          key={wizard.entry?.id ?? "new"}
          identity={data.identity}
          entry={wizard.entry}
          today={data.today}
          forms={data.forms ?? []}
          busy={busy}
          onCancel={() => setWizard(null)}
          onSave={(entry, name, adopted) => {
            const target =
              data.forms?.find((f) => f.id === wizard.form?.id) ??
              data.forms?.find(
                (f) => f.period_start === periodStart(entry.date),
              );
            void act(
              {
                action: "save",
                form_id: target?.id,
                revision: target?.revision ?? 0,
                entry_id: wizard.entry?.id,
                entry,
                name,
                adopted,
              },
              (result) => {
                setWizard(null);
                setSelected((result.form as EtimeForm).id);
                setSelectedEntry(null);
                setHistory(null);
                setNotice("Exception saved and signed.");
              },
            );
          }}
        />
      )}
      {data &&
        mode !== "admin" &&
        !form &&
        !wizard &&
        (mode === "review" || data.identity) && (
          <section className="etime-card space-y-5">
            <div className="flex flex-wrap items-end gap-4">
              <label className="grow font-bold">
                Current / Previous Pay Periods
                <select
                  className="etime-input"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      {p === data.currentPeriod ? "Current: " : "Previous: "}
                      {payPeriodDate(p)} – {payPeriodDate(addDays(p, 13))}
                    </option>
                  ))}
                </select>
              </label>
              {mode === "review" && (
                <button className="etime-link" onClick={() => void makeQr()}>
                  Employee QR code
                </button>
              )}
            </div>
            {mode === "review" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  Search employee
                  <input
                    className="etime-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label>
                  Exception type
                  <select
                    className="etime-input"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {Object.entries(categories).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {qr && (
              <div className="rounded-xl border p-5 text-center">
                <Image
                  unoptimized
                  src={qr}
                  width={260}
                  height={260}
                  alt="QR code for trial employee exceptions"
                  className="mx-auto"
                />
                <p>Employee exception trial</p>
                <a href="/etime" className="etime-link">
                  Open employee entry page
                </a>
                <button className="etime-link ml-4" onClick={() => setQr("")}>
                  Close
                </button>
              </div>
            )}
            {mode === "review" ? (
              <ReviewFolders forms={visible} category={filter} onOpen={open} />
            ) : visible.length === 0 ? (
              <p className="py-5 text-slate-500">
                No exceptions in this pay period.
              </p>
            ) : (
              <ul className="divide-y">
                {visible.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div>
                      <h3 className="font-black">
                        {f.state.identity.last_name},{" "}
                        {f.state.identity.first_name}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {Array.from(
                          new Set(
                            f.state.entries.map((e) => categories[e.category]),
                          ),
                        ).join(" · ")}
                      </p>
                      <p className="mt-1 text-sm">
                        {f.state.entries.filter((e) => !e.entered).length}{" "}
                        awaiting eTime entry ·{" "}
                        {isOpen(f)
                          ? "Open for employee edits"
                          : "Employee edits closed"}
                      </p>
                    </div>
                    <button className="etime-link" onClick={() => open(f)}>
                      View Exception Form ({f.state.entries.length}{" "}
                      {f.state.entries.length === 1 ? "entry" : "entries"})
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      {data && form && !wizard && (
        <section className="etime-card space-y-6">
          <button
            className="etime-link"
            onClick={() => {
              if (entry) setSelectedEntry(null);
              else setSelected(null);
              setHistory(null);
              setPendingInitial(null);
              setNotice("");
            }}
          >
            {entry ? "Back to exceptions" : "Back to pay periods"}
          </button>
          <div>
            <h2 className="text-2xl font-black">
              {form.state.identity.first_name} {form.state.identity.last_name}
            </h2>
            <p>
              {payPeriodDate(form.period_start)} –{" "}
              {payPeriodDate(addDays(form.period_start, 13))} ·{" "}
              {isOpen(form)
                ? `Edits close ${payPeriodDate(addDays(form.period_start, 16))}, 11:59 p.m. Pacific`
                : "Closed — read only for employees"}
            </p>
          </div>
          {mode === "review" ? (
            <FormViewer
              form={form}
              onInitial={(entry) => {
                if (entry.entered) {
                  setPendingInitial(entry);
                  return;
                }
                void act(
                  {
                    action: "initial",
                    form_id: form.id,
                    revision: form.revision,
                    entry_id: entry.id,
                    entered: true,
                  },
                  () => setNotice("Entry acknowledgment saved."),
                );
              }}
              busy={busy}
            />
          ) : (
            !entry && (
              <div className="flex flex-wrap items-center gap-4">
                <a
                  className="etime-link"
                  href={`/api/etime/forms/${form.id}?revision=${form.revision}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View PDF
                </a>
                <a
                  className="etime-link"
                  href={`/api/etime/forms/${form.id}?revision=${form.revision}&download=1`}
                >
                  Download PDF
                </a>
              </div>
            )
          )}
          {pendingInitial && (
            <div
              role="region"
              aria-label="Confirm eTime entry"
              className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5"
            >
              <h3 className="font-black">Reverse entered acknowledgment?</h3>
              <p className="my-3">
                {pendingInitial.date}: {pendingInitial.reason}
              </p>
              <button
                className="etime-button"
                disabled={busy}
                onClick={() =>
                  act(
                    {
                      action: "initial",
                      form_id: form.id,
                      revision: form.revision,
                      entry_id: pendingInitial.id,
                      entered: false,
                    },
                    () => {
                      setPendingInitial(null);
                      setNotice("Entry acknowledgment saved.");
                    },
                  )
                }
              >
                Reverse initials
              </button>
              <button
                className="etime-link ml-4"
                disabled={busy}
                onClick={() => setPendingInitial(null)}
              >
                Cancel
              </button>
            </div>
          )}
          {mode === "employee" && !entry ? (
            <ul className="divide-y text-sm" aria-label="Exceptions">
              {form.state.entries.map((e) => (
                <li key={e.id}>
                  <button
                    className="etime-link py-2 text-left"
                    onClick={() => {
                      setSelectedEntry(e.id);
                      setHistory(null);
                      setNotice("");
                      void showHistory();
                    }}
                  >
                    {shortDate(e.date)} Exception -{" "}
                    {isOpen(form) ? "View/Edit" : "View"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-3">
              <h3 className="text-lg font-black">
                {entry ? `${shortDate(entry.date)} Exception` : "Exceptions"}
              </h3>
              {(entry ? [entry] : form.state.entries).map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"
                >
                  <div>
                    <p className="font-bold">
                      {e.date} · {categories[e.category]}
                    </p>
                    <p>{e.reason}</p>
                    {entry && (
                      <dl className="my-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {(
                          [
                            ["clock_in", "IN"],
                            ["clock_out", "OUT"],
                            ["lunch_out", "Lunch OUT"],
                            ["lunch_in", "Lunch IN"],
                            [
                              "department_cost_center",
                              "Department / Cost Center",
                            ],
                            ["job_code_transfer", "Job Code Transfer"],
                            ["hours", "Exact hours"],
                          ] as const
                        )
                          .filter(([key]) => e[key])
                          .map(([key, label]) => (
                            <div key={key}>
                              <dt className="font-bold">{label}</dt>
                              <dd>{e[key]}</dd>
                            </div>
                          ))}
                      </dl>
                    )}
                    <p className="mt-1 text-sm text-slate-500">
                      {e.entered
                        ? `Exception Entered: ${e.entered.initials} · ${new Date(e.entered.at).toLocaleString()}`
                        : "Awaiting entry into eTime"}
                    </p>
                  </div>
                  {mode === "employee" && isOpen(form) && (
                    <button
                      className="etime-link"
                      onClick={() => setWizard({ entry: e, form })}
                    >
                      Edit and re-sign
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {(mode === "review" || entry) && (
            <div className="text-sm">
              <p>
                Employee signature:{" "}
                {form.state.employeeSignature
                  ? `${form.state.employeeSignature.name} · ${new Date(form.state.employeeSignature.at).toLocaleString()}`
                  : "Needs signature"}
              </p>
              <p>
                Manager signature:{" "}
                {form.state.managerSignature
                  ? `${form.state.managerSignature.name} · ${new Date(form.state.managerSignature.at).toLocaleString()}`
                  : "Needs signature"}
              </p>
            </div>
          )}
          {mode === "employee" &&
            isOpen(form) &&
            !form.state.employeeSignature && (
              <Signature
                expected={`${form.state.identity.first_name} ${form.state.identity.last_name}`}
                busy={busy}
                onSign={(name, adopted) =>
                  act({
                    action: "employeeSign",
                    form_id: form.id,
                    revision: form.revision,
                    name,
                    adopted,
                  })
                }
              />
            )}
          {mode === "review" &&
            data.grant?.role === "manager" &&
            !form.state.managerSignature && (
              <Signature
                key={`${form.id}:${form.revision}`}
                expected={data.grant.display_name}
                savedName={data.grant.saved_signature_name}
                busy={busy}
                label="Sign Timecard"
                onSign={(name, adopted) =>
                  act({
                    action: "managerSign",
                    form_id: form.id,
                    revision: form.revision,
                    name,
                    adopted,
                  })
                }
              />
            )}
          {(mode === "review" || entry) && (
            <section className="space-y-2" aria-label="Revision history">
              <h3 className="font-bold">Revision history</h3>
              {entry && (
                <p className="text-sm text-slate-500">
                  Revisions include all exceptions on this pay period’s form.
                </p>
              )}
              <button className="etime-link" onClick={() => void showHistory()}>
                {history ? "Refresh revision history" : "View revision history"}
              </button>
              {history && (
                <ul className="space-y-2 text-sm">
                  {history.map((h) => (
                    <li key={h.revision}>
                      <a
                        className="etime-link"
                        target="_blank"
                        rel="noreferrer"
                        href={`/api/etime/forms/${form.id}?revision=${h.revision}`}
                      >
                        Revision {h.revision} · {h.action} ·{" "}
                        {new Date(h.at).toLocaleString()}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </section>
      )}
    </main>
  );
}
