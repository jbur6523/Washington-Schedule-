"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authEmailForUsername, normalizeUsername } from "@/lib/auth/username";

type UsernameMode = "lookup" | "claimed" | "unclaimed";

type UsernameStatusResponse = {
  status: "claimed" | "unclaimed" | "not_found" | "configuration_required";
  username?: string;
  displayName?: string;
};

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<UsernameMode>("lookup");
  const [username, setUsername] = useState("");
  const [assignedUsername, setAssignedUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleUsernameLookup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const response = await fetch("/api/auth/username-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const result = (await response.json().catch(() => ({}))) as UsernameStatusResponse;

    setLoading(false);

    if (!response.ok || (result.status !== "claimed" && result.status !== "unclaimed")) {
      setError("We could not find an active assigned username.");
      return;
    }

    setAssignedUsername(result.username ?? normalizeUsername(username));
    setDisplayName(result.displayName ?? "");
    setMode(result.status === "claimed" ? "claimed" : "unclaimed");
  };

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmailForUsername(assignedUsername),
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

  const handleClaim = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: assignedUsername,
        password,
        confirmPassword
      })
    });

    if (!response.ok) {
      setLoading(false);
      setError("Unable to create account.");
      return;
    }

    const result = (await response.json().catch(() => ({}))) as { authEmail?: string };
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: result.authEmail ?? authEmailForUsername(assignedUsername),
      password
    });
    setLoading(false);

    if (signInError) {
      setMessage("Account created. Please sign in with your assigned username and password.");
      setMode("claimed");
      return;
    }

    router.replace("/");
    router.refresh();
  };

  const resetLookup = () => {
    setMode("lookup");
    setAssignedUsername("");
    setDisplayName("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
  };

  return (
    <div className="mt-6 space-y-4">
      {mode === "lookup" && (
        <form onSubmit={handleUsernameLookup} className="space-y-4">
          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Enter your username
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-base font-bold lowercase text-hospital-ink outline-none focus:border-cyan-300"
            />
          </label>
          <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
            Your username is assigned by the department.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="min-h-12 w-full rounded-2xl bg-cyan-700 px-4 text-base font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Checking..." : "Continue"}
          </button>
        </form>
      )}

      {mode === "claimed" && (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Welcome back</p>
            <p className="mt-1 text-xl font-black text-hospital-ink">{displayName || assignedUsername}</p>
            <p className="mt-1 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-extrabold text-slate-600">
              Username: {assignedUsername}
            </p>
          </div>
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
          <button
            type="submit"
            disabled={loading}
            className="min-h-12 w-full rounded-2xl bg-cyan-700 px-4 text-base font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      )}

      {mode === "unclaimed" && (
        <form onSubmit={handleClaim} className="space-y-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Create your account</p>
            <p className="mt-1 text-xl font-black text-hospital-ink">{displayName || assignedUsername}</p>
            <p className="mt-1 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-extrabold text-slate-600">
              Username: {assignedUsername}
            </p>
          </div>
          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-base font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Confirm password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-base font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="min-h-12 w-full rounded-2xl bg-cyan-700 px-4 text-base font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>
      )}

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

      {mode !== "lookup" && (
        <button
          type="button"
          onClick={resetLookup}
          disabled={loading}
          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Use a different username
        </button>
      )}

      <p className="text-center text-xs font-bold leading-5 text-slate-400">
        Contact the schedule administrator if you need a password reset.
      </p>
    </div>
  );
}
