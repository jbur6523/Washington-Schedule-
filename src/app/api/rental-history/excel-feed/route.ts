import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

type EquipmentType = "bipap" | "v60";
type RelatedStaff = { display_name: string } | { display_name: string }[] | null;
type RelatedVendor = { name: string } | { name: string }[] | null;

type RentalRecord = {
  id: string;
  equipment_type: EquipmentType;
  barcode_number: string | null;
  serial_number: string | null;
  called_in_at: string | null;
  called_in_by_name: string | null;
  checked_in_at: string | null;
  pickup_requested_at: string | null;
  returned_at: string | null;
  rental_vendors: RelatedVendor;
  checked_in_by: RelatedStaff;
  called_in_by: RelatedStaff;
  pickup_requested_by: RelatedStaff;
  returned_by: RelatedStaff;
};

type RentalEvent = {
  id: string;
  rental_record_id: string | null;
  event_type: string;
  event_at: string;
  staff_profiles: RelatedStaff;
};

const fallbackTimezone = "America/Los_Angeles";
const equipmentLabels: Record<EquipmentType, string> = {
  bipap: "BiPAP V60",
  v60: "BiPAP V60"
};
const calledInEventTypes = new Set(["called_in", "pending_delivery"]);
const deliveredEventTypes = new Set(["delivered", "checked_in"]);
const pickupEventTypes = new Set(["pickup_requested", "pickup_called", "called_for_pickup"]);
const pickedUpEventTypes = new Set(["returned", "picked_up"]);
const csvHeaders = [
  "Rental Company",
  "Qty",
  "Barcode #",
  "Serial Number",
  "Equipment Description",
  "Ordered Date",
  "Ordered Time",
  "Ordered Initials",
  "Delivered Date",
  "Delivered Time",
  "Delivered Initials",
  "Called for Return Date",
  "Called for Return Time",
  "Called for Return Initials",
  "Picked Up Date",
  "Picked Up Time",
  "Picked Up Initials"
];

export const runtime = "nodejs";

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function safeTokenEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function tokenFromRequest(request: Request) {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token")?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";

  return queryToken || bearerToken;
}

function formatDatePart(value: string | null, timezone: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatTimePart(value: string | null, timezone: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).format(new Date(value));
}

function findEvent(events: RentalEvent[], eventTypes: Set<string>) {
  return events.find((event) => eventTypes.has(event.event_type)) ?? null;
}

function staffInitials(displayName: string | null | undefined) {
  const normalized = displayName?.trim();

  if (!normalized) {
    return "";
  }

  const initials = normalized
    .split(/\s+/)
    .map((part) => part.split("-")[0]?.match(/[A-Za-z0-9]/)?.[0] ?? "")
    .filter(Boolean)
    .join("")
    .toUpperCase();

  return initials || "";
}

function escapeCsvCell(value: unknown) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function csvFromRows(rows: Array<Record<string, string>>) {
  return [
    csvHeaders.map(escapeCsvCell).join(","),
    ...rows.map((row) => csvHeaders.map((header) => escapeCsvCell(row[header])).join(","))
  ].join("\r\n");
}

function sortRecordTime(record: RentalRecord) {
  return new Date(record.called_in_at ?? record.checked_in_at ?? record.returned_at ?? 0).getTime();
}

export async function GET(request: Request) {
  const configuredToken = process.env.RENTAL_EXCEL_SYNC_TOKEN?.trim();

  if (!configuredToken) {
    return NextResponse.json({ error: "Excel feed is not configured" }, { status: 503 });
  }

  const requestToken = tokenFromRequest(request);

  if (!requestToken) {
    return NextResponse.json({ error: "Missing feed token" }, { status: 401 });
  }

  if (!safeTokenEqual(requestToken, configuredToken)) {
    return NextResponse.json({ error: "Invalid feed token" }, { status: 403 });
  }

  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: "Supabase admin configuration is missing" }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { data: departments } = await supabase.from("departments").select("id, timezone").limit(1);
  const timezone = departments?.[0]?.timezone || fallbackTimezone;
  const rentalRecordSelect = [
    "id",
    "equipment_type",
    "barcode_number",
    "serial_number",
    "called_in_at",
    "called_in_by_name",
    "checked_in_at",
    "pickup_requested_at",
    "returned_at",
    "rental_vendors(name)",
    "checked_in_by:staff_profiles!rental_records_checked_in_by_staff_profile_id_fkey(display_name)",
    "called_in_by:staff_profiles!rental_records_called_in_by_staff_profile_id_fkey(display_name)",
    "pickup_requested_by:staff_profiles!rental_records_pickup_requested_by_staff_profile_id_fkey(display_name)",
    "returned_by:staff_profiles!rental_records_returned_by_staff_profile_id_fkey(display_name)"
  ].join(", ");
  const { data: records, error: recordsError } = await supabase
    .from("rental_records")
    .select(rentalRecordSelect)
    .order("called_in_at", { ascending: true, nullsFirst: false })
    .returns<RentalRecord[]>();

  if (recordsError) {
    return NextResponse.json({ error: "Unable to load rental history feed" }, { status: 500 });
  }

  const recordIds = (records ?? []).map((record) => record.id);
  const { data: events } =
    recordIds.length > 0
      ? await supabase
          .from("rental_events")
          .select("id, rental_record_id, event_type, event_at, staff_profiles(display_name)")
          .in("rental_record_id", recordIds)
          .order("event_at", { ascending: true })
          .returns<RentalEvent[]>()
      : { data: [] as RentalEvent[] };
  const eventsByRecordId = (events ?? []).reduce<Record<string, RentalEvent[]>>((accumulator, event) => {
    if (!event.rental_record_id) {
      return accumulator;
    }

    accumulator[event.rental_record_id] = [...(accumulator[event.rental_record_id] ?? []), event];
    return accumulator;
  }, {});
  const rows = (records ?? [])
    .sort((left, right) => sortRecordTime(left) - sortRecordTime(right))
    .map((record) => {
      const recordEvents = eventsByRecordId[record.id] ?? [];
      const calledInEvent = findEvent(recordEvents, calledInEventTypes);
      const deliveredEvent = findEvent(recordEvents, deliveredEventTypes);
      const pickupEvent = findEvent(recordEvents, pickupEventTypes);
      const pickedUpEvent = findEvent(recordEvents, pickedUpEventTypes);
      const vendor = firstRelated(record.rental_vendors);
      const calledInBy =
        firstRelated(record.called_in_by)?.display_name ??
        record.called_in_by_name ??
        (calledInEvent ? firstRelated(calledInEvent.staff_profiles)?.display_name : "");
      const deliveredBy = firstRelated(record.checked_in_by)?.display_name ?? (deliveredEvent ? firstRelated(deliveredEvent.staff_profiles)?.display_name : "");
      const pickupBy = firstRelated(record.pickup_requested_by)?.display_name ?? (pickupEvent ? firstRelated(pickupEvent.staff_profiles)?.display_name : "");
      const pickedUpBy = firstRelated(record.returned_by)?.display_name ?? (pickedUpEvent ? firstRelated(pickedUpEvent.staff_profiles)?.display_name : "");
      const pickupAt = pickupEvent?.event_at ?? record.pickup_requested_at;
      const pickedUpAt = pickedUpEvent?.event_at ?? record.returned_at;

      return {
        "Rental Company": vendor?.name ?? "",
        Qty: "1",
        "Barcode #": record.barcode_number ?? "",
        "Serial Number": record.serial_number ?? "",
        "Equipment Description": equipmentLabels[record.equipment_type],
        "Ordered Date": formatDatePart(record.called_in_at, timezone),
        "Ordered Time": formatTimePart(record.called_in_at, timezone),
        "Ordered Initials": staffInitials(calledInBy),
        "Delivered Date": formatDatePart(record.checked_in_at, timezone),
        "Delivered Time": formatTimePart(record.checked_in_at, timezone),
        "Delivered Initials": staffInitials(deliveredBy),
        "Called for Return Date": formatDatePart(pickupAt ?? null, timezone),
        "Called for Return Time": formatTimePart(pickupAt ?? null, timezone),
        "Called for Return Initials": staffInitials(pickupBy),
        "Picked Up Date": formatDatePart(pickedUpAt ?? null, timezone),
        "Picked Up Time": formatTimePart(pickedUpAt ?? null, timezone),
        "Picked Up Initials": staffInitials(pickedUpBy)
      };
    });
  const csv = csvFromRows(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="whhs-rental-equipment-log-feed.csv"',
      "Cache-Control": "no-store"
    }
  });
}
