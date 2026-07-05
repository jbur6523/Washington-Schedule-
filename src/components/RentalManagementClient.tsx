"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { DoorOpen, RotateCcw, ScanLine } from "lucide-react";
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

type ActiveRentalRecord = {
  id: string;
  vendor_id: string;
  equipment_type: EquipmentType;
  serial_number: string;
  current_location: string | null;
  checked_in_at: string;
  notes: string | null;
  rental_vendors: { name: string } | { name: string }[] | null;
  staff_profiles: { display_name: string } | { display_name: string }[] | null;
};

type RentalCheckInForm = {
  vendorId: string;
  equipmentType: EquipmentType | "";
  date: string;
  time: string;
  serialNumber: string;
  location: string;
  otherLocation: string;
  notes: string;
};

type RentalManagementClientProps = {
  authContext: AuthenticatedUserContext;
  mode?: "overview" | "check-in";
};

const equipmentLabels: Record<EquipmentType, string> = {
  bipap: "BiPAP / V60",
  v60: "BiPAP / V60"
};

const locationOptions = ["RT Equipment Room", "ED", "ICU", "2nd Floor", "3rd Floor", "Other"];

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function timeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function daysActive(value: string) {
  const start = new Date(value).getTime();
  const diff = Date.now() - start;

  return Math.max(0, Math.floor(diff / 86_400_000));
}

function defaultForm(vendorId = ""): RentalCheckInForm {
  return {
    vendorId,
    equipmentType: "",
    date: todayValue(),
    time: timeValue(),
    serialNumber: "",
    location: "RT Equipment Room",
    otherLocation: "",
    notes: ""
  };
}

const futureFeatures = [
  { title: "Transfer Room", icon: DoorOpen },
  { title: "Return Equipment", icon: RotateCcw }
];

export function RentalManagementClient({ authContext, mode = "overview" }: RentalManagementClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vendors, setVendors] = useState<RentalVendor[]>([]);
  const [activeRentals, setActiveRentals] = useState<ActiveRentalRecord[]>([]);
  const [form, setForm] = useState<RentalCheckInForm>(() => defaultForm());
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
  const activeRentalsRef = useRef<HTMLElement>(null);

  const selectedVendor = vendors.find((vendor) => vendor.id === form.vendorId) ?? null;
  const currentLocation = form.location === "Other" ? form.otherLocation.trim() : form.location;

  const loadRentalData = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const [{ data: vendorData, error: vendorError }, { data: rentalData, error: rentalError }] = await Promise.all([
      supabase
        .from("rental_vendors")
        .select("id, name, phone_number, notes, sort_order")
        .eq("department_id", authContext.departmentId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("rental_records")
        .select("id, vendor_id, equipment_type, serial_number, current_location, checked_in_at, notes, rental_vendors(name), staff_profiles(display_name)")
        .eq("department_id", authContext.departmentId)
        .eq("status", "active")
        .order("checked_in_at", { ascending: true })
    ]);

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
      setActiveRentals((rentalData ?? []) as unknown as ActiveRentalRecord[]);
    }

    setLoading(false);
  }, [authContext.departmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRentalData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRentalData]);

  const stopScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setScannerOpen(false);
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);

  const startScanner = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError("Camera scanning is not supported on this device. Enter the serial number manually.");
      return;
    }

    setScannerError("");
    setScannerSuccess("");
    setScannerStatus("Requesting camera permission...");
    setScannerOpen(true);

    window.setTimeout(async () => {
      if (!videoRef.current) {
        setScannerError("Scanner preview could not start. Enter the serial number manually.");
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
            setForm((current) => ({ ...current, serialNumber: scannedValue }));
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
        setScannerError("Camera permission was denied or scanning could not start. Enter the serial number manually.");
        setScannerStatus("");
        setScannerOpen(false);
      }
    }, 0);
  };

  const lookupKnownEquipment = async (serialNumber: string) => {
    const trimmed = serialNumber.trim();

    if (!trimmed) {
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("rental_equipment")
      .select("vendor_id, equipment_type")
      .eq("department_id", authContext.departmentId)
      .eq("serial_number", trimmed)
      .maybeSingle();

    if (data) {
      setForm((current) => ({
        ...current,
        vendorId: (data.vendor_id as string | null) ?? current.vendorId,
        equipmentType: data.equipment_type ? "v60" : current.equipmentType
      }));
    }
  };

  const submitCheckIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authContext.staffProfileId) {
      setError("Your staff profile must be linked before checking in rental equipment.");
      return;
    }

    if (!form.vendorId || !form.equipmentType || !form.serialNumber.trim() || !form.date || !form.time) {
      setError("Company, BiPAP type, date/time, and serial number are required.");
      return;
    }

    setSaving(true);
    setError("");
    setDuplicateRental(null);

    const supabase = createClient();
    const vendor = vendors.find((candidate) => candidate.id === form.vendorId);
    const serialNumber = form.serialNumber.trim();
    const location = currentLocation || "RT Equipment Room";
    const checkedInAt = new Date(`${form.date}T${form.time}:00`).toISOString();
    const { data: existingRental, error: existingRentalError } = await supabase
      .from("rental_records")
      .select("id, vendor_id, equipment_type, serial_number, current_location, checked_in_at, notes, rental_vendors(name), staff_profiles(display_name)")
      .eq("department_id", authContext.departmentId)
      .eq("status", "active")
      .eq("serial_number", serialNumber)
      .maybeSingle();

    if (existingRentalError) {
      setSaving(false);
      setError("Unable to check existing active rentals.");
      return;
    }

    if (existingRental) {
      setSaving(false);
      setDuplicateRental(existingRental as unknown as ActiveRentalRecord);
      return;
    }

    const { data: equipment, error: equipmentError } = await supabase
      .from("rental_equipment")
      .upsert(
        {
          department_id: authContext.departmentId,
          vendor_id: form.vendorId,
          equipment_type: form.equipmentType,
          serial_number: serialNumber,
          last_known_company: vendor?.name ?? null,
          is_active: true
        },
        { onConflict: "department_id,serial_number" }
      )
      .select("id")
      .single();

    if (equipmentError || !equipment?.id) {
      setSaving(false);
      setError("Unable to save rental equipment.");
      return;
    }

    const { data: record, error: recordError } = await supabase
      .from("rental_records")
      .insert({
        department_id: authContext.departmentId,
        equipment_id: equipment.id,
        vendor_id: form.vendorId,
        equipment_type: form.equipmentType,
        serial_number: serialNumber,
        status: "active",
        checked_in_at: checkedInAt,
        checked_in_by_staff_profile_id: authContext.staffProfileId,
        current_location: location,
        notes: form.notes.trim() || null
      })
      .select("id, vendor_id, equipment_type, serial_number, current_location, checked_in_at, notes, rental_vendors(name), staff_profiles(display_name)")
      .single();

    if (recordError || !record?.id) {
      setSaving(false);
      setError("Unable to save rental check in.");
      return;
    }

    const eventType = scannedByCamera ? "barcode_scanned" : "manual_check_in";
    await supabase.from("rental_events").insert([
      {
        department_id: authContext.departmentId,
        rental_record_id: record.id,
        equipment_id: equipment.id,
        event_type: eventType,
        event_at: checkedInAt,
        actor_staff_profile_id: authContext.staffProfileId,
        event_data: {
          serial_number: serialNumber,
          equipment_type: form.equipmentType,
          vendor_id: form.vendorId,
          vendor_name: vendor?.name ?? null,
          current_location: location,
          timestamp: checkedInAt
        }
      },
      {
        department_id: authContext.departmentId,
        rental_record_id: record.id,
        equipment_id: equipment.id,
        event_type: "checked_in",
        event_at: checkedInAt,
        actor_staff_profile_id: authContext.staffProfileId,
        event_data: {
          source: scannedByCamera ? "barcode" : "manual",
          serial_number: serialNumber,
          equipment_type: form.equipmentType,
          vendor_id: form.vendorId,
          vendor_name: vendor?.name ?? null,
          current_location: location,
          timestamp: checkedInAt
        }
      }
    ]);

    setSaving(false);
    setScannerOpen(false);
    setScannerSuccess("");
    setScannedByCamera(false);
    setForm(defaultForm(vendors[0]?.id ?? ""));
    await loadRentalData();
    router.push("/operations/rental-management?checkedIn=1");
  };

  const canConfirm = Boolean(form.vendorId && form.equipmentType && form.serialNumber.trim() && form.date && form.time && currentLocation);
  const checkedIn = searchParams.get("checkedIn") === "1";

  if (mode === "overview") {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-xl space-y-4">
          <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Department Operations</p>
            <h1 className="mt-2 text-2xl font-black text-hospital-ink">Rental Management</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              BiPAP and ventilator rental tracking
            </p>
            <p className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-3 text-sm font-bold leading-6 text-cyan-900">
              Check in rented BiPAP/V60 equipment as it arrives.
            </p>
          </section>

          {checkedIn && (
            <p role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              Rental checked in.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          <Link
            href="/operations/rental-management/check-in"
            className="block rounded-3xl border border-cyan-100 bg-white/95 p-4 text-left shadow-soft transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <ScanLine size={20} />
              </span>
              <div>
                <h2 className="text-base font-black text-hospital-ink">Rental Check In</h2>
                <p className="mt-1 text-sm font-bold leading-5 text-slate-500">Check in rented BiPAP/V60 equipment.</p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-emerald-700">Active</p>
              </div>
            </div>
          </Link>

          <section ref={activeRentalsRef} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Active Rentals</h2>
            {loading && <p className="mt-2 text-sm font-bold text-slate-500">Loading rentals...</p>}
            {!loading && activeRentals.length === 0 && (
              <p className="mt-2 text-sm font-bold text-slate-500">No active rentals.</p>
            )}
            <div className="mt-3 grid gap-2">
              {activeRentals.map((rental) => {
                const vendor = firstRelated(rental.rental_vendors);
                const staff = firstRelated(rental.staff_profiles);

                return (
                  <article key={rental.id} className="rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-hospital-ink">{equipmentLabels[rental.equipment_type]}</p>
                        <p className="mt-1 text-sm font-bold text-slate-700">Asset ID: {rental.serial_number}</p>
                        <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">{vendor?.name ?? "Unknown company"}</p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                        Active
                      </span>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs font-bold text-slate-500">
                      <p>Location: {rental.current_location ?? "RT Equipment Room"}</p>
                      <p>Checked in: {formatDateTime(rental.checked_in_at)}</p>
                      <p>Checked in by: {staff?.display_name ?? "Unknown"}</p>
                      <p>Active: {daysActive(rental.checked_in_at)} days</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-3">
            {futureFeatures.map((feature) => {
              const Icon = feature.icon;

              return (
                <div key={feature.title} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
                      <Icon size={20} />
                    </span>
                    <div>
                      <h2 className="text-base font-black text-hospital-ink">{feature.title}</h2>
                      <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-violet-700">Coming Soon</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <Link
            href="/operations"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Department Operations</p>
          <h1 className="mt-2 text-2xl font-black text-hospital-ink">Rental Check In</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Check in rented BiPAP/V60 equipment as it arrives.
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
        <form onSubmit={submitCheckIn} className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
            <h2 className="text-xl font-black text-hospital-ink">Rental Check In</h2>

            <div className="mt-4 space-y-4">
              <section>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Step 1: Company</p>
                <label className="mt-2 block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Rental Company</span>
                  <select
                    value={form.vendorId}
                    onChange={(event) => setForm((current) => ({ ...current, vendorId: event.target.value }))}
                    className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                  >
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedVendor && (
                  <p className="mt-2 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-bold leading-5 text-cyan-900">
                    {selectedVendor.notes ? `${selectedVendor.notes}. ` : ""}
                    {selectedVendor.phone_number ? `Phone: ${selectedVendor.phone_number}` : "No phone listed."}
                  </p>
                )}
              </section>

              <section>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Step 2: Scan Barcode</p>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                  Scan the 1D barcode or enter the printed equipment number manually.
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

              <section>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Step 3: Equipment Details</p>
                <div className="mt-2 grid gap-3">
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">BiPAP Type</span>
                    <select
                      value={form.equipmentType}
                      onChange={(event) => setForm((current) => ({ ...current, equipmentType: event.target.value as EquipmentType }))}
                      className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    >
                      <option value="">Select BiPAP type</option>
                      <option value="v60">V60</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Date</span>
                      <input
                        type="date"
                        value={form.date}
                        onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                        className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Time</span>
                      <input
                        type="time"
                        value={form.time}
                        onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
                        className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Serial Number / Asset ID</span>
                    <input
                      value={form.serialNumber}
                      onChange={(event) => {
                        setScannedByCamera(false);
                        setForm((current) => ({ ...current, serialNumber: event.target.value }));
                      }}
                      onBlur={() => void lookupKnownEquipment(form.serialNumber)}
                      className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    />
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

              <section className="rounded-3xl border border-violet-200 bg-violet-50/80 p-4 shadow-[0_0_0_1px_rgba(124,58,237,0.08),0_0_22px_rgba(139,92,246,0.18),0_14px_28px_rgba(15,23,42,0.10)]">
                <p className="text-xs font-extrabold uppercase tracking-wide text-violet-700">Step 4: Confirm</p>
                <h3 className="mt-1 text-lg font-black text-hospital-ink">Rental Check In</h3>
                <dl className="mt-3 grid gap-2 text-sm font-bold text-slate-700">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Company</dt>
                    <dd>{selectedVendor?.name ?? "Select company"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">BiPAP Type</dt>
                    <dd>{form.equipmentType ? equipmentLabels[form.equipmentType] : "Select BiPAP type"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Serial Number / Asset ID</dt>
                    <dd>{form.serialNumber || "Required"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Date/Time</dt>
                    <dd>{form.date} {form.time}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Current Location</dt>
                    <dd>{currentLocation || "Required"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Checked in by</dt>
                    <dd>{authContext.displayName}</dd>
                  </div>
                </dl>
                {duplicateRental && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-900">
                    {(() => {
                      const vendor = firstRelated(duplicateRental.rental_vendors);
                      const staff = firstRelated(duplicateRental.staff_profiles);

                      return (
                        <>
                          <p className="font-black">This equipment is already checked in.</p>
                          <p className="mt-2">Company: {vendor?.name ?? "Unknown company"}</p>
                          <p>Equipment: {equipmentLabels[duplicateRental.equipment_type]}</p>
                          <p>Serial / Asset ID: {duplicateRental.serial_number}</p>
                          <p>Location: {duplicateRental.current_location ?? "RT Equipment Room"}</p>
                          <p>Checked in: {formatDateTime(duplicateRental.checked_in_at)}</p>
                          <p>Checked in by: {staff?.display_name ?? "Unknown"}</p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                router.push("/operations/rental-management");
                              }}
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
                    disabled={saving || !canConfirm}
                    className="min-h-11 rounded-2xl bg-violet-700 px-3 text-sm font-extrabold text-white shadow-md shadow-violet-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Confirm Check In"}
                  </button>
                </div>
              </section>
            </div>
          </form>
      </div>
    </main>
  );
}
