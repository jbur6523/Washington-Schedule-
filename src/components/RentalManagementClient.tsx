"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Filter,
  History,
  MapPin,
  RotateCcw,
  ScanLine,
  Search
} from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

type RentalVendor = {
  id: string;
  name: string;
  phone_number: string | null;
  notes: string | null;
  sort_order: number;
};

type EquipmentType = "bipap" | "v60";
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
type DateRangePreset = "all" | "today" | "7" | "30" | "custom";

type ActiveRentalRecord = {
  id: string;
  vendor_id: string;
  equipment_type: EquipmentType;
  barcode_number: string | null;
  serial_number: string | null;
  status: RentalStatus;
  current_location: string | null;
  called_in_at: string | null;
  called_in_by_name: string | null;
  checked_in_at: string | null;
  pickup_requested_at: string | null;
  pickup_confirmation_number: string | null;
  pickup_request_note: string | null;
  returned_at: string | null;
  return_note: string | null;
  cancelled_at: string | null;
  cancellation_note: string | null;
  notes: string | null;
  rental_vendors:
    | { name: string; phone_number?: string | null; notes?: string | null }
    | { name: string; phone_number?: string | null; notes?: string | null }[]
    | null;
  checked_in_by: { display_name: string } | { display_name: string }[] | null;
  called_in_by: { display_name: string } | { display_name: string }[] | null;
  pickup_requested_by: { display_name: string } | { display_name: string }[] | null;
  returned_by: { display_name: string } | { display_name: string }[] | null;
};

type RentalEventRecord = {
  id: string;
  rental_record_id: string | null;
  event_type: string;
  event_at: string;
  event_data: Record<string, unknown> | null;
  staff_profiles: { display_name: string } | { display_name: string }[] | null;
};

type RentalCheckInForm = {
  vendorId: string;
  equipmentType: EquipmentType | "";
  deliveredDate: string;
  deliveredTime: string;
  calledInDate: string;
  calledInTime: string;
  calledInUnknown: boolean;
  calledInByCurrentUser: boolean;
  barcodeNumber: string;
  serialNumber: string;
  location: string;
  otherLocation: string;
  notes: string;
};

type ReturnAction = "pickup" | "picked_up";
type PendingCancelAction = "delivery" | "pickup";

type ReturnEquipmentForm = {
  selectedRentalId: string;
  action: ReturnAction | "";
  date: string;
  time: string;
  confirmationNumber: string;
  note: string;
};

type RentalManagementClientProps = {
  authContext: AuthenticatedUserContext;
  mode?: "overview" | "check-in" | "active" | "history" | "deliver" | "return";
  pendingRentalId?: string;
};

type HistoryStatusFilter = "all" | "pending" | "active" | "pickup" | "returned";
type HistoryEquipmentFilter = "all" | EquipmentType;
type HistoryFilterPanel = "" | "status" | "date" | "equipment" | "more";

const equipmentLabels: Record<EquipmentType, string> = {
  bipap: "BiPAP V60",
  v60: "BiPAP V60"
};

const equipmentTypeCategoryLabel = "BiPAP";
const equipmentModelLabel = "V60";

const historyStatusLabels: Record<HistoryStatusFilter, string> = {
  all: "All",
  pending: "Pending Delivery",
  active: "Active",
  pickup: "Called for Pickup",
  returned: "Picked Up"
};

const dateRangeLabels: Record<DateRangePreset, string> = {
  all: "All Time",
  today: "Today",
  "7": "Last 7 Days",
  "30": "Last 30 Days",
  custom: "Custom Range"
};

const pickupEventTypes = new Set(["pickup_requested", "pickup_called", "called_for_pickup"]);
const pickedUpEventTypes = new Set(["returned", "picked_up"]);
const calledInEventTypes = new Set(["called_in", "pending_delivery"]);
const deliveredEventTypes = new Set(["delivered", "checked_in"]);
const deliveryCancelledEventTypes = new Set(["delivery_cancelled"]);
const pickupCancelledEventTypes = new Set(["pickup_cancelled"]);

const locationOptions = ["RT Equipment Room", "ED", "ICU", "2nd Floor", "3rd Floor", "Other"];
const rentalRecordSelect = [
  "id",
  "vendor_id",
  "equipment_type",
  "barcode_number",
  "serial_number",
  "status",
  "current_location",
  "called_in_at",
  "called_in_by_name",
  "checked_in_at",
  "pickup_requested_at",
  "pickup_confirmation_number",
  "pickup_request_note",
  "returned_at",
  "return_note",
  "cancelled_at",
  "cancellation_note",
  "notes",
  "rental_vendors(name, phone_number, notes)",
  "checked_in_by:staff_profiles!rental_records_checked_in_by_staff_profile_id_fkey(display_name)",
  "called_in_by:staff_profiles!rental_records_called_in_by_staff_profile_id_fkey(display_name)",
  "pickup_requested_by:staff_profiles!rental_records_pickup_requested_by_staff_profile_id_fkey(display_name)",
  "returned_by:staff_profiles!rental_records_returned_by_staff_profile_id_fkey(display_name)"
].join(", ");

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

function isInHospitalStatus(status: RentalStatus) {
  return isActiveStatus(status) || isPickupCalledStatus(status);
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

function rentalStatusStyles(status: RentalStatus) {
  if (isPendingDeliveryStatus(status)) {
    return {
      dot: "bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.18)]",
      text: "text-sky-700",
      card: "border-sky-100 bg-sky-50/75"
    };
  }

  if (isPickupCalledStatus(status)) {
    return {
      dot: "bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]",
      text: "text-amber-700",
      card: "border-amber-100 bg-amber-50/70"
    };
  }

  if (isPickedUpStatus(status) || isDeliveryCancelledStatus(status) || status === "cancelled") {
    return {
      dot: "bg-slate-300",
      text: "text-slate-500",
      card: "border-slate-100 bg-slate-50/80"
    };
  }

  return {
    dot: "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.14)]",
    text: "text-emerald-700",
    card: "border-emerald-100 bg-emerald-50/70"
  };
}

function barcodeNumberLabel(barcodeNumber: string | null) {
  return barcodeNumber?.trim() || "—";
}

function serialNumberLabel(serialNumber: string | null) {
  return serialNumber?.trim() || "Not entered";
}

function equipmentQuickLabel(equipmentType: EquipmentType, barcodeNumber: string | null, serialNumber: string | null) {
  const serial = serialNumber?.trim();

  if (serial) {
    return `${equipmentLabels[equipmentType]} \u2014 SN ${serial}`;
  }

  const barcode = barcodeNumber?.trim();

  if (barcode) {
    return `${equipmentLabels[equipmentType]} \u2014 Barcode ${barcode}`;
  }

  return `${equipmentLabels[equipmentType]} \u2014 Barcode —`;
}

function findPickupEvent(events: RentalEventRecord[]) {
  return events.find((event) => pickupEventTypes.has(event.event_type));
}

function findPickedUpEvent(events: RentalEventRecord[]) {
  return events.find((event) => pickedUpEventTypes.has(event.event_type));
}

function findCalledInEvent(events: RentalEventRecord[]) {
  return events.find((event) => calledInEventTypes.has(event.event_type));
}

function findDeliveredEvent(events: RentalEventRecord[]) {
  return events.find((event) => deliveredEventTypes.has(event.event_type));
}

function rentalEventLabel(eventType: string) {
  if (calledInEventTypes.has(eventType)) {
    return "Called In";
  }

  if (deliveredEventTypes.has(eventType)) {
    return "Delivered";
  }

  if (pickupEventTypes.has(eventType)) {
    return "Called for Pickup";
  }

  if (pickedUpEventTypes.has(eventType)) {
    return "Picked Up";
  }

  if (deliveryCancelledEventTypes.has(eventType)) {
    return "Delivery Canceled";
  }

  if (pickupCancelledEventTypes.has(eventType)) {
    return "Pickup Canceled";
  }

  if (eventType === "manual_check_in") {
    return "Manual Entry";
  }

  if (eventType === "barcode_scanned") {
    return "Barcode Scanned";
  }

  return eventType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function rentalEventDotClass(eventType: string) {
  if (calledInEventTypes.has(eventType)) {
    return "bg-sky-500";
  }

  if (deliveredEventTypes.has(eventType)) {
    return "bg-emerald-500";
  }

  if (pickupEventTypes.has(eventType)) {
    return "bg-amber-400";
  }

  if (pickedUpEventTypes.has(eventType)) {
    return "bg-slate-400";
  }

  if (deliveryCancelledEventTypes.has(eventType) || pickupCancelledEventTypes.has(eventType)) {
    return "bg-slate-400";
  }

  return "bg-slate-300";
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function timeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatDateInput(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return "Not set";
  }

  return `${month}/${day}/${year}`;
}

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
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

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).format(new Date(value)).replace(",", "");
}

function daysActive(value: string, timezone: string) {
  const startParts = datePartsInTimezone(new Date(value), timezone);
  const todayParts = datePartsInTimezone(new Date(), timezone);
  const start = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const today = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  const diff = today - start;

  return Math.max(0, Math.floor(diff / 86_400_000));
}

function daysInHospitalLabel(value: string, timezone: string) {
  const days = daysActive(value, timezone);

  if (days === 0) {
    return "Today";
  }

  if (days === 1) {
    return "1 day";
  }

  return `${days} days`;
}

function elapsedLabel(value: string, timezone: string) {
  const start = new Date(value).getTime();
  const diffMs = Math.max(0, Date.now() - start);
  const hours = Math.floor(diffMs / 3_600_000);

  if (hours < 1) {
    return "Less than 1 hour";
  }

  if (hours < 24) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }

  return daysInHospitalLabel(value, timezone);
}

function startOfDateRangeDay(dateValue: string) {
  const parts = dateValue
    ? dateValue.split("-").map((part) => Number(part))
    : [1970, 1, 1];
  const [year, month, day] = parts;
  return Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0);
}

function recordMatchesDateRange(record: ActiveRentalRecord, startMs: number | null, endMs: number | null) {
  if (startMs === null || endMs === null) {
    return true;
  }

  const calledInMs = record.called_in_at ? new Date(record.called_in_at).getTime() : null;
  const checkedInMs = record.checked_in_at ? new Date(record.checked_in_at).getTime() : null;
  const returnedMs = record.returned_at ? new Date(record.returned_at).getTime() : null;
  const activeEndMs = returnedMs ?? Date.now();

  if (calledInMs !== null && calledInMs >= startMs && calledInMs <= endMs) {
    return true;
  }

  if (checkedInMs !== null && checkedInMs >= startMs && checkedInMs <= endMs) {
    return true;
  }

  return checkedInMs !== null && checkedInMs <= endMs && activeEndMs >= startMs;
}

function totalDaysInHospital(record: ActiveRentalRecord, timezone: string) {
  if (!record.checked_in_at) {
    return 0;
  }

  const end = record.returned_at ?? new Date().toISOString();
  const startParts = datePartsInTimezone(new Date(record.checked_in_at), timezone);
  const endParts = datePartsInTimezone(new Date(end), timezone);
  const startMs = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endMs = Date.UTC(endParts.year, endParts.month - 1, endParts.day);

  return Math.max(0, Math.floor((endMs - startMs) / 86_400_000));
}

function totalDaysLabel(record: ActiveRentalRecord, timezone: string) {
  const days = totalDaysInHospital(record, timezone);

  if (days === 0) {
    return "Today";
  }

  if (days === 1) {
    return "1 day";
  }

  return `${days} days`;
}

function shortDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    year: "2-digit"
  }).format(new Date(value));
}

function shortMonthDay(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function defaultForm(vendorId = ""): RentalCheckInForm {
  return {
    vendorId,
    equipmentType: "bipap",
    deliveredDate: todayValue(),
    deliveredTime: timeValue(),
    calledInDate: todayValue(),
    calledInTime: timeValue(),
    calledInUnknown: false,
    calledInByCurrentUser: true,
    barcodeNumber: "",
    serialNumber: "",
    location: "RT Equipment Room",
    otherLocation: "",
    notes: ""
  };
}

function defaultReturnForm(): ReturnEquipmentForm {
  return {
    selectedRentalId: "",
    action: "",
    date: todayValue(),
    time: timeValue(),
    confirmationNumber: "",
    note: ""
  };
}

export function RentalManagementClient({ authContext, mode = "overview", pendingRentalId = "" }: RentalManagementClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vendors, setVendors] = useState<RentalVendor[]>([]);
  const [activeRentals, setActiveRentals] = useState<ActiveRentalRecord[]>([]);
  const [rentalHistory, setRentalHistory] = useState<ActiveRentalRecord[]>([]);
  const [rentalEvents, setRentalEvents] = useState<RentalEventRecord[]>([]);
  const [departmentTimezone, setDepartmentTimezone] = useState("America/Los_Angeles");
  const [form, setForm] = useState<RentalCheckInForm>(() => defaultForm());
  const [returnForm, setReturnForm] = useState<ReturnEquipmentForm>(() => defaultReturnForm());
  const [pendingCancellation, setPendingCancellation] = useState<{ rental: ActiveRentalRecord; action: PendingCancelAction } | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  const [pendingDeliveryConfirmation, setPendingDeliveryConfirmation] = useState<ActiveRentalRecord | null>(null);
  const [deliveryDetailsOpen, setDeliveryDetailsOpen] = useState(false);
  const [pendingPickupConfirmation, setPendingPickupConfirmation] = useState<ActiveRentalRecord | null>(null);
  const [pickupDetailsOpen, setPickupDetailsOpen] = useState(false);
  const [pickupDateDraft, setPickupDateDraft] = useState("");
  const [pickupTimeDraft, setPickupTimeDraft] = useState("");
  const [pickupNoteDraft, setPickupNoteDraft] = useState("");
  const [editingCalledInDetails, setEditingCalledInDetails] = useState(false);
  const [calledInDateDraft, setCalledInDateDraft] = useState("");
  const [calledInTimeDraft, setCalledInTimeDraft] = useState("");
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [historySearch, setHistorySearch] = useState(() => searchParams.get("serial") ?? "");
  const [historyStatus, setHistoryStatus] = useState<HistoryStatusFilter>(
    searchParams.get("status") === "pending" ? "pending" : "all"
  );
  const [historyEquipment, setHistoryEquipment] = useState<HistoryEquipmentFilter>("all");
  const [historyVendorId, setHistoryVendorId] = useState("all");
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [openHistoryFilter, setOpenHistoryFilter] = useState<HistoryFilterPanel>("");
  const [exportingHistory, setExportingHistory] = useState<"" | "current" | "all">("");
  const [exportError, setExportError] = useState("");
  const [expandedRentalId, setExpandedRentalId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("");
  const [scannerError, setScannerError] = useState("");
  const [scannerSuccess, setScannerSuccess] = useState("");
  const [scannedByCamera, setScannedByCamera] = useState(false);
  const [duplicateRental, setDuplicateRental] = useState<ActiveRentalRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const activeRentalsRef = useRef<HTMLDivElement>(null);

  const selectedVendor = vendors.find((vendor) => vendor.id === form.vendorId) ?? null;
  const currentLocation = form.location === "Other" ? form.otherLocation.trim() : form.location;
  const requestedReturnRentalId = searchParams.get("rental") ?? "";
  const requestedReturnAction = "";

  useEffect(() => {
    if (!pendingCancellation && !pendingDeliveryConfirmation && !pendingPickupConfirmation) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingCancellation, pendingDeliveryConfirmation, pendingPickupConfirmation]);

  const loadRentalData = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const [
      { data: vendorData, error: vendorError },
      { data: rentalData, error: rentalError },
      { data: historyData, error: historyError },
      { data: eventData, error: eventError },
      { data: departmentData }
    ] = await Promise.all([
      supabase
        .from("rental_vendors")
        .select("id, name, phone_number, notes, sort_order")
        .eq("department_id", authContext.departmentId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("rental_records")
        .select(rentalRecordSelect)
        .eq("department_id", authContext.departmentId)
        .neq("status", "cancelled")
        .order("checked_in_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("rental_records")
        .select(rentalRecordSelect)
        .eq("department_id", authContext.departmentId)
        .neq("status", "cancelled")
        .order("checked_in_at", { ascending: false }),
      supabase
        .from("rental_events")
        .select("id, rental_record_id, event_type, event_at, event_data, staff_profiles(display_name)")
        .eq("department_id", authContext.departmentId)
        .order("event_at", { ascending: true }),
      supabase
        .from("departments")
        .select("timezone")
        .eq("id", authContext.departmentId)
        .maybeSingle()
    ]);

    setDepartmentTimezone((departmentData?.timezone as string | null | undefined) || "America/Los_Angeles");

    if (vendorError) {
      setError("Unable to load rental vendors. Confirm the rental migration has been applied.");
      setVendors([]);
    } else {
      const nextVendors = (vendorData ?? []) as RentalVendor[];
      setVendors(nextVendors);
      setForm((current) => ({
        ...current,
        vendorId: current.vendorId || nextVendors[0]?.id || ""
      }));
    }

    if (rentalError) {
      setError("Unable to load active rentals.");
      setActiveRentals([]);
    } else {
      setActiveRentals(((rentalData ?? []) as unknown as ActiveRentalRecord[]).filter((record) => isInHospitalStatus(record.status)));
    }

    if (historyError) {
      setError("Unable to load rental history.");
      setRentalHistory([]);
    } else {
      setRentalHistory((historyData ?? []) as unknown as ActiveRentalRecord[]);
    }

    if (eventError) {
      setRentalEvents([]);
    } else {
      setRentalEvents((eventData ?? []) as unknown as RentalEventRecord[]);
    }

    setLoading(false);
  }, [authContext.departmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRentalData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRentalData]);

  useEffect(() => {
    if (mode !== "return" || !requestedReturnRentalId) {
      return;
    }

    const requestedRental = activeRentals.find((rental) => rental.id === requestedReturnRentalId && isActiveStatus(rental.status));

    if (!requestedRental) {
      return;
    }

    const timer = window.setTimeout(() => {
      setReturnForm((current) => {
        if (current.selectedRentalId === requestedRental.id && current.action === requestedReturnAction) {
          return current;
        }

        return {
          ...current,
          selectedRentalId: requestedRental.id,
          action: requestedReturnAction || (isPickupCalledStatus(requestedRental.status) ? "picked_up" : current.action)
        };
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeRentals, mode, requestedReturnAction, requestedReturnRentalId]);

  const stopScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setScannerOpen(false);
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);

  const startScanner = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError("Camera scanning is not supported on this device. Enter the barcode number manually.");
      return;
    }

    setScannerError("");
    setScannerSuccess("");
    setScannerStatus("Requesting camera permission...");
    setScannerOpen(true);

    window.setTimeout(async () => {
      if (!videoRef.current) {
        setScannerError("Scanner preview could not start. Enter the barcode number manually.");
        setScannerStatus("");
        return;
      }

      try {
        const hints = new Map<DecodeHintType, BarcodeFormat[]>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.ITF
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, scanError, callbackControls) => {
          if (result) {
            const scannedValue = result.getText().trim();
            setForm((current) => ({ ...current, barcodeNumber: scannedValue }));
            if (mode === "return") {
              const matches = activeRentals.filter(
                (rental) =>
                  isActiveStatus(rental.status) &&
                  ((rental.barcode_number ?? "").toLowerCase() === scannedValue.toLowerCase() ||
                    (rental.serial_number ?? "").toLowerCase() === scannedValue.toLowerCase())
              );
              if (matches.length === 1) {
                const [match] = matches;
                setReturnForm((current) => ({
                  ...current,
                  selectedRentalId: match.id,
                  action: current.action
                }));
              }
            }
            setScannedByCamera(true);
            setScannerSuccess(`Scanned: ${scannedValue}`);
            setScannerStatus("");
            callbackControls.stop();
            scannerControlsRef.current = null;
            setScannerOpen(false);
          } else if (scanError) {
            setScannerStatus("Point camera at the equipment barcode.");
          }
        });
        scannerControlsRef.current = controls;
        setScannerStatus("Point camera at the equipment barcode.");
      } catch {
        setScannerError("Camera permission was denied or scanning could not start. Enter the barcode number manually.");
        setScannerStatus("");
        setScannerOpen(false);
      }
    }, 0);
  };

  const lookupKnownEquipment = async (identifier: string) => {
    const trimmed = identifier.trim();

    if (!trimmed) {
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("rental_equipment")
      .select("vendor_id, equipment_type, barcode_number, serial_number")
      .eq("department_id", authContext.departmentId);
    const match = ((data ?? []) as Array<{ vendor_id: string | null; equipment_type: EquipmentType | null; barcode_number: string | null; serial_number: string | null }>).find(
      (equipment) =>
        (equipment.barcode_number ?? "").toLowerCase() === trimmed.toLowerCase() ||
        (equipment.serial_number ?? "").toLowerCase() === trimmed.toLowerCase()
    );

    if (match) {
      setForm((current) => ({
        ...current,
        vendorId: match.vendor_id ?? current.vendorId,
        equipmentType: match.equipment_type ? "bipap" : current.equipmentType,
        barcodeNumber: match.barcode_number ?? current.barcodeNumber,
        serialNumber: match.serial_number ?? current.serialNumber
      }));
    }
  };

  const pendingDeliveries = rentalHistory
    .filter((record) => isPendingDeliveryStatus(record.status))
    .sort((left, right) => new Date(left.called_in_at ?? 0).getTime() - new Date(right.called_in_at ?? 0).getTime());
  const pendingPickups = activeRentals
    .filter((record) => isPickupCalledStatus(record.status))
    .sort((left, right) => new Date(left.pickup_requested_at ?? left.checked_in_at ?? 0).getTime() - new Date(right.pickup_requested_at ?? right.checked_in_at ?? 0).getTime());
  const deliveryPendingRental = pendingRentalId
    ? pendingDeliveries.find((record) => record.id === pendingRentalId) ?? null
    : null;

  const submitCheckIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authContext.staffProfileId) {
      setError("Your staff profile must be linked before logging rental orders.");
      return;
    }

    if (!form.vendorId || !form.equipmentType || !form.calledInDate || !form.calledInTime) {
      setError("Rental Company, Called In Date, and Called In Time are required.");
      return;
    }

    setSaving(true);
    setError("");
    setDuplicateRental(null);

    const supabase = createClient();
    const vendor = vendors.find((candidate) => candidate.id === form.vendorId);
    const pendingAt = new Date(`${form.calledInDate}T${form.calledInTime}:00`).toISOString();
    const { data: pendingRecord, error: pendingError } = await supabase
      .from("rental_records")
      .insert({
        department_id: authContext.departmentId,
        equipment_id: null,
        vendor_id: form.vendorId,
        equipment_type: form.equipmentType,
        barcode_number: null,
        serial_number: null,
        status: "pending_delivery",
        called_in_at: pendingAt,
        called_in_by_staff_profile_id: authContext.staffProfileId,
        called_in_by_name: authContext.displayName,
        checked_in_at: null,
        checked_in_by_staff_profile_id: null,
        current_location: null,
        notes: form.notes.trim() || null
      })
      .select(rentalRecordSelect)
      .single();

    const savedPendingRecord = pendingRecord as unknown as ActiveRentalRecord | null;

    if (pendingError || !savedPendingRecord?.id) {
      setSaving(false);
      setError("Unable to save pending delivery.");
      return;
    }

    await supabase.from("rental_events").insert({
      department_id: authContext.departmentId,
      rental_record_id: savedPendingRecord.id,
      equipment_id: null,
      event_type: "called_in",
      event_at: pendingAt,
      actor_staff_profile_id: authContext.staffProfileId,
      event_data: {
        equipment_type: form.equipmentType,
        vendor_id: form.vendorId,
        vendor_name: vendor?.name ?? null,
        called_in_by: authContext.displayName,
        timestamp: pendingAt
      }
    });

    setSaving(false);
    setForm(defaultForm(vendors[0]?.id ?? ""));
    setEditingCalledInDetails(false);
    setCalledInDateDraft("");
    setCalledInTimeDraft("");
    setNoteEditorOpen(false);
    setNoteDraft("");
    await loadRentalData();
    router.push("/operations/rental-management?calledIn=1");
  };

  const confirmDeliveryForRental = async (pendingRental: ActiveRentalRecord) => {
    if (!authContext.staffProfileId) {
      setError("Your staff profile must be linked before confirming delivery.");
      return false;
    }

    if (!form.barcodeNumber.trim() || !form.deliveredDate || !form.deliveredTime || !currentLocation) {
      setError("Delivered date/time, barcode number, and current location are required.");
      return false;
    }

    setSaving(true);
    setError("");
    setDuplicateRental(null);

    const supabase = createClient();
    const vendor = vendors.find((candidate) => candidate.id === pendingRental.vendor_id);
    const barcodeNumber = form.barcodeNumber.trim();
    const serialNumber = form.serialNumber.trim() || null;
    const location = currentLocation || "RT Equipment Room";
    const deliveredAt = new Date(`${form.deliveredDate}T${form.deliveredTime}:00`).toISOString();
    const { data: existingRentals, error: existingRentalError } = await supabase
      .from("rental_records")
      .select(rentalRecordSelect)
      .eq("department_id", authContext.departmentId)
      .neq("status", "cancelled")
      .order("checked_in_at", { ascending: false });

    if (existingRentalError) {
      setSaving(false);
      setError("Unable to check existing active rentals.");
      return false;
    }

    const existingInHospitalRental = ((existingRentals ?? []) as unknown as ActiveRentalRecord[]).find(
      (record) =>
        record.id !== pendingRental.id &&
        isInHospitalStatus(record.status) &&
        ((record.barcode_number ?? "").toLowerCase() === barcodeNumber.toLowerCase() ||
          (record.serial_number ?? "").toLowerCase() === barcodeNumber.toLowerCase() ||
          Boolean(serialNumber && (record.serial_number ?? "").toLowerCase() === serialNumber.toLowerCase()) ||
          Boolean(serialNumber && (record.barcode_number ?? "").toLowerCase() === serialNumber.toLowerCase()))
    );

    if (existingInHospitalRental) {
      setSaving(false);
      setDuplicateRental(existingInHospitalRental);
      return false;
    }

    const { data: knownEquipment } = await supabase
      .from("rental_equipment")
      .select("id, barcode_number, serial_number")
      .eq("department_id", authContext.departmentId);
    const existingEquipment = ((knownEquipment ?? []) as Array<{ id: string; barcode_number: string | null; serial_number: string | null }>).find(
      (equipmentRecord) =>
        (equipmentRecord.barcode_number ?? "").toLowerCase() === barcodeNumber.toLowerCase() ||
        Boolean(serialNumber && (equipmentRecord.serial_number ?? "").toLowerCase() === serialNumber.toLowerCase())
    );
    const equipmentPayload = {
      department_id: authContext.departmentId,
      vendor_id: pendingRental.vendor_id,
      equipment_type: pendingRental.equipment_type,
      barcode_number: barcodeNumber,
      serial_number: serialNumber,
      last_known_company: vendor?.name ?? null,
      is_active: true
    };
    const { data: equipment, error: equipmentError } = existingEquipment
      ? await supabase
          .from("rental_equipment")
          .update(equipmentPayload)
          .eq("id", existingEquipment.id)
          .select("id")
          .single()
      : await supabase
          .from("rental_equipment")
          .insert(equipmentPayload)
          .select("id")
          .single();

    if (equipmentError || !equipment?.id) {
      setSaving(false);
      setError("Unable to save rental equipment.");
      return false;
    }

    const { data: record, error: recordError } = await supabase
      .from("rental_records")
      .update({
        equipment_id: equipment.id,
        barcode_number: barcodeNumber,
        serial_number: serialNumber,
        status: "active",
        checked_in_at: deliveredAt,
        checked_in_by_staff_profile_id: authContext.staffProfileId,
        current_location: location,
        notes: form.notes.trim() || pendingRental.notes || null
      })
      .eq("id", pendingRental.id)
      .select(rentalRecordSelect)
      .single();

    const savedRecord = record as unknown as ActiveRentalRecord | null;

    if (recordError || !savedRecord?.id) {
      setSaving(false);
      setError("Unable to confirm rental delivery.");
      return false;
    }

    const eventType = scannedByCamera ? "barcode_scanned" : "manual_check_in";
    await supabase.from("rental_events").insert([
      {
        department_id: authContext.departmentId,
        rental_record_id: savedRecord.id,
        equipment_id: equipment.id,
        event_type: eventType,
        event_at: deliveredAt,
        actor_staff_profile_id: authContext.staffProfileId,
        event_data: {
          barcode_number: barcodeNumber,
          serial_number: serialNumber,
          equipment_type: pendingRental.equipment_type,
          vendor_id: pendingRental.vendor_id,
          vendor_name: vendor?.name ?? null,
          current_location: location,
          timestamp: deliveredAt
        }
      },
      {
        department_id: authContext.departmentId,
        rental_record_id: savedRecord.id,
        equipment_id: equipment.id,
        event_type: "delivered",
        event_at: deliveredAt,
        actor_staff_profile_id: authContext.staffProfileId,
        event_data: {
          source: scannedByCamera ? "barcode" : "manual",
          barcode_number: barcodeNumber,
          serial_number: serialNumber,
          equipment_type: pendingRental.equipment_type,
          vendor_id: pendingRental.vendor_id,
          vendor_name: vendor?.name ?? null,
          current_location: location,
          delivered_by: authContext.displayName,
          timestamp: deliveredAt
        }
      }
    ]);

    setSaving(false);
    setScannerOpen(false);
    setScannerSuccess("");
    setScannedByCamera(false);
    setForm(defaultForm(vendors[0]?.id ?? ""));
    setPendingDeliveryConfirmation(null);
    setDeliveryDetailsOpen(false);
    await loadRentalData();
    router.push("/operations/rental-management?checkedIn=1");
    return true;
  };

  const submitDelivery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!deliveryPendingRental) {
      setError("Pending delivery could not be found.");
      return;
    }

    await confirmDeliveryForRental(deliveryPendingRental);
  };

  const submitPendingDeliveryConfirmation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!pendingDeliveryConfirmation) {
      setError("Pending delivery could not be found.");
      return;
    }

    await confirmDeliveryForRental(pendingDeliveryConfirmation);
  };

  const returnEligibleRentals = activeRentals.filter((rental) => isActiveStatus(rental.status));
  const selectedReturnRental = returnEligibleRentals.find((rental) => rental.id === returnForm.selectedRentalId) ?? null;
  const returnIdentifierSearch = form.barcodeNumber.trim().toLowerCase();
  const returnSerialMatches = returnIdentifierSearch
    ? returnEligibleRentals.filter(
        (rental) =>
          (rental.barcode_number ?? "").toLowerCase() === returnIdentifierSearch ||
          (rental.serial_number ?? "").toLowerCase() === returnIdentifierSearch
      )
    : [];
  const returnSerialAllMatches = returnIdentifierSearch
    ? rentalHistory.filter(
        (rental) =>
          (rental.barcode_number ?? "").toLowerCase() === returnIdentifierSearch ||
          (rental.serial_number ?? "").toLowerCase() === returnIdentifierSearch
      )
    : [];
  const returnSerialBlockedMatch = returnSerialMatches.length === 0 ? returnSerialAllMatches[0] : null;
  const returnSerialFeedback = returnIdentifierSearch
    ? returnSerialMatches.length > 0
      ? ""
      : returnSerialBlockedMatch
        ? isPickupCalledStatus(returnSerialBlockedMatch.status)
          ? "This rental is already pending pickup. Use the Pending section to confirm pickup or cancel the pickup request."
          : isPickedUpStatus(returnSerialBlockedMatch.status)
            ? "This rental has already been picked up. View Rental History for details."
            : isPendingDeliveryStatus(returnSerialBlockedMatch.status)
              ? "This rental has not been delivered yet."
              : "No active rental found for this barcode / serial number."
        : "No active rental found for this barcode / serial number."
    : "";

  const selectReturnRental = (rental: ActiveRentalRecord) => {
    setReturnForm((current) => ({
      ...current,
      selectedRentalId: rental.id,
      action: current.action
    }));
    setError("");
  };

  const submitPickupCall = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authContext.staffProfileId) {
      setError("Your staff profile must be linked before logging pickup calls.");
      return;
    }

    if (!selectedReturnRental || !returnForm.date || !returnForm.time) {
      setError("Select a rental and enter pickup call date/time.");
      return;
    }

    setSaving(true);
    setError("");

    const supabase = createClient();
    const vendor = firstRelated(selectedReturnRental.rental_vendors);
    const eventAt = new Date(`${returnForm.date}T${returnForm.time}:00`).toISOString();
    const note = returnForm.note.trim() || null;
    const confirmationNumber = returnForm.confirmationNumber.trim() || null;
    const { error: updateError } = await supabase
      .from("rental_records")
      .update({
        status: "pickup_called",
        pickup_requested_at: eventAt,
        pickup_requested_by_staff_profile_id: authContext.staffProfileId,
        pickup_confirmation_number: confirmationNumber,
        pickup_request_note: note
      })
      .eq("id", selectedReturnRental.id);

    if (updateError) {
      setSaving(false);
      setError("Unable to log pickup call.");
      return;
    }

    await supabase.from("rental_events").insert({
      department_id: authContext.departmentId,
      rental_record_id: selectedReturnRental.id,
      equipment_id: null,
      event_type: "pickup_called",
      event_at: eventAt,
      actor_staff_profile_id: authContext.staffProfileId,
      event_data: {
        barcode_number: selectedReturnRental.barcode_number,
        serial_number: selectedReturnRental.serial_number,
        equipment_type: selectedReturnRental.equipment_type,
        vendor_id: selectedReturnRental.vendor_id,
        vendor_name: vendor?.name ?? null,
        current_location: selectedReturnRental.current_location,
        confirmation_number: confirmationNumber,
        note,
        called_by: authContext.displayName,
        timestamp: eventAt
      }
    });

    setSaving(false);
    setReturnForm(defaultReturnForm());
    setForm((current) => ({ ...current, barcodeNumber: "", serialNumber: "" }));
    await loadRentalData();
    router.push("/operations/rental-management?pickup=1");
  };

  const submitPickedUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authContext.staffProfileId) {
      setError("Your staff profile must be linked before confirming pickup.");
      return;
    }

    if (!selectedReturnRental || !returnForm.date || !returnForm.time) {
      setError("Select a rental and enter picked-up date/time.");
      return;
    }

    setSaving(true);
    setError("");

    const supabase = createClient();
    const vendor = firstRelated(selectedReturnRental.rental_vendors);
    const eventAt = new Date(`${returnForm.date}T${returnForm.time}:00`).toISOString();
    const note = returnForm.note.trim() || null;
    const { error: updateError } = await supabase
      .from("rental_records")
      .update({
        status: "picked_up",
        returned_at: eventAt,
        returned_by_staff_profile_id: authContext.staffProfileId,
        return_note: note
      })
      .eq("id", selectedReturnRental.id);

    if (updateError) {
      setSaving(false);
      setError("Unable to confirm picked up.");
      return;
    }

    await supabase.from("rental_events").insert({
      department_id: authContext.departmentId,
      rental_record_id: selectedReturnRental.id,
      equipment_id: null,
      event_type: "picked_up",
      event_at: eventAt,
      actor_staff_profile_id: authContext.staffProfileId,
      event_data: {
        barcode_number: selectedReturnRental.barcode_number,
        serial_number: selectedReturnRental.serial_number,
        equipment_type: selectedReturnRental.equipment_type,
        vendor_id: selectedReturnRental.vendor_id,
        vendor_name: vendor?.name ?? null,
        current_location: selectedReturnRental.current_location,
        note,
        picked_up_by: authContext.displayName,
        timestamp: eventAt
      }
    });

    setSaving(false);
    setReturnForm(defaultReturnForm());
    setForm((current) => ({ ...current, barcodeNumber: "", serialNumber: "" }));
    await loadRentalData();
    router.push("/operations/rental-management?pickedUp=1");
  };

  const submitPendingPickupPickedUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authContext.staffProfileId) {
      setError("Your staff profile must be linked before confirming pickup.");
      return;
    }

    if (!pendingPickupConfirmation || !pickupDateDraft || !pickupTimeDraft) {
      setError("Select a pending pickup and enter picked-up date/time.");
      return;
    }

    setSaving(true);
    setError("");

    const supabase = createClient();
    const vendor = firstRelated(pendingPickupConfirmation.rental_vendors);
    const eventAt = new Date(`${pickupDateDraft}T${pickupTimeDraft}:00`).toISOString();
    const note = pickupNoteDraft.trim() || null;
    const { error: updateError } = await supabase
      .from("rental_records")
      .update({
        status: "picked_up",
        returned_at: eventAt,
        returned_by_staff_profile_id: authContext.staffProfileId,
        return_note: note
      })
      .eq("id", pendingPickupConfirmation.id);

    if (updateError) {
      setSaving(false);
      setError("Unable to confirm picked up.");
      return;
    }

    await supabase.from("rental_events").insert({
      department_id: authContext.departmentId,
      rental_record_id: pendingPickupConfirmation.id,
      equipment_id: null,
      event_type: "picked_up",
      event_at: eventAt,
      actor_staff_profile_id: authContext.staffProfileId,
      event_data: {
        barcode_number: pendingPickupConfirmation.barcode_number,
        serial_number: pendingPickupConfirmation.serial_number,
        equipment_type: pendingPickupConfirmation.equipment_type,
        vendor_id: pendingPickupConfirmation.vendor_id,
        vendor_name: vendor?.name ?? null,
        current_location: pendingPickupConfirmation.current_location,
        note,
        picked_up_by: authContext.displayName,
        timestamp: eventAt
      }
    });

    setSaving(false);
    setPendingPickupConfirmation(null);
    setPickupDetailsOpen(false);
    setPickupDateDraft("");
    setPickupTimeDraft("");
    setPickupNoteDraft("");
    await loadRentalData();
    router.push("/operations/rental-management?pickedUp=1");
  };

  const submitPendingCancellation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authContext.staffProfileId) {
      setError("Your staff profile must be linked before cancelling pending rentals.");
      return;
    }

    if (!pendingCancellation) {
      setError("Select a pending rental before cancelling.");
      return;
    }

    setSaving(true);
    setError("");

    const supabase = createClient();
    const { rental, action } = pendingCancellation;
    const eventAt = new Date().toISOString();
    const note = cancelNote.trim() || null;
    const vendor = firstRelated(rental.rental_vendors);
    const eventType = action === "delivery" ? "delivery_cancelled" : "pickup_cancelled";
    const updatePayload =
      action === "delivery"
        ? {
            status: "delivery_cancelled",
            cancelled_at: eventAt,
            cancelled_by_staff_profile_id: authContext.staffProfileId,
            cancellation_note: note
          }
        : {
            status: "active",
            pickup_requested_at: null,
            pickup_requested_by_staff_profile_id: null,
            pickup_confirmation_number: null,
            pickup_request_note: null
          };
    const { error: updateError } = await supabase
      .from("rental_records")
      .update(updatePayload)
      .eq("id", rental.id);

    if (updateError) {
      setSaving(false);
      setError(action === "delivery" ? "Unable to cancel delivery." : "Unable to cancel pickup request.");
      return;
    }

    await supabase.from("rental_events").insert({
      department_id: authContext.departmentId,
      rental_record_id: rental.id,
      equipment_id: null,
      event_type: eventType,
      event_at: eventAt,
      actor_staff_profile_id: authContext.staffProfileId,
      event_data: {
        barcode_number: rental.barcode_number,
        serial_number: rental.serial_number,
        equipment_type: rental.equipment_type,
        vendor_id: rental.vendor_id,
        vendor_name: vendor?.name ?? null,
        current_location: rental.current_location,
        note,
        cancelled_by: authContext.displayName,
        timestamp: eventAt
      }
    });

    setSaving(false);
    setPendingCancellation(null);
    setCancelNote("");
    await loadRentalData();
    router.push(action === "delivery" ? "/operations/rental-management?deliveryCancelled=1" : "/operations/rental-management?pickupCancelled=1");
  };

  const missingOrderFields = [
    !form.vendorId ? "Rental Company required" : "",
    !form.equipmentType ? "Equipment details required" : ""
  ].filter(Boolean);
  const missingAutoFilledFields = [
    !form.calledInDate ? "Called In Date required" : "",
    !form.calledInTime ? "Called In Time required" : ""
  ].filter(Boolean);
  const missingCheckInFields = [...missingOrderFields, ...missingAutoFilledFields];
  const canLogOrder = missingCheckInFields.length === 0;
  const canConfirmDelivery = Boolean(deliveryPendingRental && form.barcodeNumber.trim() && form.deliveredDate && form.deliveredTime && currentLocation);
  const canConfirmPendingDelivery = Boolean(
    pendingDeliveryConfirmation && form.barcodeNumber.trim() && form.deliveredDate && form.deliveredTime && currentLocation
  );
  const canLogPickupCall = Boolean(selectedReturnRental && returnForm.action === "pickup" && returnForm.date && returnForm.time);
  const canConfirmPickedUp = Boolean(selectedReturnRental && returnForm.action === "picked_up" && returnForm.date && returnForm.time);
  const checkedIn = searchParams.get("checkedIn") === "1";
  const calledIn = searchParams.get("calledIn") === "1";
  const pickupLogged = searchParams.get("pickup") === "1";
  const pickedUpLogged = searchParams.get("pickedUp") === "1";
  const deliveryCancelled = searchParams.get("deliveryCancelled") === "1";
  const pickupCancelled = searchParams.get("pickupCancelled") === "1";
  const oldestRentalDateLabel = activeRentals[0]?.checked_in_at ? shortMonthDay(activeRentals[0].checked_in_at, departmentTimezone) : "—";
  const eventsByRentalId = rentalEvents.reduce<Record<string, RentalEventRecord[]>>((accumulator, event) => {
    if (!event.rental_record_id) {
      return accumulator;
    }

    accumulator[event.rental_record_id] = [...(accumulator[event.rental_record_id] ?? []), event];
    return accumulator;
  }, {});
  const todayParts = datePartsInTimezone(new Date(), departmentTimezone);
  const todayStartMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  const dayMs = 86_400_000;
  const rangeStartMs =
    dateRangePreset === "today"
      ? todayStartMs
      : dateRangePreset === "7"
        ? todayStartMs - 6 * dayMs
        : dateRangePreset === "30"
          ? todayStartMs - 29 * dayMs
          : dateRangePreset === "custom" && customStartDate
            ? startOfDateRangeDay(customStartDate)
            : null;
  const rangeEndMs =
    dateRangePreset === "today" || dateRangePreset === "7" || dateRangePreset === "30"
      ? todayStartMs + dayMs - 1
      : dateRangePreset === "custom" && customEndDate
        ? startOfDateRangeDay(customEndDate) + dayMs - 1
        : null;
  const normalizedHistorySearch = historySearch.trim().toLowerCase();
  const filteredHistory = rentalHistory
    .filter((record) => {
      const vendor = firstRelated(record.rental_vendors);
      const checkedInStaff = firstRelated(record.checked_in_by);
      const calledInStaff = firstRelated(record.called_in_by);
      const events = eventsByRentalId[record.id] ?? [];
      const eventStaff = events
        .map((event) => firstRelated(event.staff_profiles)?.display_name ?? "")
        .join(" ");
      const eventWithinDateRange =
        rangeStartMs === null ||
        rangeEndMs === null ||
        events.some((event) => {
          const eventTime = new Date(event.event_at).getTime();
          return eventTime >= rangeStartMs && eventTime <= rangeEndMs;
        });
      const haystack = [
        record.barcode_number ?? "",
        record.serial_number ?? "",
        record.equipment_type,
        equipmentLabels[record.equipment_type],
        vendor?.name ?? "",
        record.current_location ?? "",
        checkedInStaff?.display_name ?? "",
        calledInStaff?.display_name ?? "",
        record.called_in_by_name ?? "",
        record.cancellation_note ?? "",
        eventStaff,
        record.notes ?? ""
      ]
        .join(" ")
        .toLowerCase();

      if (historyStatus === "pending" && !isPendingDeliveryStatus(record.status)) {
        return false;
      }

      if (historyStatus === "active" && !isActiveStatus(record.status)) {
        return false;
      }

      if (historyStatus === "pickup" && !isPickupCalledStatus(record.status)) {
        return false;
      }

      if (historyStatus === "returned" && !isPickedUpStatus(record.status)) {
        return false;
      }

      if (historyEquipment !== "all" && !["bipap", "v60"].includes(record.equipment_type)) {
        return false;
      }

      if (historyVendorId !== "all" && record.vendor_id !== historyVendorId) {
        return false;
      }

      if (!recordMatchesDateRange(record, rangeStartMs, rangeEndMs) && !eventWithinDateRange) {
        return false;
      }

      return !normalizedHistorySearch || haystack.includes(normalizedHistorySearch);
    })
    .sort((left, right) => {
      if (historyStatus === "active") {
        return new Date(left.checked_in_at ?? 0).getTime() - new Date(right.checked_in_at ?? 0).getTime();
      }

      return (
        new Date(right.checked_in_at ?? right.called_in_at ?? 0).getTime() -
        new Date(left.checked_in_at ?? left.called_in_at ?? 0).getTime()
      );
    });
  const cancellationModal = pendingCancellation
    ? (() => {
        const { rental, action } = pendingCancellation;
        const vendor = firstRelated(rental.rental_vendors);
        const isDeliveryCancel = action === "delivery";
        const calledInBy = firstRelated(rental.called_in_by);
        const pickupEvent = findPickupEvent(eventsByRentalId[rental.id] ?? []);
        const pickupBy =
          firstRelated(rental.pickup_requested_by)?.display_name ??
          (pickupEvent ? firstRelated(pickupEvent.staff_profiles)?.display_name : null) ??
          "Unknown";
        const eventAt = isDeliveryCancel ? rental.called_in_at : rental.pickup_requested_at ?? pickupEvent?.event_at;
        const closeCancellationModal = () => {
          setPendingCancellation(null);
          setCancelNote("");
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6"
            role="presentation"
          >
            <form
              onSubmit={submitPendingCancellation}
              role="dialog"
              aria-modal="true"
              aria-labelledby="rental-cancel-title"
              className="max-h-[calc(100vh-3rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_18px_50px_rgba(15,23,42,0.28)]"
            >
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                {isDeliveryCancel ? "Cancel Delivery" : "Cancel Pickup"}
              </p>
              <h2 id="rental-cancel-title" className="mt-1 text-xl font-black text-hospital-ink">
                {isDeliveryCancel ? "Cancel Delivery?" : "Cancel Pickup Request?"}
              </h2>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
                {isDeliveryCancel
                  ? "This will mark the rental order as canceled. Use this only if the rental was called in but will not be delivered."
                  : "This will cancel the pending pickup request. The rental will stay active because the equipment is still in the hospital."}
              </p>
              <div className="mt-3 grid gap-1 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-600">
                <p>
                  Equipment:{" "}
                  {isDeliveryCancel
                    ? equipmentLabels[rental.equipment_type]
                    : equipmentQuickLabel(rental.equipment_type, rental.barcode_number, rental.serial_number)}
                </p>
                <p>Company: {vendor?.name ?? "Unknown company"}</p>
                {rental.current_location && <p>Location: {rental.current_location}</p>}
                <p>{isDeliveryCancel ? "Called in" : "Pickup requested"}: {eventAt ? formatDateTime(eventAt, departmentTimezone) : "Unknown"}</p>
                <p>{isDeliveryCancel ? "Called in by" : "Pickup requested by"}: {isDeliveryCancel ? calledInBy?.display_name ?? rental.called_in_by_name ?? "Unknown" : pickupBy}</p>
              </div>
              <label className="mt-3 block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Cancellation note</span>
                <textarea
                  value={cancelNote}
                  onChange={(event) => setCancelNote(event.target.value.slice(0, 140))}
                  maxLength={140}
                  placeholder="Optional"
                  className="mt-1 min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-slate-300"
                />
                <span className="mt-1 flex justify-between gap-3 text-xs font-bold text-slate-500">
                  <span>No patient information.</span>
                  <span>{cancelNote.length}/140</span>
                </span>
              </label>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={closeCancellationModal}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
                >
                  {isDeliveryCancel ? "Keep Pending" : "Keep Pending Pickup"}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-11 rounded-2xl bg-slate-600 px-3 text-sm font-extrabold text-white shadow-md shadow-slate-900/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : isDeliveryCancel ? "Cancel Delivery" : "Cancel Pickup"}
                </button>
              </div>
            </form>
          </div>
        );
      })()
    : null;
  const pendingDeliveryModal = pendingDeliveryConfirmation
    ? (() => {
        const rental = pendingDeliveryConfirmation;
        const vendor = firstRelated(rental.rental_vendors);
        const calledInBy = firstRelated(rental.called_in_by);
        const calledInName = calledInBy?.display_name ?? rental.called_in_by_name ?? "Unknown";
        const closeDeliveryModal = () => {
          stopScanner();
          setPendingDeliveryConfirmation(null);
          setDeliveryDetailsOpen(false);
          setDuplicateRental(null);
          setScannerStatus("");
          setScannerError("");
          setScannerSuccess("");
          setScannedByCamera(false);
          setError("");
          setForm((current) => ({
            ...current,
            barcodeNumber: "",
            serialNumber: "",
            deliveredDate: todayValue(),
            deliveredTime: timeValue(),
            location: "RT Equipment Room",
            otherLocation: "",
            notes: ""
          }));
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6"
            role="presentation"
          >
            <form
              onSubmit={submitPendingDeliveryConfirmation}
              role="dialog"
              aria-modal="true"
              aria-labelledby="rental-delivery-title"
              className="max-h-[calc(100vh-3rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_18px_50px_rgba(15,23,42,0.28)]"
            >
              <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">Pending Delivery</p>
              <h2 id="rental-delivery-title" className="mt-1 text-xl font-black text-hospital-ink">
                Confirm Delivery
              </h2>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
                Confirm this BiPAP V60 has physically arrived.
              </p>
              <div className="mt-3 grid gap-1 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-xs font-bold text-slate-700">
                <p>Equipment: {equipmentLabels[rental.equipment_type]}</p>
                <p>Company: {vendor?.name ?? "Unknown company"}</p>
                <p>
                  Ordered/called in: {rental.called_in_at ? formatDateTime(rental.called_in_at, departmentTimezone) : "Unknown"} by {calledInName}
                </p>
                <p>Status: Pending Delivery</p>
              </div>
              {error && (
                <p role="alert" className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                  {error}
                </p>
              )}

              <section className="mt-4">
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-cyan-700">
                  Barcode #
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">Required</span>
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void startScanner()}
                    className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white"
                  >
                    {scannerSuccess ? "Rescan" : "Scan Barcode"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopScanner();
                      setScannerStatus("");
                      setScannerError("");
                    }}
                    className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
                  >
                    Manual Entry
                  </button>
                </div>
                {scannerOpen && (
                  <div className="mt-3 rounded-2xl border border-cyan-100 bg-slate-950 p-2">
                    <video ref={videoRef} className="aspect-video w-full rounded-xl object-cover" muted playsInline />
                  </div>
                )}
                {scannerStatus && <p className="mt-2 text-xs font-bold text-cyan-700">{scannerStatus}</p>}
                {scannerSuccess && (
                  <p className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-700 shadow-[0_0_18px_rgba(16,185,129,0.22)]">
                    {scannerSuccess}
                  </p>
                )}
                {scannerError && <p className="mt-2 text-xs font-bold text-rose-700">{scannerError}</p>}
                <input
                  value={form.barcodeNumber}
                  onChange={(event) => {
                    setScannedByCamera(false);
                    setForm((current) => ({ ...current, barcodeNumber: event.target.value }));
                  }}
                  onBlur={() => void lookupKnownEquipment(form.barcodeNumber)}
                  placeholder="Scan or enter barcode number"
                  className="mt-3 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
                {!form.barcodeNumber.trim() && (
                  <p className="mt-2 text-xs font-bold text-slate-500">Scan or enter barcode number to continue.</p>
                )}
                <label className="mt-3 block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Serial Number (optional)</span>
                  <input
                    value={form.serialNumber}
                    onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))}
                    onBlur={() => void lookupKnownEquipment(form.serialNumber)}
                    placeholder="Example: MX70015814"
                    className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                  <span className="mt-1 block text-xs font-bold text-slate-500">Optional if visible on equipment label.</span>
                </label>
              </section>

              <section className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-700">
                <p>Barcode #: {barcodeNumberLabel(form.barcodeNumber)}</p>
                <p>Serial Number: {serialNumberLabel(form.serialNumber)}</p>
                <p>Delivered: {form.deliveredDate} {form.deliveredTime}</p>
                <p>Delivered by: {authContext.displayName}</p>
                <p>Location: {currentLocation || "RT Equipment Room"}</p>
                {!deliveryDetailsOpen ? (
                  <button
                    type="button"
                    onClick={() => setDeliveryDetailsOpen(true)}
                    className="mt-3 min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 shadow-sm"
                  >
                    Edit delivery details
                  </button>
                ) : (
                  <div className="mt-3 grid gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Delivered date</span>
                        <input
                          type="date"
                          value={form.deliveredDate}
                          onChange={(event) => setForm((current) => ({ ...current, deliveredDate: event.target.value }))}
                          className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Delivered time</span>
                        <input
                          type="time"
                          value={form.deliveredTime}
                          onChange={(event) => setForm((current) => ({ ...current, deliveredTime: event.target.value }))}
                          className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Current Location</span>
                      <select
                        value={form.location}
                        onChange={(event) => setForm((current) => ({ ...current, location: event.target.value, otherLocation: "" }))}
                        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400"
                      >
                        {locationOptions.map((location) => (
                          <option key={location} value={location}>
                            {location}
                          </option>
                        ))}
                      </select>
                    </label>
                    {form.location === "Other" && (
                      <label className="block">
                        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Other Location</span>
                        <input
                          value={form.otherLocation}
                          onChange={(event) => setForm((current) => ({ ...current, otherLocation: event.target.value.slice(0, 80) }))}
                          maxLength={80}
                          placeholder="Enter location"
                          className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400"
                        />
                      </label>
                    )}
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Optional note</span>
                      <textarea
                        value={form.notes}
                        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value.slice(0, 140) }))}
                        maxLength={140}
                        placeholder="Optional"
                        className="mt-1 min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400"
                      />
                      <span className="mt-1 flex justify-between gap-3 text-xs font-bold text-slate-500">
                        <span>No patient information.</span>
                        <span>{form.notes.length}/140</span>
                      </span>
                    </label>
                  </div>
                )}
              </section>

              {duplicateRental && (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-900">
                  {(() => {
                    const duplicateVendor = firstRelated(duplicateRental.rental_vendors);
                    const deliveredBy = firstRelated(duplicateRental.checked_in_by);

                    return (
                      <>
                        <p className="font-black">This equipment is already in the hospital.</p>
                        <p className="mt-2">Company: {duplicateVendor?.name ?? "Unknown company"}</p>
                        <p>Equipment: {equipmentQuickLabel(duplicateRental.equipment_type, duplicateRental.barcode_number, duplicateRental.serial_number)}</p>
                        <p>Barcode #: {barcodeNumberLabel(duplicateRental.barcode_number)}</p>
                        <p>Serial Number: {serialNumberLabel(duplicateRental.serial_number)}</p>
                        <p>Location: {duplicateRental.current_location ?? "RT Equipment Room"}</p>
                        <p>Delivered: {duplicateRental.checked_in_at ? formatDateTime(duplicateRental.checked_in_at, departmentTimezone) : "Unknown"}</p>
                        <p>Delivered by: {deliveredBy?.display_name ?? "Unknown"}</p>
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="submit"
                  disabled={saving || !canConfirmPendingDelivery}
                  className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Confirm Delivery"}
                </button>
                <button
                  type="button"
                  onClick={closeDeliveryModal}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        );
      })()
    : null;
  const pendingPickupModal = pendingPickupConfirmation
    ? (() => {
        const rental = pendingPickupConfirmation;
        const vendor = firstRelated(rental.rental_vendors);
        const pickupEvent = findPickupEvent(eventsByRentalId[rental.id] ?? []);
        const pickupBy =
          firstRelated(rental.pickup_requested_by)?.display_name ??
          (pickupEvent ? firstRelated(pickupEvent.staff_profiles)?.display_name : null) ??
          "Unknown";
        const pickupAt = rental.pickup_requested_at ?? pickupEvent?.event_at;
        const closePickupModal = () => {
          setPendingPickupConfirmation(null);
          setPickupDetailsOpen(false);
          setPickupDateDraft("");
          setPickupTimeDraft("");
          setPickupNoteDraft("");
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6"
            role="presentation"
          >
            <form
              onSubmit={submitPendingPickupPickedUp}
              role="dialog"
              aria-modal="true"
              aria-labelledby="rental-pickup-title"
              className="max-h-[calc(100vh-3rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_18px_50px_rgba(15,23,42,0.28)]"
            >
              <p className="text-xs font-extrabold uppercase tracking-wide text-amber-700">Pending Pickup</p>
              <h2 id="rental-pickup-title" className="mt-1 text-xl font-black text-hospital-ink">
                Confirm Picked Up
              </h2>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
                Confirm this BiPAP V60 has physically left the hospital.
              </p>
              <div className="mt-3 grid gap-1 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3 text-xs font-bold text-slate-700">
                <p>Equipment: {equipmentQuickLabel(rental.equipment_type, rental.barcode_number, rental.serial_number)}</p>
                <p>Barcode #: {barcodeNumberLabel(rental.barcode_number)}</p>
                <p>Serial Number: {serialNumberLabel(rental.serial_number)}</p>
                <p>Company: {vendor?.name ?? "Unknown company"}</p>
                <p>Location: {rental.current_location || "Unknown"}</p>
                <p>
                  Pickup requested: {pickupAt ? formatDateTime(pickupAt, departmentTimezone) : "Unknown"} by {pickupBy}
                </p>
                <p>Delivered: {rental.checked_in_at ? formatDateTime(rental.checked_in_at, departmentTimezone) : "Unknown"}</p>
                <p>In hospital: {rental.checked_in_at ? daysInHospitalLabel(rental.checked_in_at, departmentTimezone) : "Unknown"}</p>
                <p>Picked up by: {authContext.displayName}</p>
              </div>
              {!pickupDetailsOpen ? (
                <button
                  type="button"
                  onClick={() => setPickupDetailsOpen(true)}
                  className="mt-3 min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 shadow-sm"
                >
                  Edit pickup details
                </button>
              ) : (
                <div className="mt-3 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Picked up date</span>
                      <input
                        type="date"
                        value={pickupDateDraft}
                        onChange={(event) => setPickupDateDraft(event.target.value)}
                        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Picked up time</span>
                      <input
                        type="time"
                        value={pickupTimeDraft}
                        onChange={(event) => setPickupTimeDraft(event.target.value)}
                        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Optional note</span>
                    <textarea
                      value={pickupNoteDraft}
                      onChange={(event) => setPickupNoteDraft(event.target.value.slice(0, 140))}
                      maxLength={140}
                      placeholder="Optional"
                      className="mt-1 min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-400"
                    />
                    <span className="mt-1 flex justify-between gap-3 text-xs font-bold text-slate-500">
                      <span>No patient information.</span>
                      <span>{pickupNoteDraft.length}/140</span>
                    </span>
                  </label>
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="submit"
                  disabled={saving || !pickupDateDraft || !pickupTimeDraft}
                  className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Confirm Picked Up"}
                </button>
                <button
                  type="button"
                  onClick={closePickupModal}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        );
      })()
    : null;

  if (mode === "overview") {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-xl space-y-4">
          <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Department Operations</p>
            <h1 className="mt-2 text-2xl font-black text-hospital-ink">Rental Management</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              BiPAP V60 rental tracking
            </p>
            <div ref={activeRentalsRef} className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3">
                <p className="text-2xl font-black text-hospital-ink">{activeRentals.length}</p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  {activeRentals.length === 1 ? "Active Rental" : "Active Rentals"}
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3">
                <p className="text-2xl font-black text-hospital-ink">{oldestRentalDateLabel}</p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">Oldest Rental</p>
              </div>
            </div>
            {loading && <p className="mt-2 text-sm font-bold text-slate-500">Loading rentals...</p>}
            {!loading && activeRentals.length === 0 && (
              <p className="mt-2 text-xs font-bold text-slate-500">Delivered rentals will appear here.</p>
            )}
            <Link
              href="/operations/rental-management/active"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white shadow-md shadow-cyan-900/20"
            >
              View Active Rentals
            </Link>
          </section>

          {checkedIn && (
            <p role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              Rental delivered and active.
            </p>
          )}
          {calledIn && (
            <p role="status" className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700">
              Rental logged as pending delivery.
            </p>
          )}
          {pickupLogged && (
            <p role="status" className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
              Pickup call logged.
            </p>
          )}
          {pickedUpLogged && (
            <p role="status" className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              Equipment marked picked up.
            </p>
          )}
          {deliveryCancelled && (
            <p role="status" className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              Delivery canceled.
            </p>
          )}
          {pickupCancelled && (
            <p role="status" className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              Pickup request canceled.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          <section className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
            <h2 className="text-base font-black text-hospital-ink">Rental Actions</h2>
            <p className="mt-1 text-sm font-bold leading-5 text-slate-500">Order or return a BiPAP V60 rental.</p>
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
              <Link
                href="/operations/rental-management/check-in"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white shadow-md shadow-cyan-900/20"
              >
                <ScanLine size={18} aria-hidden="true" />
                Order Rental
              </Link>
              <Link
                href="/operations/rental-management/return"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 text-sm font-extrabold text-white shadow-md shadow-amber-900/20"
              >
                <RotateCcw size={18} aria-hidden="true" />
                Return Rental
              </Link>
            </div>
          </section>

          {(pendingDeliveries.length > 0 || pendingPickups.length > 0) && (
            <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">Pending</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">Deliveries and pickups waiting to be completed.</p>
              <div className="mt-3 grid gap-4">
                {pendingDeliveries.length > 0 && (
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">Pending Deliveries</p>
                    <div className="mt-2 grid gap-2">
                      {pendingDeliveries.map((pending) => {
                        const vendor = firstRelated(pending.rental_vendors);
                        const calledInBy = firstRelated(pending.called_in_by);
                        const calledInName = calledInBy?.display_name ?? pending.called_in_by_name ?? "Unknown";
                        const calledInText = pending.called_in_at ? formatDateTime(pending.called_in_at, departmentTimezone) : "Unknown";
                        const deliveredLabel = pending.equipment_type ? `${equipmentLabels[pending.equipment_type]} Delivered` : "Mark Delivered";

                        return (
                          <article key={pending.id} className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3">
                            <p className="flex items-start gap-2 text-sm font-black leading-5 text-hospital-ink">
                              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.18)]" aria-hidden="true" />
                              <span>
                                {equipmentLabels[pending.equipment_type]} rental ordered by {calledInName}
                                {pending.called_in_at ? ` at ${formatDateTime(pending.called_in_at, departmentTimezone)}` : ""}
                              </span>
                            </p>
                            <div className="mt-2 grid gap-1 text-xs font-bold text-slate-600">
                              <p>Company: {vendor?.name ?? "Unknown company"}</p>
                              <p>Called in: {calledInText}</p>
                              <p>Called in by: {calledInName}</p>
                              {pending.notes && <p>Note: {pending.notes}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                stopScanner();
                                setPendingDeliveryConfirmation(pending);
                                setDeliveryDetailsOpen(false);
                                setDuplicateRental(null);
                                setScannerStatus("");
                                setScannerError("");
                                setScannerSuccess("");
                                setScannedByCamera(false);
                                setError("");
                                setForm((current) => ({
                                  ...current,
                                  vendorId: pending.vendor_id,
                                  equipmentType: pending.equipment_type,
                                  barcodeNumber: "",
                                  serialNumber: "",
                                  deliveredDate: todayValue(),
                                  deliveredTime: timeValue(),
                                  location: "RT Equipment Room",
                                  otherLocation: "",
                                  notes: ""
                                }));
                              }}
                              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-700 px-3 text-xs font-extrabold text-white shadow-md shadow-sky-900/20"
                            >
                              {deliveredLabel}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingCancellation({ rental: pending, action: "delivery" });
                                setCancelNote("");
                              }}
                              className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 shadow-sm"
                            >
                              Cancel Delivery
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}

                {pendingPickups.length > 0 && (
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wide text-amber-700">Pending Pickups</p>
                    <div className="mt-2 grid gap-2">
                      {pendingPickups.map((pending) => {
                        const vendor = firstRelated(pending.rental_vendors);
                        const pickupEvent = findPickupEvent(eventsByRentalId[pending.id] ?? []);
                        const pickupBy =
                          firstRelated(pending.pickup_requested_by)?.display_name ??
                          (pickupEvent ? firstRelated(pickupEvent.staff_profiles)?.display_name : null) ??
                          "Unknown";
                        const pickupText = pending.pickup_requested_at ?? pickupEvent?.event_at;
                        const pickupDisplay = pickupText ? formatDateTime(pickupText, departmentTimezone) : "Unknown";
                        const pickedUpLabel = pending.equipment_type ? `${equipmentLabels[pending.equipment_type]} Picked Up` : "Mark Picked Up";

                        return (
                          <article key={pending.id} className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3">
                            <p className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm font-black leading-5 text-hospital-ink">
                              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]" aria-hidden="true" />
                              <span>
                                {equipmentQuickLabel(pending.equipment_type, pending.barcode_number, pending.serial_number)} pickup requested by {pickupBy}
                                {pickupText ? ` at ${pickupDisplay}` : ""}
                              </span>
                            </p>
                            <div className="mt-2 grid gap-1 text-xs font-bold text-slate-600">
                              <p>Barcode #: {barcodeNumberLabel(pending.barcode_number)}</p>
                              {!pending.serial_number && <p className="text-amber-700">Serial Number: Not entered</p>}
                              {pending.serial_number && <p>Serial Number: {pending.serial_number}</p>}
                              <p>Company: {vendor?.name ?? "Unknown company"}</p>
                              <p>Location: {pending.current_location || "Unknown"}</p>
                              <p>Called for pickup: {pickupDisplay}</p>
                              <p>Called by: {pickupBy}</p>
                              {pending.pickup_confirmation_number && <p>Confirmation: {pending.pickup_confirmation_number}</p>}
                              {pending.pickup_request_note && <p>Note: {pending.pickup_request_note}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingPickupConfirmation(pending);
                                setPickupDetailsOpen(false);
                                setPickupDateDraft(todayValue());
                                setPickupTimeDraft(timeValue());
                                setPickupNoteDraft("");
                              }}
                              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-amber-500 px-3 text-xs font-extrabold text-white shadow-md shadow-amber-900/20"
                            >
                              {pickedUpLabel}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingCancellation({ rental: pending, action: "pickup" });
                                setCancelNote("");
                              }}
                              className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 shadow-sm"
                            >
                              Cancel Pickup
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          <Link
            href="/operations/rental-management/history"
            className="block rounded-3xl border border-cyan-100 bg-white/95 p-4 text-left shadow-soft transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <History size={20} />
              </span>
              <div>
                <h2 className="text-base font-black text-hospital-ink">Rental History</h2>
                <p className="mt-1 text-sm font-bold leading-5 text-slate-500">Search active and picked-up rental records.</p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-emerald-700">Active</p>
              </div>
            </div>
          </Link>

          <Link
            href="/operations"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
          >
            Back to Dashboard
          </Link>
        </div>
        {cancellationModal}
        {pendingDeliveryModal}
        {pendingPickupModal}
      </main>
    );
  }

  if (mode === "active") {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-xl space-y-4">
          <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Rental Management</p>
            <h1 className="mt-2 text-2xl font-black text-hospital-ink">Active Rentals</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Rented equipment currently in the hospital.
            </p>
            <Link
              href="/operations/rental-management"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
            >
              Back to Rental Management
            </Link>
          </section>

          {error && (
            <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Active Rentals</h2>
            {loading && <p className="mt-2 text-sm font-bold text-slate-500">Loading rentals...</p>}
            {!loading && activeRentals.length === 0 && (
              <p className="mt-2 text-sm font-bold text-slate-500">No active rentals.</p>
            )}
            <div className="mt-3 grid gap-2">
              {activeRentals.map((rental) => {
                const vendor = firstRelated(rental.rental_vendors);
                const deliveredBy = firstRelated(rental.checked_in_by);
                const calledInBy = firstRelated(rental.called_in_by);
                const styles = rentalStatusStyles(rental.status);
                const rentalEvents = eventsByRentalId[rental.id] ?? [];
                const pickupEvent = findPickupEvent(rentalEvents);
                const pickupBy =
                  firstRelated(rental.pickup_requested_by)?.display_name ??
                  (pickupEvent ? firstRelated(pickupEvent.staff_profiles)?.display_name : null);
                const calledInName = calledInBy?.display_name ?? rental.called_in_by_name ?? null;

                return (
                  <article key={rental.id} className={`rounded-2xl border px-3 py-3 ${styles.card}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-black text-hospital-ink">
                          <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} aria-hidden="true" />
                          <span>{equipmentQuickLabel(rental.equipment_type, rental.barcode_number, rental.serial_number)}</span>
                        </p>
                        <p className={`mt-1 text-xs font-extrabold uppercase tracking-wide ${styles.text}`}>
                          {rentalStatusLabel(rental.status)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs font-bold text-slate-500">
                      <p>Barcode #: {barcodeNumberLabel(rental.barcode_number)}</p>
                      <p>Serial Number: {serialNumberLabel(rental.serial_number)}</p>
                      <p>Company: {vendor?.name ?? "Unknown company"}</p>
                      {isPickupCalledStatus(rental.status) && (pickupEvent || rental.pickup_requested_at) && (
                        <p>
                          Called for pickup: {formatDateTime(rental.pickup_requested_at ?? pickupEvent!.event_at, departmentTimezone)}
                          {pickupBy ? ` by ${pickupBy}` : ""}
                        </p>
                      )}
                      <p>Last known location: {rental.current_location || "Unknown"}</p>
                      <p>Called in: {rental.called_in_at ? formatDateTime(rental.called_in_at, departmentTimezone) : "Unknown"}</p>
                      <p>Called in by: {calledInName ?? "Unknown"}</p>
                      <p>Delivered: {rental.checked_in_at ? formatDateTime(rental.checked_in_at, departmentTimezone) : "Unknown"}</p>
                      <p>In hospital: {rental.checked_in_at ? daysInHospitalLabel(rental.checked_in_at, departmentTimezone) : "Unknown"}</p>
                      <p>Delivered by: {deliveredBy?.display_name ?? "Unknown"}</p>
                    </div>
                    {(rental.serial_number || rental.barcode_number) && (
                      <Link
                        href={`/operations/rental-management/history?serial=${encodeURIComponent(rental.serial_number ?? rental.barcode_number ?? "")}`}
                        className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-cyan-100 bg-white px-3 text-xs font-extrabold text-cyan-700"
                      >
                        View History
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (mode === "history") {
    const selectedVendorFilter = vendors.find((vendor) => vendor.id === historyVendorId) ?? null;
    const filtersActive =
      Boolean(historySearch.trim()) ||
      historyStatus !== "all" ||
      historyEquipment !== "all" ||
      historyVendorId !== "all" ||
      dateRangePreset !== "all";
    const summaryParts = [
      historyEquipment === "all" ? "all equipment" : equipmentLabels[historyEquipment],
      historyStatus === "all" ? null : historyStatusLabels[historyStatus],
      historyVendorId === "all" ? null : selectedVendorFilter?.name,
      dateRangePreset === "all" ? "all time" : dateRangeLabels[dateRangePreset].toLowerCase()
    ].filter(Boolean);
    const filterSummary = filtersActive ? `Showing ${summaryParts.join(" - ")}` : "Showing all rental records";
    const resetHistoryFilters = () => {
      setHistorySearch("");
      setHistoryStatus("all");
      setHistoryEquipment("all");
      setHistoryVendorId("all");
      setDateRangePreset("all");
      setCustomStartDate("");
      setCustomEndDate("");
      setOpenHistoryFilter("");
    };
    const toggleHistoryFilter = (filter: HistoryFilterPanel) => {
      setOpenHistoryFilter((current) => (current === filter ? "" : filter));
    };
    const exportHistory = (scope: "current" | "all") => {
      setExportError("");

      if (scope === "current" && filteredHistory.length === 0) {
        setExportError("No rental records to export.");
        return;
      }

      if (scope === "all" && rentalHistory.length === 0) {
        setExportError("No rental records to export.");
        return;
      }

      const params = new URLSearchParams({ scope });

      if (scope === "current") {
        params.set("search", historySearch);
        params.set("status", historyStatus);
        params.set("equipment", historyEquipment);
        params.set("vendorId", historyVendorId);
        params.set("dateRange", dateRangePreset);
        if (customStartDate) {
          params.set("startDate", customStartDate);
        }
        if (customEndDate) {
          params.set("endDate", customEndDate);
        }
      }

      setExportingHistory(scope);
      window.location.assign(`/api/rental-history/export?${params.toString()}`);
      window.setTimeout(() => setExportingHistory(""), 1500);
    };

    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-xl space-y-4 pb-24">
          <section className="px-1">
            <h1 className="text-3xl font-black text-hospital-ink">Rental History</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">View active and past rental records.</p>
            <Link
              href="/operations/rental-management"
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-700 bg-white px-4 text-sm font-extrabold text-cyan-800 shadow-sm"
            >
              <ArrowLeft size={18} aria-hidden="true" />
              Back to Rental Management
            </Link>
          </section>

          {error && (
            <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.10)]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} aria-hidden="true" />
              <input
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Search barcode, serial number, or company"
                className="min-h-14 w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-3 text-sm font-bold text-hospital-ink outline-none shadow-inner focus:border-cyan-300"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => toggleHistoryFilter("status")}
                className={`flex min-h-14 items-center justify-between rounded-2xl border px-3 text-left shadow-sm ${
                  openHistoryFilter === "status" ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-white"
                }`}
              >
                <span>
                  <span className="block text-[11px] font-extrabold text-slate-400">Status</span>
                  <span className="block text-sm font-black text-hospital-ink">{historyStatusLabels[historyStatus]}</span>
                </span>
                <ChevronDown size={16} className="text-slate-500" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => toggleHistoryFilter("date")}
                className={`flex min-h-14 items-center justify-between rounded-2xl border px-3 text-left shadow-sm ${
                  openHistoryFilter === "date" ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-white"
                }`}
              >
                <span>
                  <span className="block text-[11px] font-extrabold text-slate-400">Date</span>
                  <span className="block text-sm font-black text-hospital-ink">{dateRangeLabels[dateRangePreset]}</span>
                </span>
                <ChevronDown size={16} className="text-slate-500" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => toggleHistoryFilter("equipment")}
                className={`flex min-h-14 items-center justify-between rounded-2xl border px-3 text-left shadow-sm ${
                  openHistoryFilter === "equipment" ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-white"
                }`}
              >
                <span>
                  <span className="block text-[11px] font-extrabold text-slate-400">Equipment</span>
                  <span className="block text-sm font-black text-hospital-ink">
                    {historyEquipment === "all" ? "All" : equipmentLabels[historyEquipment]}
                  </span>
                </span>
                <ChevronDown size={16} className="text-slate-500" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => toggleHistoryFilter("more")}
                className={`flex min-h-14 items-center justify-between rounded-2xl border px-3 text-left shadow-sm ${
                  openHistoryFilter === "more" ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-white"
                }`}
              >
                <span className="inline-flex items-center gap-2 text-sm font-black text-hospital-ink">
                  <Filter size={16} aria-hidden="true" />
                  More Filters
                </span>
                <ChevronDown size={16} className="text-slate-500" aria-hidden="true" />
              </button>
            </div>

            {openHistoryFilter && (
              <div className="mt-3 rounded-2xl border border-cyan-100 bg-slate-50/80 p-3">
                {openHistoryFilter === "status" && (
                  <div className="grid gap-2">
                    {(["all", "pending", "active", "pickup", "returned"] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          setHistoryStatus(status);
                          setOpenHistoryFilter("");
                        }}
                        className={`min-h-11 rounded-2xl px-3 text-left text-sm font-extrabold ${
                          historyStatus === status ? "bg-cyan-700 text-white" : "border border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {historyStatusLabels[status]}
                      </button>
                    ))}
                  </div>
                )}

                {openHistoryFilter === "date" && (
                  <div className="grid gap-2">
                    {(["all", "today", "7", "30", "custom"] as const).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDateRangePreset(preset)}
                        className={`min-h-11 rounded-2xl px-3 text-left text-sm font-extrabold ${
                          dateRangePreset === preset ? "bg-cyan-700 text-white" : "border border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {dateRangeLabels[preset]}
                      </button>
                    ))}
                    {dateRangePreset === "custom" && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <label className="block">
                          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Start date</span>
                          <input
                            type="date"
                            value={customStartDate}
                            onChange={(event) => setCustomStartDate(event.target.value)}
                            className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">End date</span>
                          <input
                            type="date"
                            value={customEndDate}
                            onChange={(event) => setCustomEndDate(event.target.value)}
                            className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {openHistoryFilter === "equipment" && (
                  <div className="grid gap-2">
                    {(["all", "bipap"] as const).map((equipment) => (
                      <button
                        key={equipment}
                        type="button"
                        onClick={() => {
                          setHistoryEquipment(equipment);
                          setOpenHistoryFilter("");
                        }}
                        className={`min-h-11 rounded-2xl px-3 text-left text-sm font-extrabold ${
                          historyEquipment === equipment ? "bg-cyan-700 text-white" : "border border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {equipment === "all" ? "All Equipment" : equipmentLabels[equipment]}
                      </button>
                    ))}
                  </div>
                )}

                {openHistoryFilter === "more" && (
                  <div className="grid gap-3">
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Company</span>
                      <select
                        value={historyVendorId}
                        onChange={(event) => setHistoryVendorId(event.target.value)}
                        className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                      >
                        <option value="all">All Companies</option>
                        {vendors.map((vendor) => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={resetHistoryFilters}
                      className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
              <p className="inline-flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-700" aria-hidden="true" />
                <span className="truncate">{filterSummary}</span>
              </p>
              {filtersActive && (
                <button type="button" onClick={resetHistoryFilters} className="shrink-0 font-extrabold text-cyan-800">
                  Clear
                </button>
              )}
            </div>
            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Export paper trail</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => exportHistory("current")}
                  disabled={Boolean(exportingHistory) || loading || filteredHistory.length === 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download size={16} aria-hidden="true" />
                  {exportingHistory === "current" ? "Preparing CSV..." : "Export Current View"}
                </button>
                <button
                  type="button"
                  onClick={() => exportHistory("all")}
                  disabled={Boolean(exportingHistory) || loading || rentalHistory.length === 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-100 bg-white px-3 text-sm font-extrabold text-cyan-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download size={16} aria-hidden="true" />
                  {exportingHistory === "all" ? "Preparing CSV..." : "Export All History"}
                </button>
              </div>
              <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                CSV opens in Excel. The app database remains the source of truth.
              </p>
              {exportError && (
                <p role="alert" className="mt-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                  {exportError}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-hospital-ink">Rental Records</h2>
              <p className="text-sm font-extrabold text-slate-500">
                {filteredHistory.length} {filteredHistory.length === 1 ? "record" : "records"}
              </p>
            </div>
            {loading && <p className="mt-2 text-sm font-bold text-slate-500">Loading rental history...</p>}
            {!loading && filteredHistory.length === 0 && (
              <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                <p className="text-sm font-black text-hospital-ink">No rental records found.</p>
                <p className="mt-1 text-xs font-bold text-slate-500">Try changing your search or date range.</p>
              </div>
            )}
            <div className="mt-3 grid gap-2">
              {filteredHistory.map((record) => {
                const vendor = firstRelated(record.rental_vendors);
                const deliveredBy = firstRelated(record.checked_in_by);
                const calledInBy = firstRelated(record.called_in_by);
                const recordEvents = eventsByRentalId[record.id] ?? [];
                const calledInEvent = findCalledInEvent(recordEvents);
                const deliveredEvent = findDeliveredEvent(recordEvents);
                const pickupEvent = findPickupEvent(recordEvents);
                const pickupBy =
                  firstRelated(record.pickup_requested_by)?.display_name ??
                  (pickupEvent ? firstRelated(pickupEvent.staff_profiles)?.display_name : null);
                const pickedUpEvent = findPickedUpEvent(recordEvents);
                const pickedUpBy =
                  firstRelated(record.returned_by)?.display_name ??
                  (pickedUpEvent ? firstRelated(pickedUpEvent.staff_profiles)?.display_name : null);
                const expanded = expandedRentalId === record.id;
                const pending = isPendingDeliveryStatus(record.status);
                const deliveryCancelled = isDeliveryCancelledStatus(record.status);
                const pickedUp = isPickedUpStatus(record.status);
                const styles = rentalStatusStyles(record.status);
                const statusLabel = rentalStatusLabel(record.status);
                const calledInName =
                  calledInBy?.display_name ??
                  record.called_in_by_name ??
                  (calledInEvent ? firstRelated(calledInEvent.staff_profiles)?.display_name : null);
                const deliveredName =
                  deliveredBy?.display_name ?? (deliveredEvent ? firstRelated(deliveredEvent.staff_profiles)?.display_name : null);
                const dateRangeLabel =
                  pending || deliveryCancelled
                    ? `${deliveryCancelled ? "Canceled" : "Called in"}: ${
                        (deliveryCancelled ? record.cancelled_at : record.called_in_at)
                          ? formatDateTime((deliveryCancelled ? record.cancelled_at : record.called_in_at)!, departmentTimezone)
                          : "Unknown"
                      }`
                    : record.checked_in_at
                      ? `${shortDate(record.checked_in_at, departmentTimezone)} - ${
                          record.returned_at ? shortDate(record.returned_at, departmentTimezone) : "Present"
                        }`
                      : "Not delivered";

                return (
                  <article key={record.id} className="rounded-2xl border border-slate-100 bg-white px-3 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
                    <button
                      type="button"
                      onClick={() => setExpandedRentalId((current) => (current === record.id ? null : record.id))}
                      className="w-full text-left"
                    >
                      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                        <span className={`h-3 w-3 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
                        <div className="min-w-0">
                          <p className={`inline-flex rounded-full px-2 py-1 text-[11px] font-black ${styles.text} ${styles.card}`}>
                            {statusLabel}
                          </p>
                          {pending || deliveryCancelled ? (
                            <>
                              <p className="mt-2 text-base font-black text-hospital-ink">{equipmentLabels[record.equipment_type]}</p>
                              <p className="mt-1 text-xs font-bold text-slate-600">
                                Barcode #: {barcodeNumberLabel(record.barcode_number)}
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-600">
                                Serial Number: {serialNumberLabel(record.serial_number)}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-black text-hospital-ink">
                                <span>{equipmentQuickLabel(record.equipment_type, record.barcode_number, record.serial_number)}</span>
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-600">
                                Barcode #: {barcodeNumberLabel(record.barcode_number)}
                              </p>
                              {!record.serial_number && (
                                <p className="mt-1 text-xs font-bold text-slate-600">Serial Number: Not entered</p>
                              )}
                            </>
                          )}
                          <p className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600">
                            <Building2 size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
                            <span className="truncate">{vendor?.name ?? "Unknown company"}</span>
                          </p>
                          {!pending && !deliveryCancelled && (
                            <p className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-600">
                              <MapPin size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
                              <span className="truncate">{record.current_location || "Unknown"}</span>
                            </p>
                          )}
                          <p className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-600">
                            <CalendarDays size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
                            <span className="truncate">{dateRangeLabel}</span>
                          </p>
                        </div>
                        {expanded ? (
                          <ChevronUp size={20} className="text-slate-500" aria-hidden="true" />
                        ) : (
                          <ChevronRight size={20} className="text-slate-500" aria-hidden="true" />
                        )}
                      </div>
                    </button>

                    {expanded && (
                      <div className="mt-3 border-t border-slate-100 pt-3 text-xs font-bold text-slate-500">
                        <div className="grid gap-2 rounded-2xl bg-slate-50/80 p-3">
                          <p>
                            <span className="text-slate-400">Equipment:</span> {equipmentLabels[record.equipment_type]}
                          </p>
                          <p>
                            <span className="text-slate-400">Equipment Type:</span> {equipmentTypeCategoryLabel}
                          </p>
                          <p>
                            <span className="text-slate-400">Model:</span> {equipmentModelLabel}
                          </p>
                          <p>
                            <span className="text-slate-400">Barcode #:</span> {barcodeNumberLabel(record.barcode_number)}
                          </p>
                          <p>
                            <span className="text-slate-400">Serial Number:</span> {serialNumberLabel(record.serial_number)}
                          </p>
                          <p>
                            <span className="text-slate-400">Company:</span> {vendor?.name ?? "Unknown company"}
                          </p>
                          <p>
                            <span className="text-slate-400">Status:</span> {statusLabel}
                          </p>
                          <p>
                            <span className="text-slate-400">Called in:</span>{" "}
                            {record.called_in_at ? formatDateTime(record.called_in_at, departmentTimezone) : "Unknown"}
                          </p>
                          <p>
                            <span className="text-slate-400">Called in by:</span> {calledInName ?? "Unknown"}
                          </p>
                          {(pickupEvent || record.pickup_requested_at) && (
                            <p>
                              <span className="text-slate-400">Called for pickup:</span>{" "}
                              {formatDateTime(pickupEvent?.event_at ?? record.pickup_requested_at!, departmentTimezone)}
                              {pickupBy ? ` by ${pickupBy}` : ""}
                            </p>
                          )}
                          {record.pickup_confirmation_number && <p>Pickup confirmation: {record.pickup_confirmation_number}</p>}
                          {record.pickup_request_note && <p>Pickup note: {record.pickup_request_note}</p>}
                          {deliveryCancelled && (
                            <p>
                              <span className="text-slate-400">Delivery canceled:</span>{" "}
                              {record.cancelled_at ? formatDateTime(record.cancelled_at, departmentTimezone) : "Unknown"}
                            </p>
                          )}
                          {record.cancellation_note && <p>Cancellation note: {record.cancellation_note}</p>}
                          <p>
                            <span className="text-slate-400">Delivered:</span>{" "}
                            {record.checked_in_at ? formatDateTime(record.checked_in_at, departmentTimezone) : "Not delivered yet"}
                          </p>
                          <p>
                            <span className="text-slate-400">Delivered by:</span> {deliveredName ?? "Unknown"}
                          </p>
                          <p>
                            <span className="text-slate-400">Last known location:</span> {record.current_location || "Unknown"}
                          </p>
                          {record.returned_at && (
                            <p>
                              <span className="text-slate-400">Picked up:</span> {formatDateTime(record.returned_at, departmentTimezone)}
                            </p>
                          )}
                          {pickedUp && (
                            <p>
                              <span className="text-slate-400">Picked up by:</span> {pickedUpBy ?? "Not recorded"}
                            </p>
                          )}
                          {record.return_note && <p>Return note: {record.return_note}</p>}
                          {pending ? (
                            <p>
                              <span className="text-slate-400">Waiting for delivery:</span>{" "}
                              {record.called_in_at ? elapsedLabel(record.called_in_at, departmentTimezone) : "Unknown"}
                            </p>
                          ) : deliveryCancelled ? (
                            <p>
                              <span className="text-slate-400">Total time in hospital:</span> Not delivered
                            </p>
                          ) : (
                            <p>
                              <span className="text-slate-400">Total time in hospital:</span> {totalDaysLabel(record, departmentTimezone)}
                            </p>
                          )}
                          {record.notes && <p>Notes: {record.notes}</p>}
                        </div>

                        {recordEvents.length > 0 && (
                          <div className="mt-3 rounded-2xl border border-slate-100 bg-white px-3 py-3">
                            <p className="font-black text-hospital-ink">Event timeline</p>
                            <div className="mt-3 grid gap-3">
                              {recordEvents.map((event) => {
                                const actor = firstRelated(event.staff_profiles);
                                const label = rentalEventLabel(event.event_type);

                                return (
                                  <div key={event.id} className="grid grid-cols-[14px_1fr] gap-2">
                                    <span className={`mt-1 h-3 w-3 rounded-full ${rentalEventDotClass(event.event_type)}`} aria-hidden="true" />
                                    <p>
                                      <span className="font-black text-hospital-ink">{label}</span> -{" "}
                                      {formatDateTime(event.event_at, departmentTimezone)}
                                      {actor?.display_name ? ` by ${actor.display_name}` : ""}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (mode === "return") {
    const selectedVendor = selectedReturnRental ? firstRelated(selectedReturnRental.rental_vendors) : null;
    const selectedDeliveredBy = selectedReturnRental ? firstRelated(selectedReturnRental.checked_in_by) : null;
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-xl space-y-4">
          <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Rental Management</p>
            <h1 className="mt-2 text-2xl font-black text-hospital-ink">Return Rental</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Request pickup for an active BiPAP V60 rental.
            </p>
            <Link
              href="/operations/rental-management"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
            >
              Back to Rental Management
            </Link>
          </section>

          {error && (
            <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          <section className="rounded-3xl border border-amber-100 bg-amber-50 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Scan Barcode</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Scan the 1D barcode or enter the barcode/serial number.
            </p>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => void startScanner()}
                className="min-h-11 w-full max-w-xs rounded-2xl bg-amber-500 px-3 text-sm font-extrabold text-white shadow-md shadow-amber-900/20"
              >
                {scannerSuccess ? "Rescan" : "Scan Barcode"}
              </button>
            </div>
            {scannerOpen && (
              <div className="mt-3 rounded-2xl border border-amber-100 bg-slate-950 p-2">
                <video ref={videoRef} className="aspect-video w-full rounded-xl object-cover" muted playsInline />
              </div>
            )}
            {scannerStatus && <p className="mt-2 text-xs font-bold text-amber-700">{scannerStatus}</p>}
            {scannerSuccess && (
              <p className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-700 shadow-[0_0_18px_rgba(16,185,129,0.22)]">
                {scannerSuccess}
              </p>
            )}
            {scannerError && <p className="mt-2 text-xs font-bold text-rose-700">{scannerError}</p>}
            <label className="mt-3 block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Barcode # or Serial Number</span>
              <input
                value={form.barcodeNumber}
                onChange={(event) => setForm((current) => ({ ...current, barcodeNumber: event.target.value }))}
                placeholder="Scan barcode or enter barcode/serial number"
                className="mt-1 min-h-12 w-full rounded-2xl border border-amber-100 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-amber-300"
              />
            </label>
            {returnSerialFeedback && (
              <p className="mt-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                {returnSerialFeedback}
              </p>
            )}
            {returnSerialMatches.length > 1 && (
              <p className="mt-2 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800">
                Multiple matching rentals found. Select the correct rental below.
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Select from rentals</h2>
            {loading && <p className="mt-2 text-sm font-bold text-slate-500">Loading rentals...</p>}
            {!loading && returnEligibleRentals.length === 0 && (
              <p className="mt-2 text-sm font-bold text-slate-500">No active rentals available for pickup request.</p>
            )}
            <div className="mt-3 grid gap-2">
              {returnEligibleRentals.map((rental) => {
                const vendor = firstRelated(rental.rental_vendors);
                const styles = rentalStatusStyles(rental.status);
                const selected = selectedReturnRental?.id === rental.id;
                return (
                  <button
                    key={rental.id}
                    type="button"
                    onClick={() => selectReturnRental(rental)}
                    className={`rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
                      selected ? "border-cyan-300 bg-cyan-50 shadow-md shadow-cyan-900/10" : styles.card
                    }`}
                  >
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-hospital-ink">
                      <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} aria-hidden="true" />
                      <span>{equipmentQuickLabel(rental.equipment_type, rental.barcode_number, rental.serial_number)}</span>
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-600">Barcode #: {barcodeNumberLabel(rental.barcode_number)}</p>
                    {!rental.serial_number && <p className="mt-1 text-xs font-bold text-slate-600">Serial Number: Not entered</p>}
                    <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                      {vendor?.name ?? "Unknown company"}
                    </p>
                    <p className="mt-2 text-xs font-bold text-emerald-700">
                      {rental.current_location || "Unknown"} {" - "}
                      {`In hospital: ${rental.checked_in_at ? daysInHospitalLabel(rental.checked_in_at, departmentTimezone) : "Unknown"}`}
                    </p>
                    <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                      Status: {rentalStatusLabel(rental.status)}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedReturnRental && (
            <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">Selected rental</h2>
              <dl className="mt-3 grid gap-2 text-sm font-bold text-slate-700">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Equipment</dt>
                  <dd>{equipmentLabels[selectedReturnRental.equipment_type]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Equipment Type</dt>
                  <dd>{equipmentTypeCategoryLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Model</dt>
                  <dd>{equipmentModelLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Barcode #</dt>
                  <dd>{barcodeNumberLabel(selectedReturnRental.barcode_number)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Serial Number</dt>
                  <dd>{serialNumberLabel(selectedReturnRental.serial_number)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Company</dt>
                  <dd>{selectedVendor?.name ?? "Unknown company"}</dd>
                </div>
                {selectedVendor?.phone_number && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Vendor phone</dt>
                    <dd>
                      <a className="text-cyan-700 underline" href={`tel:${selectedVendor.phone_number.replace(/\D/g, "")}`}>
                        {selectedVendor.phone_number}
                      </a>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Last known location</dt>
                  <dd>{selectedReturnRental.current_location || "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Delivered</dt>
                  <dd>{selectedReturnRental.checked_in_at ? formatDateTime(selectedReturnRental.checked_in_at, departmentTimezone) : "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Delivered by</dt>
                  <dd>{selectedDeliveredBy?.display_name ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Days in hospital</dt>
                  <dd>{selectedReturnRental.checked_in_at ? daysInHospitalLabel(selectedReturnRental.checked_in_at, departmentTimezone) : "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Current status</dt>
                  <dd>{rentalStatusLabel(selectedReturnRental.status)}</dd>
                </div>
              </dl>

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => setReturnForm((current) => ({ ...current, action: "pickup", date: todayValue(), time: timeValue() }))}
                  className="min-h-11 rounded-2xl bg-amber-500 px-3 text-sm font-extrabold text-white shadow-md shadow-amber-900/20"
                >
                  Call for Pickup
                </button>
              </div>
            </section>
          )}

          {selectedReturnRental && returnForm.action === "pickup" && (
            <form onSubmit={submitPickupCall} className="rounded-3xl border border-amber-100 bg-amber-50/80 p-4 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">Call for Pickup</h2>
              <div className="mt-3 grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Date called</span>
                    <input
                      type="date"
                      value={returnForm.date}
                      onChange={(event) => setReturnForm((current) => ({ ...current, date: event.target.value }))}
                      className="mt-1 min-h-12 w-full rounded-2xl border border-amber-100 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-amber-300"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Time called</span>
                    <input
                      type="time"
                      value={returnForm.time}
                      onChange={(event) => setReturnForm((current) => ({ ...current, time: event.target.value }))}
                      className="mt-1 min-h-12 w-full rounded-2xl border border-amber-100 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-amber-300"
                    />
                  </label>
                </div>
                <p className="text-xs font-bold text-slate-600">Called by: {authContext.displayName}</p>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Pickup confirmation / reference</span>
                  <input
                    value={returnForm.confirmationNumber}
                    onChange={(event) => setReturnForm((current) => ({ ...current, confirmationNumber: event.target.value.slice(0, 80) }))}
                    maxLength={80}
                    placeholder="Optional"
                    className="mt-1 min-h-12 w-full rounded-2xl border border-amber-100 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-amber-300"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Note</span>
                  <textarea
                    value={returnForm.note}
                    onChange={(event) => setReturnForm((current) => ({ ...current, note: event.target.value.slice(0, 140) }))}
                    maxLength={140}
                    placeholder="Optional"
                    className="mt-1 min-h-20 w-full rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-amber-300"
                  />
                  <span className="mt-1 flex justify-between text-xs font-bold text-slate-500">
                    <span>No patient information.</span>
                    <span>{returnForm.note.length}/140</span>
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={saving || !canLogPickupCall}
                  className="min-h-11 rounded-2xl bg-amber-500 px-3 text-sm font-extrabold text-white shadow-md shadow-amber-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Log Pickup Call"}
                </button>
              </div>
            </form>
          )}

          {selectedReturnRental && returnForm.action === "picked_up" && (
            <form onSubmit={submitPickedUp} className="rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">Confirm Picked Up</h2>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">Confirm this rental has physically left the hospital.</p>
              <div className="mt-3 grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Date picked up</span>
                    <input
                      type="date"
                      value={returnForm.date}
                      onChange={(event) => setReturnForm((current) => ({ ...current, date: event.target.value }))}
                      className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Time picked up</span>
                    <input
                      type="time"
                      value={returnForm.time}
                      onChange={(event) => setReturnForm((current) => ({ ...current, time: event.target.value }))}
                      className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    />
                  </label>
                </div>
                <p className="text-xs font-bold text-slate-600">Picked up confirmed by: {authContext.displayName}</p>
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Note</span>
                  <textarea
                    value={returnForm.note}
                    onChange={(event) => setReturnForm((current) => ({ ...current, note: event.target.value.slice(0, 140) }))}
                    maxLength={140}
                    placeholder="Optional"
                    className="mt-1 min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                  <span className="mt-1 flex justify-between text-xs font-bold text-slate-500">
                    <span>No patient information.</span>
                    <span>{returnForm.note.length}/140</span>
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={saving || !canConfirmPickedUp}
                  className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white shadow-md shadow-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Confirm Picked Up"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    );
  }

  if (mode === "deliver") {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-xl space-y-4">
          <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Rental Management</p>
            <h1 className="mt-2 text-2xl font-black text-hospital-ink">Confirm Delivery</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Confirm this rental has physically arrived.
            </p>
            <Link
              href="/operations/rental-management"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
            >
              Back to Rental Management
            </Link>
          </section>

          {loading && (
            <p className="rounded-2xl border border-slate-100 bg-white px-3 py-2 text-sm font-bold text-slate-500">
              Loading pending delivery...
            </p>
          )}
          {!loading && !deliveryPendingRental && (
            <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
              <h2 className="text-lg font-black text-hospital-ink">Pending delivery not found.</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                It may have already been delivered or cancelled.
              </p>
            </section>
          )}
          {error && (
            <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          {deliveryPendingRental && (
            <form onSubmit={submitDelivery} className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
              <section className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">Pending Order</p>
                <dl className="mt-2 grid gap-1 text-sm font-bold text-slate-700">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Company</dt>
                    <dd>{firstRelated(deliveryPendingRental.rental_vendors)?.name ?? "Unknown company"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Equipment</dt>
                    <dd>{equipmentLabels[deliveryPendingRental.equipment_type]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Equipment Type</dt>
                    <dd>{equipmentTypeCategoryLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Model</dt>
                    <dd>{equipmentModelLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Called In</dt>
                    <dd>{deliveryPendingRental.called_in_at ? formatDateTime(deliveryPendingRental.called_in_at, departmentTimezone) : "Unknown"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Called In By</dt>
                    <dd>{firstRelated(deliveryPendingRental.called_in_by)?.display_name ?? deliveryPendingRental.called_in_by_name ?? "Unknown"}</dd>
                  </div>
                  {deliveryPendingRental.notes && (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">Order Note</dt>
                      <dd>{deliveryPendingRental.notes}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className="mt-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Scan Barcode</p>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                  Scan the 1D barcode or enter the barcode number manually.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void startScanner()}
                    className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white"
                  >
                    {scannerSuccess ? "Rescan" : "Scan Barcode"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopScanner();
                      setScannerStatus("");
                      setScannerError("");
                    }}
                    className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
                  >
                    Use Manual Entry
                  </button>
                </div>
                {scannerOpen && (
                  <div className="mt-3 rounded-2xl border border-cyan-100 bg-slate-950 p-2">
                    <video ref={videoRef} className="aspect-video w-full rounded-xl object-cover" muted playsInline />
                  </div>
                )}
                {scannerStatus && <p className="mt-2 text-xs font-bold text-cyan-700">{scannerStatus}</p>}
                {scannerSuccess && (
                  <p className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-700 shadow-[0_0_18px_rgba(16,185,129,0.22)]">
                    {scannerSuccess}
                  </p>
                )}
                {scannerError && <p className="mt-2 text-xs font-bold text-rose-700">{scannerError}</p>}
              </section>

              <section className="mt-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Delivery Details</p>
                <div className="mt-2 grid gap-3">
                  <label className="block">
                    <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                      Barcode #
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">Required</span>
                    </span>
                    <input
                      value={form.barcodeNumber}
                      onChange={(event) => {
                        setScannedByCamera(false);
                        setForm((current) => ({ ...current, barcodeNumber: event.target.value }));
                      }}
                      onBlur={() => void lookupKnownEquipment(form.barcodeNumber)}
                      placeholder="Scan or enter barcode number"
                      className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Serial Number (optional)</span>
                    <input
                      value={form.serialNumber}
                      onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))}
                      onBlur={() => void lookupKnownEquipment(form.serialNumber)}
                      placeholder="Example: MX70015814"
                      className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    />
                    <span className="mt-1 block text-xs font-bold text-slate-500">Optional if visible on equipment label.</span>
                  </label>
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Current Location</span>
                    <select
                      value={form.location}
                      onChange={(event) => setForm((current) => ({ ...current, location: event.target.value, otherLocation: "" }))}
                      className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    >
                      {locationOptions.map((location) => (
                        <option key={location} value={location}>
                          {location}
                        </option>
                      ))}
                    </select>
                  </label>
                  {form.location === "Other" && (
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Other Location</span>
                      <input
                        value={form.otherLocation}
                        onChange={(event) => setForm((current) => ({ ...current, otherLocation: event.target.value.slice(0, 80) }))}
                        maxLength={80}
                        placeholder="Enter location"
                        className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                      />
                    </label>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Delivered Date</span>
                      <input
                        type="date"
                        value={form.deliveredDate}
                        onChange={(event) => setForm((current) => ({ ...current, deliveredDate: event.target.value }))}
                        className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Delivered Time</span>
                      <input
                        type="time"
                        value={form.deliveredTime}
                        onChange={(event) => setForm((current) => ({ ...current, deliveredTime: event.target.value }))}
                        className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                      />
                    </label>
                  </div>
                  <p className="text-xs font-bold text-slate-500">Delivered By: {authContext.displayName}</p>
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value.slice(0, 140) }))}
                      maxLength={140}
                      placeholder="Optional"
                      className="mt-1 min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    />
                    <span className="mt-1 flex justify-between text-xs font-bold text-slate-400">
                      <span>No patient information.</span>
                      <span>{form.notes.length}/140</span>
                    </span>
                  </label>
                </div>
              </section>

              {duplicateRental && (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-900">
                  {(() => {
                    const vendor = firstRelated(duplicateRental.rental_vendors);
                    const deliveredBy = firstRelated(duplicateRental.checked_in_by);

                    return (
                      <>
                        <p className="font-black">This equipment is already in the hospital.</p>
                        <p className="mt-2">Company: {vendor?.name ?? "Unknown company"}</p>
                        <p>Equipment: {equipmentQuickLabel(duplicateRental.equipment_type, duplicateRental.barcode_number, duplicateRental.serial_number)}</p>
                        <p>Barcode #: {barcodeNumberLabel(duplicateRental.barcode_number)}</p>
                        <p>Serial Number: {serialNumberLabel(duplicateRental.serial_number)}</p>
                        <p>Location: {duplicateRental.current_location ?? "RT Equipment Room"}</p>
                        <p>Delivered: {duplicateRental.checked_in_at ? formatDateTime(duplicateRental.checked_in_at, departmentTimezone) : "Unknown"}</p>
                        <p>Delivered by: {deliveredBy?.display_name ?? "Unknown"}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => router.push("/operations/rental-management/active")}
                            className="min-h-10 rounded-xl bg-rose-700 px-3 text-xs font-extrabold text-white"
                          >
                            View Active Rental
                          </button>
                          <button
                            type="button"
                            onClick={() => setDuplicateRental(null)}
                            className="min-h-10 rounded-xl border border-rose-200 bg-white px-3 text-xs font-extrabold text-rose-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              <section className="mt-4 rounded-3xl border border-violet-200 bg-violet-50/80 p-4 shadow-[0_0_0_1px_rgba(124,58,237,0.08),0_0_22px_rgba(139,92,246,0.18),0_14px_28px_rgba(15,23,42,0.10)]">
                <p className="text-xs font-extrabold uppercase tracking-wide text-violet-700">Confirm</p>
                <h3 className="mt-1 text-lg font-black text-hospital-ink">Confirm Delivery</h3>
                <dl className="mt-3 grid gap-2 text-sm font-bold text-slate-700">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Barcode #</dt>
                    <dd>{form.barcodeNumber || "Required"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Serial Number</dt>
                    <dd>{serialNumberLabel(form.serialNumber)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Delivered</dt>
                    <dd>{form.deliveredDate} {form.deliveredTime} by {authContext.displayName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Current Location</dt>
                    <dd>{currentLocation || "Required"}</dd>
                  </div>
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      stopScanner();
                      router.push("/operations/rental-management");
                    }}
                    className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !canConfirmDelivery}
                    className="min-h-11 rounded-2xl bg-violet-700 px-3 text-sm font-extrabold text-white shadow-md shadow-violet-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Confirm Delivery"}
                  </button>
                </div>
              </section>
            </form>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Department Operations</p>
          <h1 className="mt-2 text-2xl font-black text-hospital-ink">Order Rental</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Log a BiPAP V60 rental order.
          </p>
          <Link
            href="/operations/rental-management"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
          >
            Back to Rental Management
          </Link>
        </section>

        {error && (
          <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}
        <form onSubmit={submitCheckIn} className="space-y-4">
          <section className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-[0_0_0_1px_rgba(14,165,233,0.08),0_16px_34px_rgba(15,23,42,0.10)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Order Details</p>
                <h2 className="mt-1 text-xl font-black text-hospital-ink">Required to continue</h2>
              </div>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-rose-700">
                Required
              </span>
            </div>

            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Rental Company
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">Required</span>
                </span>
                <select
                  value={form.vendorId}
                  onChange={(event) => setForm((current) => ({ ...current, vendorId: event.target.value }))}
                  className="mt-1 min-h-12 w-full rounded-2xl border border-cyan-200 bg-white px-3 text-sm font-bold text-hospital-ink shadow-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                >
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>

              {selectedVendor && (
                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/90 px-3 py-3 text-sm font-bold text-cyan-950">
                  <p className="font-black">{selectedVendor.name}</p>
                  {selectedVendor.notes && <p className="mt-1 text-xs leading-5 text-cyan-800">{selectedVendor.notes}</p>}
                  {selectedVendor.phone_number ? (
                    <a
                      href={`tel:${selectedVendor.phone_number.replace(/[^\d+]/g, "")}`}
                      className="mt-1 inline-flex text-xs font-black text-cyan-700 underline decoration-cyan-300 underline-offset-4"
                    >
                      {selectedVendor.phone_number}
                    </a>
                  ) : (
                    <p className="mt-1 text-xs text-cyan-800">No phone listed.</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-cyan-700">Equipment Type</p>
                  <p className="mt-1 text-sm font-black text-hospital-ink">{equipmentTypeCategoryLabel}</p>
                </div>
                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-cyan-700">Model</p>
                  <p className="mt-1 text-sm font-black text-hospital-ink">{equipmentModelLabel}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-600">
                <p>
                  <span className="text-slate-400">Called in:</span> {formatDateInput(form.calledInDate)} {form.calledInTime}
                </p>
                <p className="mt-1">
                  <span className="text-slate-400">Called by:</span> {authContext.displayName}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCalledInDateDraft(form.calledInDate);
                    setCalledInTimeDraft(form.calledInTime);
                    setEditingCalledInDetails(true);
                  }}
                  className="mt-2 text-xs font-black text-cyan-700 underline decoration-cyan-200 underline-offset-4"
                >
                  Edit called-in details
                </button>
                {editingCalledInDetails && (
                  <div className="mt-3 rounded-2xl border border-cyan-100 bg-white px-3 py-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Called In Date</span>
                        <input
                          type="date"
                          value={calledInDateDraft}
                          onChange={(event) => setCalledInDateDraft(event.target.value)}
                          className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Called In Time</span>
                        <input
                          type="time"
                          value={calledInTimeDraft}
                          onChange={(event) => setCalledInTimeDraft(event.target.value)}
                          className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                        />
                      </label>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCalledInDetails(false);
                          setCalledInDateDraft("");
                          setCalledInTimeDraft("");
                        }}
                        className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((current) => ({
                            ...current,
                            calledInDate: calledInDateDraft,
                            calledInTime: calledInTimeDraft
                          }));
                          setEditingCalledInDetails(false);
                        }}
                        className="min-h-10 rounded-xl bg-cyan-700 px-3 text-xs font-extrabold text-white"
                      >
                        Save Details
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={`rounded-3xl border p-4 shadow-[0_0_0_1px_rgba(14,165,233,0.08),0_0_20px_rgba(14,165,233,0.14),0_12px_24px_rgba(15,23,42,0.08)] ${canLogOrder ? "border-sky-200 bg-sky-50/80" : "border-amber-100 bg-amber-50/80"}`}>
            <p className={`text-xs font-extrabold uppercase tracking-wide ${canLogOrder ? "text-sky-700" : "text-amber-700"}`}>Review & Save</p>
            <h3 className="mt-1 text-lg font-black text-hospital-ink">{canLogOrder ? "Review & Save" : "Complete required fields"}</h3>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-600">
              {canLogOrder ? "Confirm this rental order before saving." : "Finish the required order details before saving."}
            </p>

            {!canLogOrder ? (
              <ul className="mt-3 grid gap-2 text-sm font-black text-amber-800">
                {missingCheckInFields.map((field) => (
                  <li key={field} className="rounded-2xl border border-amber-100 bg-white px-3 py-2">
                    {field}
                  </li>
                ))}
              </ul>
            ) : (
              <dl className="mt-3 grid gap-2 text-sm font-bold text-slate-700">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Company</dt>
                  <dd>{selectedVendor?.name}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Equipment</dt>
                  <dd>{equipmentLabels[form.equipmentType as EquipmentType]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Called In</dt>
                  <dd>{formatDateInput(form.calledInDate)} {form.calledInTime} by {authContext.displayName}</dd>
                </div>
                {form.notes.trim() && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Note</dt>
                    <dd>{form.notes.trim()}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Status</dt>
                  <dd>
                    <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-sky-700">
                      Pending Delivery
                    </span>
                  </dd>
                </div>
              </dl>
            )}

            {noteEditorOpen && (
              <div className="mt-4 rounded-2xl border border-slate-100 bg-white px-3 py-3">
                <label className="block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Note</span>
                  <textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value.slice(0, 140))}
                    maxLength={140}
                    placeholder="Add optional note..."
                    className="mt-1 min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  />
                  <span className="mt-1 flex justify-between gap-3 text-xs font-bold text-slate-500">
                    <span>No patient information.</span>
                    <span>{noteDraft.length}/140</span>
                  </span>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNoteEditorOpen(false);
                      setNoteDraft(form.notes);
                    }}
                    className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((current) => ({ ...current, notes: noteDraft.trim() }));
                      setNoteEditorOpen(false);
                    }}
                    className="min-h-10 rounded-xl bg-cyan-700 px-3 text-xs font-extrabold text-white"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-2">
              <button
                type="submit"
                disabled={saving || !canLogOrder}
                className="min-h-12 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white shadow-md shadow-cyan-900/20 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                {saving ? "Saving..." : "Save Pending Delivery"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNoteDraft(form.notes);
                  setNoteEditorOpen(true);
                }}
                className="min-h-12 rounded-2xl border border-cyan-100 bg-white px-3 text-sm font-extrabold text-cyan-700 shadow-sm"
              >
                {form.notes.trim() ? "Edit Note" : "Add Note"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/operations/rental-management")}
                className="min-h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600 shadow-sm"
              >
                Cancel
              </button>
            </div>
            {!canLogOrder && (
              <p className="mt-2 text-xs font-bold text-amber-800">
                Complete required details to continue.
              </p>
            )}
          </section>
        </form>
      </div>
    </main>
  );
}
