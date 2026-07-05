"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { ClipboardCheck, DoorOpen, RotateCcw, ScanLine } from "lucide-react";
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
  notes: string;
};

type RentalManagementClientProps = {
  authContext: AuthenticatedUserContext;
};

const equipmentLabels: Record<EquipmentType, string> = {
  bipap: "BiPAP",
  v60: "V60"
};

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

function defaultForm(vendorId = ""): RentalCheckInForm {
  return {
    vendorId,
    equipmentType: "",
    date: todayValue(),
    time: timeValue(),
    serialNumber: "",
    notes: ""
  };
}

const futureFeatures = [
  { title: "Active Rentals", icon: ClipboardCheck },
  { title: "Transfer Room", icon: DoorOpen },
  { title: "Return Equipment", icon: RotateCcw }
];

export function RentalManagementClient({ authContext }: RentalManagementClientProps) {
  const [vendors, setVendors] = useState<RentalVendor[]>([]);
  const [activeRentals, setActiveRentals] = useState<ActiveRentalRecord[]>([]);
  const [form, setForm] = useState<RentalCheckInForm>(() => defaultForm());
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("");
  const [scannerError, setScannerError] = useState("");
  const [scannedByCamera, setScannedByCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const selectedVendor = vendors.find((vendor) => vendor.id === form.vendorId) ?? null;

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
        .select("id, vendor_id, equipment_type, serial_number, checked_in_at, notes, rental_vendors(name), staff_profiles(display_name)")
        .eq("department_id", authContext.departmentId)
        .eq("status", "active")
        .order("checked_in_at", { ascending: false })
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
    setScannerStatus("Starting camera...");
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
            setScannerStatus(`Scanned: ${scannedValue}`);
            callbackControls.stop();
            scannerControlsRef.current = null;
            setScannerOpen(false);
          } else if (scanError) {
            setScannerStatus("Point the camera at the 1D barcode.");
          }
        });
        scannerControlsRef.current = controls;
        setScannerStatus("Point the camera at the 1D barcode.");
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
        equipmentType: (data.equipment_type as EquipmentType | null) ?? current.equipmentType
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
      setError("Company, equipment type, date/time, and serial number are required.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const vendor = vendors.find((candidate) => candidate.id === form.vendorId);
    const serialNumber = form.serialNumber.trim();
    const checkedInAt = new Date(`${form.date}T${form.time}:00`).toISOString();
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
        notes: form.notes.trim() || null
      })
      .select("id")
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
          vendor_name: vendor?.name ?? null
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
          source: scannedByCamera ? "barcode" : "manual"
        }
      }
    ]);

    setSaving(false);
    setSuccess("Rental checked in.");
    setCheckInOpen(false);
    setScannerOpen(false);
    setScannedByCamera(false);
    setForm(defaultForm(vendors[0]?.id ?? ""));
    await loadRentalData();
  };

  const canConfirm = Boolean(form.vendorId && form.equipmentType && form.serialNumber.trim() && form.date && form.time);

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
            Check in rented BiPAP and V60 equipment as it arrives.
          </p>
        </section>

        {error && (
          <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
            {success}
          </p>
        )}

        <section className="grid gap-3">
          <button
            type="button"
            onClick={() => {
              setCheckInOpen((current) => !current);
              setSuccess("");
              setError("");
            }}
            className="rounded-3xl border border-cyan-100 bg-white/95 p-4 text-left shadow-soft transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <ScanLine size={20} />
              </span>
              <div>
                <h2 className="text-base font-black text-hospital-ink">Rental Check In</h2>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-emerald-700">Active</p>
              </div>
            </div>
          </button>

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

        {checkInOpen && (
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
                    Scan Barcode
                  </button>
                  <button
                    type="button"
                    onClick={stopScanner}
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
                {scannerError && <p className="mt-2 text-xs font-bold text-rose-700">{scannerError}</p>}
              </section>

              <section>
                <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Step 3: Equipment Details</p>
                <div className="mt-2 grid gap-3">
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Equipment Type</span>
                    <select
                      value={form.equipmentType}
                      onChange={(event) => setForm((current) => ({ ...current, equipmentType: event.target.value as EquipmentType }))}
                      className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                    >
                      <option value="">Select equipment</option>
                      <option value="bipap">BiPAP</option>
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
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Equipment Type</dt>
                    <dd>{form.equipmentType ? equipmentLabels[form.equipmentType] : "Select equipment"}</dd>
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
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Checked in by</dt>
                    <dd>{authContext.displayName}</dd>
                  </div>
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      stopScanner();
                      setCheckInOpen(false);
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
        )}

        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <h2 className="text-lg font-black text-hospital-ink">Active Rentals</h2>
          {loading && <p className="mt-2 text-sm font-bold text-slate-500">Loading rentals...</p>}
          {!loading && activeRentals.length === 0 && (
            <p className="mt-2 text-sm font-bold text-slate-500">No active rentals checked in yet.</p>
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
                      <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                        {vendor?.name ?? "Unknown company"}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                      Active
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-700">Serial: {rental.serial_number}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Checked in {formatDateTime(rental.checked_in_at)} by {staff?.display_name ?? "Unknown"}
                  </p>
                </article>
              );
            })}
          </div>
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
