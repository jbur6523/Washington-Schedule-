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
  coverage_request_alerts: boolean;
  switch_request_alerts: boolean;
  coverage_offer_alerts: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

export type NotificationPreferenceKey =
  | "short_shift_alerts"
  | "coverage_request_alerts"
  | "switch_request_alerts"
  | "coverage_offer_alerts";

type SendShortShiftNotificationInput = {
  departmentId: string;
  shiftShortageId: string;
  shiftDate: string;
  shiftType: ShiftType;
  shiftStart: string;
  shiftEnd: string;
  severity: ShiftShortageSeverity;
};

type SendStaffNotificationInput = {
  departmentId: string;
  recipientStaffProfileId: string;
  eventType: string;
  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  url?: string;
  preferenceKey?: NotificationPreferenceKey;
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

function getShortShiftPayload(input: SendShortShiftNotificationInput) {
  const shiftLabel = shiftTypeLabels[input.shiftType];
  const dateLabel = formatDateForNotification(input.shiftDate);
  const urgent = input.severity === "urgent";

  return {
    title: urgent ? "Urgent Short Shift" : "Short Shift",
    body: urgent
      ? `${shiftLabel} urgently needs coverage. Tap to view.`
      : `${shiftLabel} is short on ${dateLabel}. Tap to view.`,
    url: "/?tab=cover-switch"
  };
}

function pushSubscriptionFromRow(subscription: PushSubscriptionRow) {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth
    }
  };
}

async function deactivateSubscription(subscriptionId: string) {
  const supabase = createAdminClient();
  await supabase
    .from("push_subscriptions")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("id", subscriptionId);
}

async function markDeliveryEvent(
  notificationEventId: string,
  deliveryStatus: "sent" | "failed" | "skipped",
  errorMessage?: string
) {
  const supabase = createAdminClient();
  await supabase
    .from("notification_events")
    .update({
      delivery_status: deliveryStatus,
      sent_at: deliveryStatus === "sent" ? new Date().toISOString() : null,
      error_message: errorMessage ?? null
    })
    .eq("id", notificationEventId);
}

export async function createAndSendStaffNotification(input: SendStaffNotificationInput) {
  if (!hasSupabaseAdminConfig()) {
    return { sent: 0, skipped: true };
  }

  const supabase = createAdminClient();
  const { data: notificationEvent, error: notificationError } = await supabase
    .from("notification_events")
    .insert({
      department_id: input.departmentId,
      staff_profile_id: input.recipientStaffProfileId,
      recipient_staff_profile_id: input.recipientStaffProfileId,
      event_type: input.eventType,
      title: input.title,
      body: input.body,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
      delivery_status: "queued"
    })
    .select("id")
    .single();

  if (notificationError || !notificationEvent?.id) {
    return { sent: 0, skipped: true };
  }

  if (!configureWebPush()) {
    await markDeliveryEvent(notificationEvent.id as string, "skipped", "Push configuration is missing.");
    return { sent: 0, skipped: true, notificationEventId: notificationEvent.id as string };
  }

  const { data: preference } = await supabase
    .from("notification_preferences")
    .select(
      "staff_profile_id, short_shift_alerts, coverage_request_alerts, switch_request_alerts, coverage_offer_alerts, quiet_hours_enabled, quiet_hours_start, quiet_hours_end"
    )
    .eq("department_id", input.departmentId)
    .eq("staff_profile_id", input.recipientStaffProfileId)
    .maybeSingle<NotificationPreferenceRow>();

  if (preference?.[input.preferenceKey ?? "short_shift_alerts"] === false || (preference && isWithinQuietHours(preference))) {
    await markDeliveryEvent(notificationEvent.id as string, "skipped", "Notification preference disabled or quiet hours active.");
    return { sent: 0, skipped: true, notificationEventId: notificationEvent.id as string };
  }

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, staff_profile_id, endpoint, p256dh, auth")
    .eq("department_id", input.departmentId)
    .eq("staff_profile_id", input.recipientStaffProfileId)
    .eq("is_active", true);

  const targetSubscriptions = (subscriptions ?? []) as PushSubscriptionRow[];

  if (targetSubscriptions.length === 0) {
    await markDeliveryEvent(notificationEvent.id as string, "skipped", "No active push subscriptions.");
    return { sent: 0, skipped: true, notificationEventId: notificationEvent.id as string };
  }

  let sent = 0;
  let failed = 0;

  await Promise.all(
    targetSubscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          pushSubscriptionFromRow(subscription),
          JSON.stringify({
            title: input.title,
            body: input.body,
            url: input.url ?? "/"
          })
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : null;

        if (statusCode === 404 || statusCode === 410) {
          await deactivateSubscription(subscription.id);
        }
      }
    })
  );

  await markDeliveryEvent(
    notificationEvent.id as string,
    sent > 0 ? "sent" : "failed",
    sent > 0 ? undefined : failed > 0 ? "Push delivery failed." : undefined
  );

  return { sent, skipped: false, notificationEventId: notificationEvent.id as string };
}

export async function sendShortShiftNotifications(input: SendShortShiftNotificationInput) {
  if (!hasSupabaseAdminConfig()) {
    return { sent: 0, skipped: true };
  }

  const supabase = createAdminClient();
  const payload = getShortShiftPayload(input);
  const { data: activeStaff } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("department_id", input.departmentId)
    .eq("is_active", true);
  const activeStaffIds = new Set((activeStaff ?? []).map((staff) => staff.id as string));

  if (activeStaffIds.size === 0) {
    return { sent: 0, skipped: false };
  }

  let sent = 0;

  await Promise.all(
    Array.from(activeStaffIds).map(async (staffProfileId) => {
      const result = await createAndSendStaffNotification({
        departmentId: input.departmentId,
        recipientStaffProfileId: staffProfileId,
        eventType: "short_shift",
        title: payload.title,
        body: payload.body,
        relatedEntityType: "shift_shortage",
        relatedEntityId: input.shiftShortageId,
        url: payload.url,
        preferenceKey: "short_shift_alerts"
      });
      sent += result.sent;
    })
  );

  return { sent, skipped: false };
}

export function getPublicVapidKey() {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}
