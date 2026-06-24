import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createAndSendStaffNotification, type NotificationPreferenceKey } from "@/lib/notifications/web-push";
import { shiftTypeLabels, type ShiftType } from "@/lib/schedule/supabase-schedule";

export const runtime = "nodejs";

type OfferEventType = "coverage_offer_created" | "switch_offer_created" | "offer_accepted" | "offer_declined";

type OfferEventBody = {
  offer_id?: string;
  event_type?: OfferEventType;
};

type StaffProfile = {
  id: string;
  display_name: string;
};

type ShiftTarget = {
  shift_date: string;
  shift_type: ShiftType;
  shift_start: string;
  shift_end: string;
};

type ShiftRequest = {
  id: string;
  department_id: string;
  staff_profile_id: string;
  request_type: "switch_requested" | "coverage_requested";
  staff_profiles: StaffProfile | StaffProfile[] | null;
  schedule_entries: ShiftTarget | ShiftTarget[] | null;
  user_schedule_overrides: ShiftTarget | ShiftTarget[] | null;
};

type ShiftRequestOffer = {
  id: string;
  department_id: string;
  offer_type: "coverage" | "switch";
  offered_by_staff_profile_id: string;
  offered_date: string | null;
  offered_shift_type: ShiftType | null;
  offered_shift_start: string | null;
  offered_shift_end: string | null;
  staff_profiles: StaffProfile | StaffProfile[] | null;
  shift_requests: ShiftRequest | ShiftRequest[] | null;
  schedule_entries: ShiftTarget | ShiftTarget[] | null;
  user_schedule_overrides: ShiftTarget | ShiftTarget[] | null;
};

const eventTypes = new Set<OfferEventType>([
  "coverage_offer_created",
  "switch_offer_created",
  "offer_accepted",
  "offer_declined"
]);

function firstRelatedRow<T>(value?: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatDateShort(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "numeric", day: "numeric" }).format(date);
}

function getShiftTargetSummary(shift: ShiftTarget) {
  return `${formatDateShort(shift.shift_date)} ${shiftTypeLabels[shift.shift_type] ?? "Shift"}`;
}

function getRequestShift(request: ShiftRequest) {
  return firstRelatedRow(request.schedule_entries) ?? firstRelatedRow(request.user_schedule_overrides);
}

function getOfferShift(offer: ShiftRequestOffer) {
  const linkedShift = firstRelatedRow(offer.schedule_entries) ?? firstRelatedRow(offer.user_schedule_overrides);

  if (linkedShift) {
    return linkedShift;
  }

  if (offer.offered_date && offer.offered_shift_type && offer.offered_shift_start && offer.offered_shift_end) {
    return {
      shift_date: offer.offered_date,
      shift_type: offer.offered_shift_type,
      shift_start: offer.offered_shift_start,
      shift_end: offer.offered_shift_end
    };
  }

  return null;
}

function getOfferNotification(
  offer: ShiftRequestOffer,
  request: ShiftRequest,
  eventType: OfferEventType
): {
  recipientStaffProfileId: string;
  title: string;
  body: string;
  preferenceKey: NotificationPreferenceKey;
  url: string;
} {
  const offerer = firstRelatedRow(offer.staff_profiles);
  const requestShift = getRequestShift(request);
  const offerShift = getOfferShift(offer);
  const offererName = offerer?.display_name ?? "A staff member";
  const requestShiftSummary = requestShift ? getShiftTargetSummary(requestShift) : "your shift";
  const offerShiftSummary = offerShift ? formatDateShort(offerShift.shift_date) : "a shift";

  if (eventType === "coverage_offer_created") {
    return {
      recipientStaffProfileId: request.staff_profile_id,
      title: "Coverage Offer",
      body: `${offererName} offered to cover your ${requestShiftSummary} shift.`,
      preferenceKey: "coverage_request_alerts",
      url: "/?tab=manage-schedule"
    };
  }

  if (eventType === "switch_offer_created") {
    return {
      recipientStaffProfileId: request.staff_profile_id,
      title: "Switch Offer",
      body: `${offererName} offered to switch ${offerShiftSummary} for your ${requestShiftSummary} shift.`,
      preferenceKey: "switch_request_alerts",
      url: "/?tab=manage-schedule"
    };
  }

  return {
    recipientStaffProfileId: offer.offered_by_staff_profile_id,
    title: eventType === "offer_accepted" ? "Offer Accepted" : "Offer Declined",
    body: eventType === "offer_accepted" ? "Your offer was accepted." : "Your offer was declined.",
    preferenceKey: "coverage_offer_alerts",
    url: "/?tab=manage-schedule"
  };
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!auth.context.staffProfileId) {
    return NextResponse.json({ error: "Linked staff profile required" }, { status: 403 });
  }

  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: "Notification service is not configured" }, { status: 503 });
  }

  const body = (await request.json()) as OfferEventBody;

  if (!body.offer_id || !body.event_type || !eventTypes.has(body.event_type)) {
    return NextResponse.json({ error: "Invalid notification event" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: offer, error } = await supabase
    .from("shift_request_offers")
    .select(
      "id, department_id, offer_type, offered_by_staff_profile_id, offered_date, offered_shift_type, offered_shift_start, offered_shift_end, staff_profiles(id, display_name), shift_requests(id, department_id, staff_profile_id, request_type, staff_profiles(id, display_name), schedule_entries(shift_date, shift_type, shift_start, shift_end), user_schedule_overrides(shift_date, shift_type, shift_start, shift_end)), schedule_entries(shift_date, shift_type, shift_start, shift_end), user_schedule_overrides(shift_date, shift_type, shift_start, shift_end)"
    )
    .eq("id", body.offer_id)
    .eq("department_id", auth.context.departmentId)
    .maybeSingle<ShiftRequestOffer>();

  const relatedRequest = offer ? firstRelatedRow(offer.shift_requests) : null;

  if (error || !offer || !relatedRequest) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  const isCreatedEvent = body.event_type === "coverage_offer_created" || body.event_type === "switch_offer_created";
  const actorCanSend =
    (isCreatedEvent && offer.offered_by_staff_profile_id === auth.context.staffProfileId) ||
    (!isCreatedEvent && relatedRequest.staff_profile_id === auth.context.staffProfileId);

  if (!actorCanSend) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  if (body.event_type === "coverage_offer_created" && offer.offer_type !== "coverage") {
    return NextResponse.json({ error: "Offer type mismatch" }, { status: 400 });
  }

  if (body.event_type === "switch_offer_created" && offer.offer_type !== "switch") {
    return NextResponse.json({ error: "Offer type mismatch" }, { status: 400 });
  }

  const notification = getOfferNotification(offer, relatedRequest, body.event_type);
  const result = await createAndSendStaffNotification({
    departmentId: auth.context.departmentId,
    recipientStaffProfileId: notification.recipientStaffProfileId,
    eventType: body.event_type,
    title: notification.title,
    body: notification.body,
    relatedEntityType: "shift_request_offer",
    relatedEntityId: offer.id,
    preferenceKey: notification.preferenceKey,
    url: notification.url
  });

  return NextResponse.json({ notification: result });
}
