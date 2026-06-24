"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import type { TabId } from "@/components/BottomNavigation";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

type NotificationCenterProps = {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
  onNavigate: (tab: TabId) => void;
};

type NotificationEvent = {
  id: string;
  event_type: string;
  title: string;
  body: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  delivery_status: string;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
};

function formatCreatedAt(value: string) {
  const date = new Date(value);
  const now = new Date();
  const ageMs = now.getTime() - date.getTime();
  const minutes = Math.floor(ageMs / 60000);

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function tabForNotification(notification: NotificationEvent): TabId {
  if (notification.event_type === "short_shift" || notification.related_entity_type === "shift_shortage") {
    return "shift-board";
  }

  if (
    notification.event_type === "coverage_offer_created" ||
    notification.event_type === "switch_offer_created" ||
    notification.event_type === "offer_accepted" ||
    notification.event_type === "offer_declined"
  ) {
    return "manage-schedule";
  }

  return "staff";
}

export function NotificationCenter({ authContext, developmentFallback, onNavigate }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read_at && !notification.dismissed_at).length,
    [notifications]
  );

  const loadNotifications = useCallback(async () => {
    if (developmentFallback || !authContext.staffProfileId) {
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("notification_events")
      .select("id, event_type, title, body, related_entity_type, related_entity_id, delivery_status, created_at, read_at, dismissed_at")
      .eq("recipient_staff_profile_id", authContext.staffProfileId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(30);

    setLoading(false);

    if (loadError) {
      setError("Unable to load notifications.");
      return;
    }

    setNotifications((data ?? []) as NotificationEvent[]);
  }, [authContext.staffProfileId, developmentFallback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadNotifications();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadNotifications]);

  const markRead = async (notificationId: string) => {
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, read_at: notification.read_at ?? readAt } : notification
      )
    );

    const supabase = createClient();
    await supabase.from("notification_events").update({ read_at: readAt }).eq("id", notificationId);
  };

  const markAllRead = async () => {
    if (!authContext.staffProfileId || unreadCount === 0) {
      return;
    }

    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read_at: notification.read_at ?? readAt }))
    );

    const supabase = createClient();
    await supabase
      .from("notification_events")
      .update({ read_at: readAt })
      .eq("recipient_staff_profile_id", authContext.staffProfileId)
      .is("read_at", null)
      .is("dismissed_at", null);
  };

  const handleRelatedAction = async (notification: NotificationEvent) => {
    await markRead(notification.id);
    setOpen(false);
    onNavigate(tabForNotification(notification));
  };

  if (developmentFallback || !authContext.staffProfileId) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          void loadNotifications();
        }}
        className="relative inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
      >
        <Bell size={14} />
        Alerts
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-fuchsia-600 px-1 text-[10px] font-black text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-24 z-50 mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-hospital-ink">Notifications</h2>
              <p className="mt-0.5 text-xs font-bold text-slate-500">
                {unreadCount} unread
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={unreadCount === 0}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-cyan-100 bg-cyan-50 px-3 text-xs font-extrabold text-cyan-700 disabled:opacity-50"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-500"
                aria-label="Close notifications"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="mt-3 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
            {loading && <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">Loading notifications...</p>}
            {error && <p className="rounded-2xl bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">{error}</p>}
            {!loading && !error && notifications.length === 0 && (
              <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">No notifications yet.</p>
            )}
            {notifications.map((notification) => {
              const unread = !notification.read_at;

              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border px-3 py-3 ${
                    unread ? "border-fuchsia-100 bg-fuchsia-50/80" : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-hospital-ink">{notification.title}</p>
                      <p className="mt-1 text-sm font-bold leading-5 text-slate-600">{notification.body}</p>
                      <p className="mt-2 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                        {formatCreatedAt(notification.created_at)}
                      </p>
                    </div>
                    {unread && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-fuchsia-600" />}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRelatedAction(notification)}
                      className="min-h-9 rounded-xl bg-cyan-700 px-3 text-xs font-extrabold text-white"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => void markRead(notification.id)}
                      disabled={!unread}
                      className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 disabled:opacity-50"
                    >
                      Mark read
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
