import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createAndSendStaffNotification } from "@/lib/notifications/web-push";

export const runtime = "nodejs";

export async function POST() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.context.role !== "admin" || !auth.context.staffProfileId) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const result = await createAndSendStaffNotification({
    departmentId: auth.context.departmentId,
    recipientStaffProfileId: auth.context.staffProfileId,
    eventType: "test_notification",
    title: "Test Notification",
    body: "Washington Schedule notifications are working on this device.",
    relatedEntityType: "notification_test",
    url: "/?tab=staff",
    preferenceKey: "coverage_offer_alerts"
  });

  return NextResponse.json({ notification: result });
}
