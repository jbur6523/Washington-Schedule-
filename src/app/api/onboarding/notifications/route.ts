import { NextResponse } from "next/server";
import { canUseNotifications } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type NotificationPreferencesInput = {
  short_shift_alerts?: boolean;
  coverage_request_alerts?: boolean;
  switch_request_alerts?: boolean;
  coverage_offer_alerts?: boolean;
};

type PushSubscriptionInput = {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  userAgent?: string;
  platform?: string;
};

type NotificationSetupRequest = {
  preferences?: NotificationPreferencesInput;
  subscription?: PushSubscriptionInput;
};

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0"
};

function hasValidPreferences(
  value: NotificationPreferencesInput | undefined
): value is Required<NotificationPreferencesInput> {
  return Boolean(
    value
      && typeof value.short_shift_alerts === "boolean"
      && typeof value.coverage_request_alerts === "boolean"
      && typeof value.switch_request_alerts === "boolean"
      && typeof value.coverage_offer_alerts === "boolean"
  );
}

function validSubscription(value: PushSubscriptionInput | undefined) {
  if (!value) {
    return true;
  }

  let endpoint: URL;
  try {
    endpoint = new URL(value.endpoint ?? "");
  } catch {
    return false;
  }

  return (
    endpoint.protocol === "https:"
    && (value.endpoint?.length ?? 0) <= 2048
    && Boolean(value.p256dh)
    && (value.p256dh?.length ?? 0) <= 1024
    && Boolean(value.auth)
    && (value.auth?.length ?? 0) <= 1024
    && (value.userAgent?.length ?? 0) <= 512
    && ["ios", "android", "web"].includes(value.platform ?? "")
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as NotificationSetupRequest;

  if (!hasValidPreferences(body.preferences) || !validSubscription(body.subscription)) {
    return NextResponse.json(
      { message: "Notification settings are invalid." },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated") {
    return NextResponse.json(
      { message: auth.status === "error" ? "Unable to verify access." : "Sign in required." },
      { status: auth.status === "error" ? 503 : 401, headers: noStoreHeaders }
    );
  }

  if (!canUseNotifications(auth.context)) {
    return NextResponse.json(
      { message: "Notifications are disabled for this account." },
      { status: 403, headers: noStoreHeaders }
    );
  }

  const supabase = await createClient();
  const { error: preferencesError } = await supabase.from("notification_preferences").upsert(
    {
      department_id: auth.context.departmentId,
      staff_profile_id: auth.context.staffProfileId,
      short_shift_alerts: body.preferences.short_shift_alerts,
      coverage_request_alerts: body.preferences.coverage_request_alerts,
      switch_request_alerts: body.preferences.switch_request_alerts,
      coverage_offer_alerts: body.preferences.coverage_offer_alerts,
      quiet_hours_enabled: false,
      quiet_hours_start: null,
      quiet_hours_end: null
    },
    { onConflict: "staff_profile_id" }
  );

  if (preferencesError) {
    return NextResponse.json(
      { message: "Unable to save notification settings." },
      { status: 400, headers: noStoreHeaders }
    );
  }

  if (body.subscription) {
    const { error: subscriptionError } = await supabase.from("push_subscriptions").upsert(
      {
        department_id: auth.context.departmentId,
        staff_profile_id: auth.context.staffProfileId,
        endpoint: body.subscription.endpoint,
        p256dh: body.subscription.p256dh,
        auth: body.subscription.auth,
        user_agent: body.subscription.userAgent ?? null,
        platform: body.subscription.platform,
        is_active: true,
        revoked_at: null
      },
      { onConflict: "staff_profile_id,endpoint" }
    );

    if (subscriptionError) {
      return NextResponse.json(
        { message: "Unable to save this notification device." },
        { status: 400, headers: noStoreHeaders }
      );
    }
  }

  return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
}
