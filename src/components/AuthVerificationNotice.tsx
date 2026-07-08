type AuthVerificationNoticeProps = {
  message?: string;
};

export function AuthVerificationNotice({ message }: AuthVerificationNoticeProps) {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-amber-700">WHHS RT Schedule</p>
        <h1 className="mt-2 text-2xl font-black text-amber-950">Could not verify access</h1>
        <p className="mt-4 text-sm font-bold leading-6 text-amber-900">
          {message ?? "Could not verify access. Please refresh or try again."}
        </p>
      </section>
    </main>
  );
}
