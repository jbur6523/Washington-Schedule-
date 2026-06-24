import "server-only";

import webpush from "web-push";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { shiftTypeLabels, type ShiftShortageSeverity, type ShiftType } from "@/lib/schedule/supabase-schedule";

type PushSubscriptionRow = {
  id: string;
  staff_profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type NotificationPreferenceRow = {
  staff_profile_id: string;
  short_shift_alerts: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

type SendShortShiftNotificationInput = {
  departmentId: string;
  shiftShortageId: string;
  shiftDate: string;
  shiftType: ShiftType;
  shiftStart: string;
  shiftEnd: string;
  severity: ShiftShortageSeverity;
};

function hasVapidConfig() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configureWebPush() {
  if (!hasVapidConfig()) {
    return false;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string
  );
  return true;
}

function formatDateForNotification(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  const dateLabel = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric" }).format(date);
  return `${weekday} ${dateLabel}`;
}

function formatTimeForQuietHours(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}

function isWithinQuietHours(preference: NotificationPreferenceRow) {
  if (!preference.quiet_hours_enabled || !preference.quiet_hours_start || !preference.quiet_hours_end) {
    return false;
  }

  const now = formatTimeForQuietHours();
  const start = preference.quiet_hours_start;
  const end = preference.quiet_hours_end;

  if (start <= end) {
    return now >= start && now <= end;
  }

  return now >= start || now <= end;
}

function getPayload(input: SendShortShiftNotificationInput) {
  const shiftLabel = shiftTypeLabels[input.shiftType];
  const dateLabel = formatDateForNotification(input.shiftDate);
  const urgent = input.severity === "urgent";

  return {
    title: urgent ? "Urgent Short Shift" : "Short Shift",
    body: urgent
      ? `${shiftLabel} urgently needs coverage. Tap to view.`
      : `${shiftLabel} is short on ${dateLabel}. Tap to view.`,
    url: "/?tab=shift-board"
  };
}

export async function sendShortShiftNotifications(input: SendShortShiftNotificationInput) {
  if (!hasSupabaseAdminConfig() || !configureWebPush()) {
    return { sent: 0, skipped: true };
  }

  const supabase = createAdminClient();
  const payload = getPayload(input);
  const { data: activeStaff } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("department_id", input.departmentId)
    .eq("is_active", true);
  const activeStaffIds = new Set((activeStaff ?? []).map((staff) => staff.id as string));

  if (activeStaffIds.size === 0) {
    return { sent: 0, skipped: false };
  }

  const [{ data: subscriptions }, { data: preferences }] = await Promise.all([
    supabase
      .from("push_subscriptions")
      .select("id, staff_profile_id, endpoint, p256dh, auth")
      .eq("department_id", input.departmentId)
      .eq("is_active", true),
    supabase
      .from("notification_preferences")
      .select("staff_profile_id, short_shift_alerts, quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
      .eq("department_id", input.departmentId)
  ]);

  const preferenceMap = new Map(
    ((preferences ?? []) as NotificationPreferenceRow[]).map((preference) => [preference.staff_profile_id, preference])
  );
  const targetSubscriptions = ((subscriptions ?? []) as PushSubscriptionRow[]).filter((subscription) => {
    if (!activeStaffIds.has(subscription.staff_profile_id)) {
      return false;
    }

    const preference = preferenceMap.get(subscription.staff_profile_id);

    if (preference?.short_shift_alerts === false) {
      return false;
    }

    return !preference || !isWithinQuietHours(preference);
  });

  let sent = 0;

  await Promise.all(
    targetSubscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          },
          JSON.stringify(payload)
        );
        sent += 1;
        await supabase.from("notification_events").insert({
          department_id: input.departmentId,
          staff_profile_id: subscription.staff_profile_id,
          event_type: "short_shift",
          title: payload.title,
          body: payload.body,
          related_entity_type: "shift_shortage",
          related_entity_id: input.shiftShortageId,
          delivery_status: "sent",
          sent_at: new Date().toISOString()
        });
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : null;

        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false, revoked_at: new Date().toISOString() })
            .eq("id", subscription.id);
        }

        await supabase.from("notification_events").insert({
          department_id: input.departmentId,
          staff_profile_id: subscription.staff_profile_id,
          event_type: "short_shift",
          title: payload.title,
          body: payload.body,
          related_entity_type: "shift_shortage",
          related_entity_id: input.shiftShortageId,
          delivery_status: "failed",
          error_message: "Push delivery failed."
        });
      }
    })
  );

  return { sent, skipped: false };
}

export function getPublicVapidKey() {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}
