"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/");
    router.refresh();
  };

  const handlePasswordReset = async () => {
    setError("");
    setMessage("");

    if (!email) {
      setError("Enter your email address first.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Password reset email sent if this account exists.");
  };

  return (
    <form onSubmit={handleSignIn} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-base font-bold text-hospital-ink outline-none focus:border-cyan-300"
        />
      </label>
      <label className="block">
        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
          className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-base font-bold text-hospital-ink outline-none focus:border-cyan-300"
        />
      </label>

      {error && (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="min-h-12 w-full rounded-2xl bg-cyan-700 px-4 text-base font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Sign In"}
      </button>
      <button
        type="button"
        onClick={handlePasswordReset}
        disabled={loading}
        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Forgot Password
      </button>
    </form>
  );
}
