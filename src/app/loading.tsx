export default function Loading() {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">WHHS RT Schedule</p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">Loading dashboard...</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
          Checking your session and role access.
        </p>
      </section>
    </main>
  );
}
