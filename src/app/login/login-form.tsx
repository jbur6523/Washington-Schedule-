"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authEmailForUsername, normalizeUsername } from "@/lib/auth/username";

type UsernameMode = "lookup" | "claimed" | "unclaimed" | "contact" | "notifications";
type AppRole = "admin" | "lead" | "staff";

type UsernameStatusResponse = {
  status: "claimed" | "unclaimed" | "not_found" | "configuration_required";
  username?: string;
  displayName?: string;
};

type ClaimResponse = {
  authEmail?: string;
  username?: string;
  staffProfileId?: string;
  departmentId?: string;
  role?: AppRole;
  operationsRole?: "none" | "aide" | "command_center" | "director" | "icu_command_center";
  displayName?: string;
  phoneNumber?: string;
};

type OnboardingContext = {
  staffProfileId: string;
  departmentId: string;
  displayName: string;
  role: AppRole;
};

type NotificationPreferences = {
  short_shift_alerts: boolean;
  coverage_request_alerts: boolean;
  switch_request_alerts: boolean;
  coverage_offer_alerts: boolean;
};

const defaultNotificationPreferences: NotificationPreferences = {
  short_shift_alerts: true,
  coverage_request_alerts: true,
  switch_request_alerts: true,
  coverage_offer_alerts: true
};

const rememberedUsernameKey = "whhs-remembered-username";

function isValidEmail(value: string) {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function getPlatform() {
  const userAgent = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(userAgent)) {
    return "ios";
  }

  if (/android/.test(userAgent)) {
    return "android";
  }

  return "web";
}

async function getServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  return navigator.serviceWorker.register("/sw.js");
}

function TrustedDeviceOptions({
  keepSignedIn,
  setKeepSignedIn
}: {
  keepSignedIn: boolean;
  setKeepSignedIn: (value: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3">
      <label className="flex items-center gap-3 text-sm font-extrabold text-hospital-ink">
        <input
          type="checkbox"
          checked={keepSignedIn}
          onChange={(event) => setKeepSignedIn(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-cyan-700"
        />
        <span>Keep me signed in on this device</span>
      </label>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<UsernameMode>("lookup");
  const [username, setUsername] = useState("");
  const [assignedUsername, setAssignedUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(
    defaultNotificationPreferences
  );
  const [notificationSupported, setNotificationSupported] = useState<boolean | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [onboardingContext, setOnboardingContext] = useState<OnboardingContext | null>(null);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [hasRememberedUsername, setHasRememberedUsername] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const rememberedUsername = window.localStorage.getItem(rememberedUsernameKey) ?? "";

      if (rememberedUsername) {
        setUsername(rememberedUsername);
        setHasRememberedUsername(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const saveRememberedUsername = (nextUsername: string) => {
    if (!keepSignedIn) {
      window.localStorage.removeItem(rememberedUsernameKey);
      setHasRememberedUsername(false);
      return;
    }

    const normalized = normalizeUsername(nextUsername);
    if (normalized) {
      window.localStorage.setItem(rememberedUsernameKey, normalized);
      setHasRememberedUsername(true);
    }
  };

  const clearRememberedUsername = () => {
    window.localStorage.removeItem(rememberedUsernameKey);
    setHasRememberedUsername(false);
    setUsername("");
  };

  const enterApp = () => {
    router.replace("/");
    router.refresh();
  };

  const prepareNotificationStep = async () => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setNotificationSupported(supported);
    setNotificationPermission(supported ? Notification.permission : "denied");

    if (supported) {
      const registration = await getServiceWorkerRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setNotificationsEnabled(Boolean(subscription));
    }
  };

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
      setError(signInError.message || "Your session expired. Please sign in again.");
      return;
    }

    saveRememberedUsername(assignedUsername);
    enterApp();
  };

  const handleClaim = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const isSharedOperationsSetup = assignedUsername === "sputum" || assignedUsername === "ventilator";
    const minimumPasswordLength = isSharedOperationsSetup ? 4 : 8;

    if (password.length < minimumPasswordLength) {
      setError(`Use a password with at least ${minimumPasswordLength} characters.`);
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

    const result = (await response.json().catch(() => ({}))) as ClaimResponse;
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

    saveRememberedUsername(result.username ?? assignedUsername);

    if (!result.staffProfileId || !result.departmentId) {
      enterApp();
      return;
    }

    if (
      result.operationsRole === "command_center" ||
      result.operationsRole === "director" ||
      result.operationsRole === "icu_command_center"
    ) {
      enterApp();
      return;
    }

    setOnboardingContext({
      staffProfileId: result.staffProfileId,
      departmentId: result.departmentId,
      displayName: result.displayName ?? displayName,
      role: result.role ?? "staff"
    });
    setPhoneNumber(result.phoneNumber ?? "");
    setContactEmail("");
    setPassword("");
    setConfirmPassword("");
    setMode("contact");
  };

  const saveContactInfo = async () => {
    if (!onboardingContext) {
      return false;
    }

    if (!isValidEmail(contactEmail)) {
      setError("Enter a valid email address or leave it blank.");
      return false;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const response = await fetch("/api/onboarding/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffProfileId: onboardingContext.staffProfileId,
        phoneNumber: phoneNumber.trim(),
        email: contactEmail.trim()
      })
    });

    setLoading(false);

    if (!response.ok) {
      setError("Unable to save contact information.");
      return false;
    }

    return true;
  };

  const continueFromContact = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await saveContactInfo();

    if (!saved) {
      return;
    }

    await prepareNotificationStep();
    setMode("notifications");
  };

  const skipContactInfo = async () => {
    setError("");
    setMessage("");
    await prepareNotificationStep();
    setMode("notifications");
  };

  const saveNotificationPreferences = async () => {
    if (!onboardingContext) {
      return false;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: saveError } = await supabase.from("notification_preferences").upsert(
      {
        department_id: onboardingContext.departmentId,
        staff_profile_id: onboardingContext.staffProfileId,
        short_shift_alerts: notificationPreferences.short_shift_alerts,
        coverage_request_alerts: notificationPreferences.coverage_request_alerts,
        switch_request_alerts: notificationPreferences.switch_request_alerts,
        coverage_offer_alerts: notificationPreferences.coverage_offer_alerts,
        quiet_hours_enabled: false,
        quiet_hours_start: null,
        quiet_hours_end: null
      },
      { onConflict: "staff_profile_id" }
    );

    setLoading(false);

    if (saveError) {
      setError("Unable to save notification preferences.");
      return false;
    }

    return true;
  };

  const enableNotifications = async () => {
    if (!onboardingContext) {
      return;
    }

    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setNotificationSupported(supported);

    if (!supported) {
      setError("Notifications are not supported on this device. You can still check Cover/Switch manually.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const nextPermission = await Notification.requestPermission();
    setNotificationPermission(nextPermission);

    if (nextPermission !== "granted") {
      setLoading(false);
      setError("Notifications are not enabled on this device. You can still use the app normally.");
      return;
    }

    const keyResponse = await fetch("/api/notifications/vapid-public-key");
    const { publicKey } = (await keyResponse.json().catch(() => ({}))) as { publicKey?: string };

    if (!publicKey) {
      setLoading(false);
      setError("Notification keys are not configured yet. You can continue without notifications.");
      return;
    }

    const registration = await getServiceWorkerRegistration();
    const subscription =
      (await registration?.pushManager.getSubscription()) ??
      (await registration?.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      }));
    const subscriptionJson = subscription?.toJSON();

    if (!subscription?.endpoint || !subscriptionJson?.keys?.p256dh || !subscriptionJson.keys.auth) {
      setLoading(false);
      setError("Unable to enable notifications on this device. You can continue without them.");
      return;
    }

    const supabase = createClient();
    const { error: saveError } = await supabase.from("push_subscriptions").upsert(
      {
        department_id: onboardingContext.departmentId,
        staff_profile_id: onboardingContext.staffProfileId,
        endpoint: subscription.endpoint,
        p256dh: subscriptionJson.keys.p256dh,
        auth: subscriptionJson.keys.auth,
        user_agent: navigator.userAgent,
        platform: getPlatform(),
        is_active: true,
        revoked_at: null
      },
      { onConflict: "staff_profile_id,endpoint" }
    );

    setLoading(false);

    if (saveError) {
      setError("Unable to save this device for notifications.");
      return;
    }

    setNotificationsEnabled(true);
    setMessage("Notifications enabled on this device.");
    await saveNotificationPreferences();
  };

  const finishNotificationSetup = async () => {
    const saved = await saveNotificationPreferences();

    if (saved) {
      enterApp();
    }
  };

  const resetLookup = () => {
    setMode("lookup");
    setAssignedUsername("");
    setDisplayName("");
    setPassword("");
    setConfirmPassword("");
    setPhoneNumber("");
    setContactEmail("");
    setOnboardingContext(null);
    setNotificationPreferences(defaultNotificationPreferences);
    setNotificationSupported(null);
    setNotificationPermission("default");
    setNotificationsEnabled(false);
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
            <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
              Username format: first 3 letters of your last name + first letter of your first name.
            </span>
            <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-400">
              Example: Michael Scott = scom
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-base font-bold lowercase text-hospital-ink outline-none focus:border-cyan-300"
            />
          </label>
          {hasRememberedUsername && (
            <button
              type="button"
              onClick={clearRememberedUsername}
              className="min-h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-500"
            >
              Clear remembered username
            </button>
          )}
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
          <TrustedDeviceOptions
            keepSignedIn={keepSignedIn}
            setKeepSignedIn={setKeepSignedIn}
          />
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
              minLength={assignedUsername === "sputum" ? 4 : 8}
              autoComplete="new-password"
              className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-base font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
            {assignedUsername === "sputum" && (
              <span className="mt-1 block text-xs font-bold text-slate-400">
                Temporary command-center password: 2000.
              </span>
            )}
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
              minLength={assignedUsername === "sputum" ? 4 : 8}
              autoComplete="new-password"
              className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-base font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
          </label>
          <TrustedDeviceOptions
            keepSignedIn={keepSignedIn}
            setKeepSignedIn={setKeepSignedIn}
          />
          <button
            type="submit"
            disabled={loading}
            className="min-h-12 w-full rounded-2xl bg-cyan-700 px-4 text-base font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>
      )}

      {mode === "contact" && (
        <form onSubmit={continueFromContact} className="space-y-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Step 1 of 2</p>
            <h2 className="mt-1 text-2xl font-black text-hospital-ink">Contact info</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Add contact details for the Staff Directory, or skip this for now.
            </p>
          </div>
          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Phone Number</span>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-base font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
            <span className="mt-1 block text-xs font-bold text-slate-400">Optional: Others can view</span>
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Email</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="Optional"
              className="mt-2 min-h-12 w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-base font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
            <span className="mt-1 block text-xs font-bold text-slate-400">Optional: Others can view</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void skipContactInfo()}
              disabled={loading}
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-h-12 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </div>
        </form>
      )}

      {mode === "notifications" && (
        <section className="space-y-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Step 2 of 2</p>
            <h2 className="mt-1 text-2xl font-black text-hospital-ink">Set up notifications</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">You can change this later.</p>
          </div>
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3 text-xs font-bold leading-5 text-cyan-900">
            For best notification support on iPhone, add this app to your Home Screen.
          </div>
          {notificationSupported === false && (
            <p className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              Notifications are not supported on this device. You can still use the app normally.
            </p>
          )}
          {notificationPermission === "denied" && (
            <p className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              Notifications are blocked in this browser. You can still continue.
            </p>
          )}
          <button
            type="button"
            onClick={() => void enableNotifications()}
            disabled={loading || notificationSupported === false || notificationsEnabled}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {notificationsEnabled ? <Bell size={17} /> : <BellOff size={17} />}
            {notificationsEnabled ? "Notifications enabled on this device" : "Enable notifications on this device"}
          </button>
          <div className="grid gap-2">
            {[
              ["short_shift_alerts", "Short Shift alerts"],
              ["coverage_request_alerts", "Coverage request alerts"],
              ["switch_request_alerts", "Switch request alerts"],
              ["coverage_offer_alerts", "Coverage offer alerts"]
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-extrabold text-slate-700"
              >
                {label}
                <input
                  type="checkbox"
                  checked={notificationPreferences[key as keyof NotificationPreferences]}
                  onChange={(event) =>
                    setNotificationPreferences({
                      ...notificationPreferences,
                      [key]: event.target.checked
                    })
                  }
                  className="h-5 w-5"
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setError("");
                setMessage("");
                setMode("contact");
              }}
              disabled={loading}
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Back
            </button>
            <button
              type="button"
              onClick={enterApp}
              disabled={loading}
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => void finishNotificationSetup()}
              disabled={loading}
              className="min-h-12 rounded-2xl bg-cyan-700 px-3 text-sm font-black text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </div>
        </section>
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

      {mode !== "lookup" && mode !== "contact" && mode !== "notifications" && (
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
