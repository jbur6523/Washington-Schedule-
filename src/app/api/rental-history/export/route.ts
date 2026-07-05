import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

type RentalStatus =
  | "pending_delivery"
  | "called_in"
  | "active"
  | "delivered"
  | "pickup_requested"
  | "pickup_called"
  | "called_for_pickup"
  | "returned"
  | "picked_up"
  | "delivery_cancelled"
  | "cancelled";
type EquipmentType = "bipap" | "v60";
type StatusFilter = "all" | "pending" | "active" | "pickup" | "returned";
type EquipmentFilter = "all" | EquipmentType;
type DateRangePreset = "all" | "today" | "7" | "30" | "custom";

type RelatedStaff = { display_name: string } | { display_name: string }[] | null;
type RelatedVendor = { name: string } | { name: string }[] | null;

type RentalRecord = {
  id: string;
  vendor_id: string;
  equipment_type: EquipmentType;
  serial_number: string | null;
  status: RentalStatus;
  current_location: string | null;
  called_in_at: string | null;
  called_in_by_name: string | null;
  checked_in_at: string | null;
  pickup_requested_at: string | null;
  returned_at: string | null;
  cancelled_at: string | null;
  cancellation_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  bipap: "BiPAP",
  v60: "V60"
};
const statusFilters = new Set(["all", "pending", "active", "pickup", "returned"]);
const equipmentFilters = new Set(["all", "bipap", "v60"]);
const dateRangePresets = new Set(["all", "today", "7", "30", "custom"]);
const calledInEventTypes = new Set(["called_in", "pending_delivery"]);
const deliveredEventTypes = new Set(["delivered", "checked_in"]);
const pickupEventTypes = new Set(["pickup_requested", "pickup_called", "called_for_pickup"]);
const pickedUpEventTypes = new Set(["returned", "picked_up"]);

export const runtime = "nodejs";

function hasDashboardAccess(context: { role: string; operationsRole: string }) {
  return context.role === "admin" || context.role === "lead" || context.operationsRole === "aide";
}

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function isPendingDeliveryStatus(status: RentalStatus) {
  return status === "pending_delivery" || status === "called_in";
}

function isActiveStatus(status: RentalStatus) {
  return status === "active" || status === "delivered";
}

function isPickupCalledStatus(status: RentalStatus) {
  return status === "pickup_requested" || status === "pickup_called" || status === "called_for_pickup";
}

function isPickedUpStatus(status: RentalStatus) {
  return status === "returned" || status === "picked_up";
}

function isDeliveryCancelledStatus(status: RentalStatus) {
  return status === "delivery_cancelled";
}

function rentalStatusLabel(status: RentalStatus) {
  if (isPendingDeliveryStatus(status)) {
    return "Pending Delivery";
  }

  if (isPickupCalledStatus(status)) {
    return "Called for Pickup";
  }

  if (isPickedUpStatus(status)) {
    return "Picked Up";
  }

  if (isDeliveryCancelledStatus(status)) {
    return "Delivery Canceled";
  }

  if (status === "cancelled") {
    return "Cancelled";
  }

  return "Active";
}

function datePartsInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? "01";

  return {
    year: Number(getPart("year")),
    month: Number(getPart("month")),
    day: Number(getPart("day"))
  };
}

function startOfDateRangeDay(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function rangeForPreset(preset: DateRangePreset, startDate: string | null, endDate: string | null, timezone: string) {
  const todayParts = datePartsInTimezone(new Date(), timezone);
  const todayStartMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  const dayMs = 86_400_000;
  const rangeStartMs =
    preset === "today"
      ? todayStartMs
      : preset === "7"
        ? todayStartMs - 6 * dayMs
        : preset === "30"
          ? todayStartMs - 29 * dayMs
          : preset === "custom" && startDate
            ? startOfDateRangeDay(startDate)
            : null;
  const rangeEndMs =
    preset === "today" || preset === "7" || preset === "30"
      ? todayStartMs + dayMs - 1
      : preset === "custom" && endDate
        ? startOfDateRangeDay(endDate) + dayMs - 1
        : null;

  return { rangeStartMs, rangeEndMs };
}

function recordMatchesDateRange(record: RentalRecord, rangeStartMs: number | null, rangeEndMs: number | null) {
  if (rangeStartMs === null || rangeEndMs === null) {
    return true;
  }

  const calledInMs = record.called_in_at ? new Date(record.called_in_at).getTime() : null;
  const checkedInMs = record.checked_in_at ? new Date(record.checked_in_at).getTime() : null;
  const returnedMs = record.returned_at ? new Date(record.returned_at).getTime() : null;
  const cancelledMs = record.cancelled_at ? new Date(record.cancelled_at).getTime() : null;

  if (calledInMs !== null && calledInMs >= rangeStartMs && calledInMs <= rangeEndMs) {
    return true;
  }

  if (checkedInMs !== null && checkedInMs >= rangeStartMs && checkedInMs <= rangeEndMs) {
    return true;
  }

  if (returnedMs !== null && returnedMs >= rangeStartMs && returnedMs <= rangeEndMs) {
    return true;
  }

  if (cancelledMs !== null && cancelledMs >= rangeStartMs && cancelledMs <= rangeEndMs) {
    return true;
  }

  if (checkedInMs !== null && checkedInMs <= rangeStartMs && (returnedMs === null || returnedMs >= rangeEndMs)) {
    return true;
  }

  return false;
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

function totalTimeInHospital(record: RentalRecord) {
  if (!record.checked_in_at) {
    return isDeliveryCancelledStatus(record.status) ? "Not delivered" : "Not delivered yet";
  }

  const start = new Date(record.checked_in_at).getTime();
  const end = record.returned_at ? new Date(record.returned_at).getTime() : Date.now();
  const totalHours = Math.max(0, Math.floor((end - start) / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0 && hours > 0) {
    return `${days} ${days === 1 ? "day" : "days"} ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  if (days > 0) {
    return `${days} ${days === 1 ? "day" : "days"}`;
  }

  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function findEvent(events: RentalEvent[], eventTypes: Set<string>) {
  return events.find((event) => eventTypes.has(event.event_type)) ?? null;
}

function escapeCsvCell(value: unknown) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function csvFromRows(rows: Array<Record<string, string>>) {
  const headers = [
    "Rental Record ID",
    "Status",
    "Equipment Type",
    "Serial / Asset ID",
    "Rental Company",
    "Last Known Location",
    "Called In Date",
    "Called In Time",
    "Called In By",
    "Delivered Date",
    "Delivered Time",
    "Delivered By",
    "Called for Pickup Date",
    "Called for Pickup Time",
    "Called for Pickup By",
    "Picked Up Date",
    "Picked Up Time",
    "Picked Up By",
    "Total Time In Hospital",
    "Notes",
    "Created At",
    "Updated At"
  ];

  return [headers.map(escapeCsvCell).join(","), ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(","))].join("\r\n");
}

function exportDateSlug(timezone: string) {
  const parts = datePartsInTimezone(new Date(), timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserContext();

  if (auth.status !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasDashboardAccess(auth.context)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "all" ? "all" : "current";
  const requestedStatus = url.searchParams.get("status") ?? "all";
  const requestedEquipment = url.searchParams.get("equipment") ?? "all";
  const requestedDateRange = url.searchParams.get("dateRange") ?? "all";
  const status = (statusFilters.has(requestedStatus) ? requestedStatus : "all") as StatusFilter;
  const equipment = (equipmentFilters.has(requestedEquipment) ? requestedEquipment : "all") as EquipmentFilter;
  const dateRange = (dateRangePresets.has(requestedDateRange) ? requestedDateRange : "all") as DateRangePreset;
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const vendorId = url.searchParams.get("vendorId") ?? "all";
  const customStartDate = url.searchParams.get("startDate");
  const customEndDate = url.searchParams.get("endDate");
  const supabase = await createClient();
  const { data: department } = await supabase
    .from("departments")
    .select("timezone")
    .eq("id", auth.context.departmentId)
    .maybeSingle<{ timezone: string | null }>();
  const timezone = department?.timezone || fallbackTimezone;
  const { rangeStartMs, rangeEndMs } = scope === "all" ? { rangeStartMs: null, rangeEndMs: null } : rangeForPreset(dateRange, customStartDate, customEndDate, timezone);
  const rentalRecordSelect = [
    "id",
    "vendor_id",
    "equipment_type",
    "serial_number",
    "status",
    "current_location",
    "called_in_at",
    "called_in_by_name",
    "checked_in_at",
    "pickup_requested_at",
    "returned_at",
    "cancelled_at",
    "cancellation_note",
    "notes",
    "created_at",
    "updated_at",
    "rental_vendors(name)",
    "checked_in_by:staff_profiles!rental_records_checked_in_by_staff_profile_id_fkey(display_name)",
    "called_in_by:staff_profiles!rental_records_called_in_by_staff_profile_id_fkey(display_name)",
    "pickup_requested_by:staff_profiles!rental_records_pickup_requested_by_staff_profile_id_fkey(display_name)",
    "returned_by:staff_profiles!rental_records_returned_by_staff_profile_id_fkey(display_name)"
  ].join(", ");
  const { data: records, error: recordsError } = await supabase
    .from("rental_records")
    .select(rentalRecordSelect)
    .eq("department_id", auth.context.departmentId)
    .order("checked_in_at", { ascending: false, nullsFirst: false })
    .returns<RentalRecord[]>();

  if (recordsError) {
    return NextResponse.json({ error: "Unable to load rental history" }, { status: 500 });
  }

  const recordIds = (records ?? []).map((record) => record.id);
  const { data: events } =
    recordIds.length > 0
      ? await supabase
          .from("rental_events")
          .select("id, rental_record_id, event_type, event_at, staff_profiles(display_name)")
          .eq("department_id", auth.context.departmentId)
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
  const filteredRecords = (records ?? [])
    .filter((record) => {
      if (scope === "all") {
        return true;
      }

      const recordEvents = eventsByRecordId[record.id] ?? [];
      const vendor = firstRelated(record.rental_vendors);
      const checkedInStaff = firstRelated(record.checked_in_by);
      const calledInStaff = firstRelated(record.called_in_by);
      const pickupStaff = firstRelated(record.pickup_requested_by);
      const returnedStaff = firstRelated(record.returned_by);
      const eventStaff = recordEvents.map((event) => firstRelated(event.staff_profiles)?.display_name ?? "").join(" ");
      const eventWithinDateRange =
        rangeStartMs === null ||
        rangeEndMs === null ||
        recordEvents.some((event) => {
          const eventTime = new Date(event.event_at).getTime();
          return eventTime >= rangeStartMs && eventTime <= rangeEndMs;
        });
      const haystack = [
        record.serial_number ?? "",
        record.equipment_type,
        equipmentLabels[record.equipment_type],
        vendor?.name ?? "",
        record.current_location ?? "",
        checkedInStaff?.display_name ?? "",
        calledInStaff?.display_name ?? "",
        pickupStaff?.display_name ?? "",
        returnedStaff?.display_name ?? "",
        record.called_in_by_name ?? "",
        record.cancellation_note ?? "",
        eventStaff,
        record.notes ?? ""
      ]
        .join(" ")
        .toLowerCase();

      if (status === "pending" && !isPendingDeliveryStatus(record.status)) {
        return false;
      }

      if (status === "active" && !isActiveStatus(record.status)) {
        return false;
      }

      if (status === "pickup" && !isPickupCalledStatus(record.status)) {
        return false;
      }

      if (status === "returned" && !isPickedUpStatus(record.status)) {
        return false;
      }

      if (equipment !== "all" && record.equipment_type !== equipment) {
        return false;
      }

      if (vendorId !== "all" && record.vendor_id !== vendorId) {
        return false;
      }

      if (!recordMatchesDateRange(record, rangeStartMs, rangeEndMs) && !eventWithinDateRange) {
        return false;
      }

      return !search || haystack.includes(search);
    })
    .sort((left, right) => new Date(right.checked_in_at ?? right.called_in_at ?? 0).getTime() - new Date(left.checked_in_at ?? left.called_in_at ?? 0).getTime());

  if (filteredRecords.length === 0) {
    return NextResponse.json({ error: "No rental records to export" }, { status: 404 });
  }

  const rows = filteredRecords.map((record) => {
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
    const noteParts = [record.notes, record.cancellation_note].filter(Boolean);

    return {
      "Rental Record ID": record.id,
      Status: rentalStatusLabel(record.status),
      "Equipment Type": equipmentLabels[record.equipment_type],
      "Serial / Asset ID": record.serial_number ?? "",
      "Rental Company": vendor?.name ?? "",
      "Last Known Location": record.current_location ?? "",
      "Called In Date": formatDatePart(record.called_in_at, timezone),
      "Called In Time": formatTimePart(record.called_in_at, timezone),
      "Called In By": calledInBy ?? "",
      "Delivered Date": formatDatePart(record.checked_in_at, timezone),
      "Delivered Time": formatTimePart(record.checked_in_at, timezone),
      "Delivered By": deliveredBy ?? "",
      "Called for Pickup Date": formatDatePart(pickupAt ?? null, timezone),
      "Called for Pickup Time": formatTimePart(pickupAt ?? null, timezone),
      "Called for Pickup By": pickupBy ?? "",
      "Picked Up Date": formatDatePart(pickedUpAt ?? null, timezone),
      "Picked Up Time": formatTimePart(pickedUpAt ?? null, timezone),
      "Picked Up By": pickedUpBy ?? "",
      "Total Time In Hospital": totalTimeInHospital(record),
      Notes: noteParts.join(" | "),
      "Created At": `${formatDatePart(record.created_at, timezone)} ${formatTimePart(record.created_at, timezone)}`.trim(),
      "Updated At": `${formatDatePart(record.updated_at, timezone)} ${formatTimePart(record.updated_at, timezone)}`.trim()
    };
  });
  const csv = csvFromRows(rows);
  const filename = `whhs-rental-history-${scope === "all" ? "all" : "filtered"}-${exportDateSlug(timezone)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
