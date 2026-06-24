"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Smartphone } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

type NotificationSettingsProps = {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
};

type NotificationPreference = {
  id?: string;
  short_shift_alerts: boolean;
  coverage_request_alerts: boolean;
  switch_request_alerts: boolean;
  coverage_offer_alerts: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

const defaultPreferences: NotificationPreference = {
  short_shift_alerts: true,
  coverage_request_alerts: true,
  switch_request_alerts: true,
  coverage_offer_alerts: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00"
};

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

export function NotificationSettings({ authContext, developmentFallback }: NotificationSettingsProps) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreference>(defaultPreferences);
  const [loading, setLoading] = useState(!developmentFallback);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSettings = useCallback(async () => {
    if (developmentFallback || !authContext.staffProfileId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const isSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(isSupported);
    setPermission(isSupported ? Notification.permission : "denied");

    if (isSupported) {
      const registration = await getServiceWorkerRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setEnabled(Boolean(subscription));
    }

    const supabase = createClient();
    const { data, error: preferencesError } = await supabase
      .from("notification_preferences")
      .select(
        "id, short_shift_alerts, coverage_request_alerts, switch_request_alerts, coverage_offer_alerts, quiet_hours_enabled, quiet_hours_start, quiet_hours_end"
      )
      .eq("staff_profile_id", authContext.staffProfileId)
      .maybeSingle();

    if (preferencesError) {
      setError("Unable to load notification preferences.");
    } else if (data) {
      setPreferences({
        id: data.id as string,
        short_shift_alerts: Boolean(data.short_shift_alerts),
        coverage_request_alerts: Boolean(data.coverage_request_alerts),
        switch_request_alerts: Boolean(data.switch_request_alerts),
        coverage_offer_alerts: Boolean(data.coverage_offer_alerts),
        quiet_hours_enabled: Boolean(data.quiet_hours_enabled),
        quiet_hours_start: ((data.quiet_hours_start as string | null) ?? "22:00").slice(0, 5),
        quiet_hours_end: ((data.quiet_hours_end as string | null) ?? "07:00").slice(0, 5)
      });
    }

    setLoading(false);
  }, [authContext.staffProfileId, developmentFallback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  const savePreferences = async (nextPreferences: NotificationPreference) => {
    if (!authContext.staffProfileId) {
      return;
    }

    setPreferences(nextPreferences);
    setSaving(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: saveError } = await supabase.from("notification_preferences").upsert(
      {
        department_id: authContext.departmentId,
        staff_profile_id: authContext.staffProfileId,
        short_shift_alerts: nextPreferences.short_shift_alerts,
        coverage_request_alerts: nextPreferences.coverage_request_alerts,
        switch_request_alerts: nextPreferences.switch_request_alerts,
        coverage_offer_alerts: nextPreferences.coverage_offer_alerts,
        quiet_hours_enabled: nextPreferences.quiet_hours_enabled,
        quiet_hours_start: nextPreferences.quiet_hours_enabled ? nextPreferences.quiet_hours_start : null,
        quiet_hours_end: nextPreferences.quiet_hours_enabled ? nextPreferences.quiet_hours_end : null
      },
      { onConflict: "staff_profile_id" }
    );

    setSaving(false);

    if (saveError) {
      setError("Unable to save notification preferences.");
      return;
    }

    setMessage("Notification preferences saved.");
  };

  const enableNotifications = async () => {
    if (!authContext.staffProfileId) {
      setError("Your staff profile must be linked before enabling notifications.");
      return;
    }

    if (!supported) {
      setError("Notifications are not supported on this device. You can still check the Coverage Board manually.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);

    if (nextPermission !== "granted") {
      setSaving(false);
      setError("Notifications are not enabled on this device. You can still check the Coverage Board manually.");
      return;
    }

    const keyResponse = await fetch("/api/notifications/vapid-public-key");
    const { publicKey } = (await keyResponse.json()) as { publicKey?: string };

    if (!publicKey) {
      setSaving(false);
      setError("Notification keys are not configured yet.");
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
      setSaving(false);
      setError("Unable to create a push subscription on this device.");
      return;
    }

    const supabase = createClient();
    const { error: saveError } = await supabase.from("push_subscriptions").upsert(
      {
        department_id: authContext.departmentId,
        staff_profile_id: authContext.staffProfileId,
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

    setSaving(false);

    if (saveError) {
      setError("Unable to save this device for notifications.");
      return;
    }

    setEnabled(true);
    setMessage("Notifications enabled on this device.");
    await savePreferences(preferences);
  };

  const disableNotifications = async () => {
    setSaving(true);
    setError("");
    setMessage("");

    const registration = await getServiceWorkerRegistration();
    const subscription = await registration?.pushManager.getSubscription();

    if (subscription) {
      const supabase = createClient();
      await supabase
        .from("push_subscriptions")
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }

    setSaving(false);
    setEnabled(false);
    setMessage("Notifications disabled on this device.");
  };

  if (developmentFallback) {
    return null;
  }

  if (!authContext.staffProfileId) {
    return (
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-xl font-black text-hospital-ink">Notifications</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          Link your staff profile before enabling notifications.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
          {enabled ? <Bell size={20} /> : <BellOff size={20} />}
        </span>
        <div>
          <h2 className="text-xl font-black text-hospital-ink">Notifications</h2>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
            Notifications only work on devices where you enable them.
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3">
        <div className="flex gap-2">
          <Smartphone size={17} className="mt-0.5 shrink-0 text-cyan-700" />
          <p className="text-xs font-bold leading-5 text-cyan-900">
            On iPhone, install the app to your Home Screen before enabling notifications: open in Safari, tap Share,
            then tap Add to Home Screen.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-3 text-sm font-bold text-slate-500">Loading notification settings...</p>
      ) : (
        <>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={enabled ? disableNotifications : enableNotifications}
              disabled={saving}
              className={`min-h-11 rounded-2xl px-3 text-sm font-extrabold text-white disabled:opacity-60 ${
                enabled ? "bg-slate-600" : "bg-cyan-700"
              }`}
            >
              {saving ? "Saving..." : enabled ? "Disable Notifications" : "Enable Notifications"}
            </button>
            <p className="text-xs font-bold leading-5 text-slate-500">
              Current device: {enabled ? "notifications enabled" : "notifications not enabled"}.
              {permission === "denied" ? " Permission is denied in this browser." : ""}
            </p>
          </div>

          <div className="mt-4 grid gap-2">
            {[
              ["short_shift_alerts", "Short Shift alerts"],
              ["coverage_request_alerts", "Coverage Requested alerts"],
              ["switch_request_alerts", "Switch Requested alerts"],
              ["coverage_offer_alerts", "Coverage offer alerts"]
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-extrabold text-slate-700"
              >
                {label}
                <input
                  type="checkbox"
                  checked={Boolean(preferences[key as keyof NotificationPreference])}
                  onChange={(event) =>
                    void savePreferences({
                      ...preferences,
                      [key]: event.target.checked
                    })
                  }
                  className="h-5 w-5"
                />
              </label>
            ))}
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-extrabold text-slate-700">
              Quiet hours
              <input
                type="checkbox"
                checked={preferences.quiet_hours_enabled}
                onChange={(event) =>
                  void savePreferences({
                    ...preferences,
                    quiet_hours_enabled: event.target.checked
                  })
                }
                className="h-5 w-5"
              />
            </label>
            {preferences.quiet_hours_enabled && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Start</span>
                  <input
                    type="time"
                    value={preferences.quiet_hours_start}
                    onChange={(event) =>
                      void savePreferences({ ...preferences, quiet_hours_start: event.target.value })
                    }
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">End</span>
                  <input
                    type="time"
                    value={preferences.quiet_hours_end}
                    onChange={(event) =>
                      void savePreferences({ ...preferences, quiet_hours_end: event.target.value })
                    }
                    className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                </label>
              </div>
            )}
          </div>
        </>
      )}

      {message && (
        <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
