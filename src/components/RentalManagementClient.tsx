"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { hasRentalManagementAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/client";
import {
  displayTimestamp,
  eventTimestamp,
  localFields,
  rentalState,
  stageColumns,
  stageLabels,
  stages,
  type Attribution,
  type EventInput,
  type Stage,
} from "@/lib/rental-management/lifecycle";
import { RentalBarcodeScanner } from "@/components/RentalBarcodeScanner";

type Staff = {
  id: string;
  display_name: string;
  assigned_role: string;
  operations_role: string;
  home_assignment: string;
};
type Vendor = {
  id: string;
  name: string;
  phone_number: string | null;
  notes: string | null;
  is_active: boolean;
};
type Related = { display_name: string } | { display_name: string }[] | null;
type Rental = {
  id: string;
  vendor_id: string;
  status: string;
  serial_number: string | null;
  barcode_number: string | null;
  called_in_at: string | null;
  checked_in_at: string | null;
  pickup_requested_at: string | null;
  returned_at: string | null;
  called_in_by_name: string | null;
  updated_at: string;
  attribution: Partial<Record<Stage, Attribution>>;
  current_location?: string | null;
  notes?: string | null;
  pickup_request_note?: string | null;
  return_note?: string | null;
  cancellation_note?: string | null;
  called_in_by: Related;
  checked_in_by: Related;
  pickup_requested_by: Related;
  returned_by: Related;
};
type Audit = {
  id: string;
  rental_record_id: string;
  event_type: string;
  event_at: string;
  created_at: string;
  authenticated_user_id: string | null;
  staff_profiles: Related;
  event_data: Record<string, unknown>;
};
type Action =
  Stage | "return_update" | "edit" | "cancel_delivery" | "cancel_pickup";
type Editor = {
  record: Rental | null;
  action: Action;
  vendor: string;
  quantity: string;
  serial: string;
  barcode: string;
  scanned: boolean;
  requestId: string;
  events: Partial<Record<Stage, EventInput>>;
  originalEvents: Partial<Record<Stage, EventInput>>;
};
type Props = {
  authContext: AuthenticatedUserContext;
  mode?: "overview" | "check-in" | "active" | "history" | "deliver" | "return";
  pendingRentalId?: string;
};
const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-hospital-ink focus:border-cyan-500";
const buttonClass =
  "min-h-11 rounded-lg bg-cyan-700 px-3 text-sm font-bold text-white disabled:opacity-50";
const relatedName = (value: Related) =>
  (Array.isArray(value) ? value[0]?.display_name : value?.display_name) ?? "";
function personFor(record: Rental, stage: Stage): Attribution {
  return (
    record.attribution?.[stage] ?? {
      staff_profile_id: null,
      name:
        stage === "order"
          ? record.called_in_by_name || relatedName(record.called_in_by)
          : relatedName(
              record[
                stage === "delivery"
                  ? "checked_in_by"
                  : stage === "pickup"
                    ? "pickup_requested_by"
                    : "returned_by"
              ],
            ),
    }
  );
}
function atFor(record: Rental, stage: Stage) {
  return record[
    stageColumns[stage] as
      "called_in_at" | "checked_in_at" | "pickup_requested_at" | "returned_at"
  ];
}

export function RentalEventFields({
  label,
  value,
  staff,
  onChange,
  dateFirst = false,
  children,
}: {
  dateFirst?: boolean;
  children?: ReactNode;
  label: string;
  value: EventInput;
  staff: Staff[];
  onChange: (value: EventInput) => void;
}) {
  const nameField = (
    <div>
      <label className="block text-xs font-bold">
        {label}
        <select
          className={inputClass}
          value={value.staffId}
          onChange={(e) =>
            onChange({
              ...value,
              staffId: e.target.value,
              name:
                e.target.value === "manual"
                  ? ""
                  : (staff.find((s) => s.id === e.target.value)?.display_name ??
                    ""),
            })
          }
        >
          <option value="">Select name</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name}
            </option>
          ))}
          <option value="manual">Insert Name</option>
        </select>
      </label>
      {value.staffId === "manual" && (
        <label className="mt-2 block text-xs font-bold">
          {label === "Name" ? "Enter name" : "Name"}
          <input
            autoFocus
            type="text"
            className={inputClass}
            maxLength={120}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </label>
      )}
    </div>
  );
  const dateFields = (
    <div className="col-span-1 grid grid-cols-2 gap-2 sm:col-span-2">
      <label className="text-xs font-bold">
        Date
        <input
          type="text"
          placeholder="MM/DD/YYYY"
          className={inputClass}
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      </label>
      <label className="text-xs font-bold">
        Time
        <input
          type="text"
          placeholder="HH:mm"
          className={inputClass}
          value={value.time}
          onChange={(e) => onChange({ ...value, time: e.target.value })}
        />
      </label>
    </div>
  );
  return (
    <div
      className={
        dateFirst
          ? "flex flex-col gap-2"
          : "grid gap-2 sm:grid-cols-[2fr_1fr_1fr]"
      }
    >
      {dateFirst ? (
        <>
          {dateFields}
          {children}
          {nameField}
        </>
      ) : (
        <>
          {nameField}
          {dateFields}
          {children}
        </>
      )}
    </div>
  );
}

function RentalPopup({
  title,
  children,
  onClose,
  saving,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  saving: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-lg overflow-y-auto rounded-xl border border-cyan-200 bg-sky-50 p-4 text-hospital-ink shadow-xl backdrop:bg-slate-900/50"
    >
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </dialog>
  );
}

export function RentalManagementClient({
  authContext,
  mode = "overview",
}: Props) {
  const [records, setRecords] = useState<Rental[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(mode === "history");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState("");
  const [audit, setAudit] = useState<Audit[]>([]);
  const [auditError, setAuditError] = useState("");
  const [scanner, setScanner] = useState(false);
  const [lookup, setLookup] = useState("");
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupScanner, setLookupScanner] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const permitted = hasRentalManagementAccess(authContext);

  const load = useCallback(async () => {
    if (!permitted) {
      setLoading(false);
      return;
    }
    const db = createClient();
    // Page through records so older rentals are not lost at the API row limit.
    const rentalPromise = (async () => {
      const all: Rental[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await db
          .from("rental_records")
          .select(
            "*, called_in_by:staff_profiles!rental_records_called_in_by_staff_profile_id_fkey(display_name), checked_in_by:staff_profiles!rental_records_checked_in_by_staff_profile_id_fkey(display_name), pickup_requested_by:staff_profiles!rental_records_pickup_requested_by_staff_profile_id_fkey(display_name), returned_by:staff_profiles!rental_records_returned_by_staff_profile_id_fkey(display_name)",
          )
          .eq("department_id", authContext.departmentId)
          .order("created_at")
          .order("id")
          .range(offset, offset + 499);
        if (result.error) throw result.error;
        all.push(...(result.data as Rental[]));
        if (result.data.length < 500) return all;
      }
    })();
    try {
      const [rentals, vendorResult, staffResult, departmentResult] =
        await Promise.all([
          rentalPromise,
          db
            .from("rental_vendors")
            .select("id,name,phone_number,notes,is_active")
            .eq("department_id", authContext.departmentId)
            .order("sort_order"),
          db
            .from("staff_profiles")
            .select(
              "id,display_name,assigned_role,operations_role,home_assignment",
            )
            .eq("department_id", authContext.departmentId)
            .eq("is_active", true)
            .or(
              "assigned_role.eq.lead,operations_role.eq.aide,home_assignment.eq.rt_aide",
            )
            .order("display_name"),
          db
            .from("departments")
            .select("timezone")
            .eq("id", authContext.departmentId)
            .single(),
        ]);
      if (vendorResult.error || staffResult.error || departmentResult.error)
        throw vendorResult.error || staffResult.error || departmentResult.error;
      setRecords(rentals);
      setVendors(vendorResult.data ?? []);
      setStaff(staffResult.data ?? []);
      setTimezone(departmentResult.data?.timezone || "America/Los_Angeles");
      setError("");
    } catch {
      setError("Unable to load rentals. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [authContext.departmentId, permitted]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!detailId) return;
    let cancelled = false;
    setAudit([]);
    setAuditError("");
    void (async () => {
      try {
        const all: Audit[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await createClient()
            .from("rental_events")
            .select("*,staff_profiles(display_name)")
            .eq("department_id", authContext.departmentId)
            .eq("rental_record_id", detailId)
            .order("created_at")
            .order("id")
            .range(offset, offset + 499);
          if (result.error) throw result.error;
          all.push(...(result.data as Audit[]));
          if (result.data.length < 500) break;
        }
        if (!cancelled) setAudit(all);
      } catch {
        if (!cancelled)
          setAuditError(
            "Unable to load audit history. Close and reopen to retry.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId, authContext.departmentId]);

  function begin(action: Action, record: Rental | null = null) {
    if (saveLock.current) return;
    if (action === "pickup" || action === "returned") action = "return_update";
    const eligible = staff.find((s) => s.id === authContext.staffProfileId);
    const initial = {
      staffId: eligible?.id ?? "",
      name: eligible?.display_name ?? "",
      ...localFields(new Date(), timezone),
    };
    const events: Partial<Record<Stage, EventInput>> = {};
    if (action === "edit" && record) {
      for (const stage of stages) {
        const at = atFor(record, stage);
        if (!at) continue;
        const person = personFor(record, stage);
        events[stage] = {
          staffId: staff.some((s) => s.id === person.staff_profile_id)
            ? person.staff_profile_id!
            : "manual",
          name: person.name,
          ...localFields(at, timezone),
        };
      }
    } else if (action === "return_update") {
      events.pickup = { ...initial, staffId: "", name: "" };
      events.returned = { ...initial, staffId: "", name: "" };
      if (record?.pickup_requested_at) {
        const person = personFor(record, "pickup");
        events.pickup = {
          staffId: staff.some(
            (employee) => employee.id === person.staff_profile_id,
          )
            ? person.staff_profile_id!
            : "manual",
          name: person.name,
          ...localFields(record.pickup_requested_at, timezone),
        };
      }
    } else
      events[action.startsWith("cancel") ? "pickup" : (action as Stage)] =
        initial;
    setEditor({
      action,
      record,
      events,
      originalEvents: events,
      vendor:
        record?.vendor_id ??
        vendors.find((v) => v.is_active && /us med/i.test(v.name))?.id ??
        vendors.find((v) => v.is_active)?.id ??
        "",
      quantity: "1",
      serial: record?.serial_number ?? "",
      barcode: record?.barcode_number ?? "",
      scanned: false,
      requestId: crypto.randomUUID(),
    });
    setFormError("");
    setScanner(false);
    setDetailId("");
    setLookupScanner(false);
  }
  function findEquipment(value: string) {
    setLookup(value);
    setLookupScanner(false);
    const matches = records.filter((r) =>
      [r.serial_number, r.barcode_number].some(
        (identifier) =>
          identifier?.toLowerCase() === value.trim().toLowerCase(),
      ),
    );
    const record =
      matches.find((r) => rentalState(r.status).action) ??
      matches[matches.length - 1];
    if (!record) {
      setLookupError("No rental found for that barcode or serial number.");
      return;
    }
    setLookupError("");
    const action = rentalState(record.status).action;
    if (action) begin(action, record);
    else {
      setEditor(null);
      setHistoryOpen(true);
      setQuery(record.serial_number || record.barcode_number || "");
      setDetailId(record.id);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || saveLock.current) return;
    const stagePayload: Record<string, unknown> = {};
    for (const [stage, value] of Object.entries(editor.events)) {
      if (
        editor.action === "edit" &&
        JSON.stringify(value) ===
          JSON.stringify(editor.originalEvents[stage as Stage])
      )
        continue;
      if (editor.action === "return_update") {
        if (stage === "pickup" && editor.record?.pickup_requested_at) continue;
        const original = editor.originalEvents[stage as Stage];
        if (
          !value.staffId &&
          !value.name.trim() &&
          ((!value.date && !value.time) ||
            (value.date === original?.date && value.time === original?.time))
        )
          continue;
      }
      const at = eventTimestamp(value.date, value.time, timezone);
      if (!at) {
        setFormError(
          "Enter a valid Date (MM/DD/YYYY) and Time (HH:mm, 24-hour).",
        );
        return;
      }
      if (!value.staffId || !value.name.trim()) {
        setFormError("Select a name or use Insert Name.");
        return;
      }
      stagePayload[stage] = {
        at,
        person: {
          staff_profile_id: value.staffId === "manual" ? null : value.staffId,
          name: value.name.trim(),
        },
      };
    }
    if (
      editor.action === "return_update" &&
      !Object.keys(stagePayload).length
    ) {
      setFormError(
        "Enter a name for Called for Pick Up or Picked Up by Company.",
      );
      return;
    }
    if (editor.action === "delivery" && !editor.serial.trim()) {
      setFormError("Serial Number is required.");
      return;
    }
    if (
      editor.action === "order" &&
      (!/^\d+$/.test(editor.quantity) ||
        Number(editor.quantity) < 1 ||
        Number(editor.quantity) > 20)
    ) {
      setFormError("Quantity must be between 1 and 20.");
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setFormError("");
    const payload = {
      vendor_id: editor.vendor,
      quantity: Number(editor.quantity),
      serial_number: editor.serial.trim(),
      barcode_number: editor.barcode.trim(),
      scanned: editor.scanned,
      ...(editor.action === "edit" || editor.action === "return_update"
        ? { stages: stagePayload }
        : (Object.values(stagePayload)[0] as object)),
    };
    try {
      const result = await createClient().rpc("update_rental_list", {
        target_department_id: authContext.departmentId,
        action: editor.action,
        payload,
        target_record_id: editor.record?.id ?? null,
        expected_updated_at: editor.record?.updated_at ?? null,
        request_id: editor.requestId,
      });
      if (result.error) {
        if (result.error.message.includes("STALE_RENTAL_STATE")) {
          setEditor(null);
          await load();
          setError(
            "This rental changed. Review its current row before updating it again.",
          );
          return;
        }
        throw result.error;
      }
      // Keep the same keyed rows, including when a refresh request fails.
      const updated = result.data as Rental[];
      setRecords((current) => {
        const byId = new Map(updated.map((r) => [r.id, r]));
        const existingIds = new Set(current.map((r) => r.id));
        return [
          ...current.map((r) =>
            byId.has(r.id) ? { ...r, ...byId.get(r.id)! } : r,
          ),
          ...updated.filter((r) => !existingIds.has(r.id)),
        ];
      });
      setEditor(null);
      setScanner(false);
      await load();
    } catch (failure) {
      const message =
        (failure as { message?: string }).message ??
        "Unable to save. Retry the same action.";
      setFormError(
        message.includes("DUPLICATE_ACTIVE_RENTAL") ||
          message.includes("duplicate key")
          ? "That serial number or barcode already belongs to equipment in the hospital."
          : message,
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  const vendorName = (record: Rental) =>
    vendors.find((v) => v.id === record.vendor_id)?.name ?? "—";
  function serialField() {
    if (!editor) return null;
    return (
      <label className="block text-xs font-bold">
        Serial Number
        <input
          type="text"
          className={inputClass}
          maxLength={120}
          value={editor.serial}
          onChange={(e) => setEditor({ ...editor, serial: e.target.value })}
        />
      </label>
    );
  }
  const popupOpen =
    editor?.action === "delivery" || editor?.action === "return_update";
  function renderForm() {
    if (!editor) return null;
    return (
      <form
        onSubmit={save}
        className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3"
        aria-label={editor.action === "order" ? "Order BiPAP" : "Update rental"}
      >
        <fieldset disabled={saving} className="space-y-3">
          {(editor.action === "order" || editor.action === "edit") && (
            <div className="grid grid-cols-[2fr_1fr] gap-2">
              <label className="text-xs font-bold">
                Rental company
                <select
                  className={inputClass}
                  value={editor.vendor}
                  onChange={(e) =>
                    setEditor({ ...editor, vendor: e.target.value })
                  }
                >
                  {vendors
                    .filter((v) => v.is_active || v.id === editor.vendor)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>
              </label>
              {editor.action === "order" && (
                <label className="text-xs font-bold">
                  Quantity
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputClass}
                    value={editor.quantity}
                    onChange={(e) =>
                      setEditor({ ...editor, quantity: e.target.value })
                    }
                  />
                </label>
              )}
            </div>
          )}
          {Object.entries(editor.events).map(([stage, value]) => (
            <Fragment key={stage}>
              {editor.action === "return_update" && stage === "returned" && (
                <hr className="my-4 border-0 border-t-2 border-slate-400" />
              )}
              <fieldset
                disabled={
                  editor.action === "return_update" &&
                  stage === "pickup" &&
                  !!editor.record?.pickup_requested_at
                }
                className={
                  editor.action === "return_update"
                    ? `space-y-2 rounded-lg border p-3 ${stage === "pickup" ? "border-yellow-300 bg-yellow-100" : "border-red-200 bg-red-50"}`
                    : "space-y-2"
                }
              >
                {editor.action === "return_update" && (
                  <legend
                    className={`mx-auto mb-2 px-2 text-center font-bold ${stage === "pickup" ? "text-yellow-900" : "text-red-800"}`}
                  >
                    {stage === "pickup"
                      ? "Called for Pick Up"
                      : "Picked Up by Company"}
                  </legend>
                )}
                <RentalEventFields
                  label={
                    editor.action === "delivery" ||
                    editor.action === "return_update"
                      ? "Name"
                      : stageLabels[stage as Stage]
                  }
                  dateFirst={
                    editor.action === "delivery" ||
                    editor.action === "return_update"
                  }
                  value={value}
                  staff={staff}
                  onChange={(next) =>
                    setEditor({
                      ...editor,
                      events: { ...editor.events, [stage]: next },
                    })
                  }
                >
                  {editor.action === "delivery" && serialField()}
                </RentalEventFields>
              </fieldset>
            </Fragment>
          ))}
          {(editor.action === "delivery" || editor.action === "edit") && (
            <>
              {editor.action === "edit" && serialField()}
              <details open={scanner || undefined}>
                <summary className="cursor-pointer py-2 text-xs font-bold text-cyan-700">
                  Barcode / Scan
                </summary>
                <label className="block text-xs font-bold">
                  Barcode
                  <input
                    type="text"
                    className={inputClass}
                    maxLength={120}
                    value={editor.barcode}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        barcode: e.target.value,
                        scanned: false,
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="min-h-11 text-sm font-bold text-cyan-700"
                  onClick={() => setScanner(!scanner)}
                >
                  {scanner ? "Stop scanning" : "Scan barcode"}
                </button>
                {editor.scanned && (
                  <p role="status" className="text-xs text-teal-700">
                    Scanned: {editor.barcode}
                  </p>
                )}
                {scanner && (
                  <RentalBarcodeScanner
                    onScan={(value) => {
                      setEditor(
                        (current) =>
                          current && {
                            ...current,
                            barcode: value,
                            scanned: true,
                          },
                      );
                      setScanner(false);
                    }}
                  />
                )}
              </details>
            </>
          )}
          {formError && (
            <p role="alert" className="text-xs font-bold text-red-700">
              {formError}
            </p>
          )}
          <div className="flex gap-3">
            <button type="submit" className={buttonClass}>
              {saving
                ? "Saving…"
                : editor.action === "order"
                  ? "Order BiPAP"
                  : popupOpen
                    ? "Update"
                    : "Save"}
            </button>
            <button
              type="button"
              className="min-h-11 px-2 text-sm text-slate-600"
              onClick={() => {
                setEditor(null);
                setScanner(false);
              }}
            >
              Cancel
            </button>
          </div>
        </fieldset>
      </form>
    );
  }
  function details(record: Rental) {
    return (
      <div className="space-y-2 bg-slate-50 p-3 text-xs">
        <p>
          {vendorName(record)}{" "}
          {vendors.find((v) => v.id === record.vendor_id)?.phone_number}
        </p>
        {vendors.find((v) => v.id === record.vendor_id)?.notes && (
          <p>{vendors.find((v) => v.id === record.vendor_id)?.notes}</p>
        )}
        <p>Barcode: {record.barcode_number || "—"}</p>
        {record.current_location && <p>Location: {record.current_location}</p>}
        {[
          record.notes,
          record.pickup_request_note,
          record.return_note,
          record.cancellation_note,
        ]
          .filter(Boolean)
          .map((note, index) => (
            <p key={index}>{note}</p>
          ))}
        {stages.map((stage) => (
          <p key={stage}>
            <strong>{stageLabels[stage]}:</strong>{" "}
            {personFor(record, stage).name || "—"} ·{" "}
            {displayTimestamp(atFor(record, stage), timezone)}
          </p>
        ))}
        <button
          className="min-h-11 text-cyan-700 underline"
          disabled={saving}
          onClick={() => begin("edit", record)}
        >
          Edit
        </button>
        {rentalState(record.status).action === "delivery" && (
          <button
            className="ml-4 min-h-11 text-slate-600 underline"
            onClick={() => begin("cancel_delivery", record)}
          >
            Cancel order
          </button>
        )}
        {rentalState(record.status).action === "returned" && (
          <button
            className="ml-4 min-h-11 text-slate-600 underline"
            onClick={() => begin("cancel_pickup", record)}
          >
            Cancel pickup request
          </button>
        )}
        <details>
          <summary className="min-h-9 cursor-pointer font-bold">
            Audit history
          </summary>
          {auditError && <p role="alert">{auditError}</p>}
          {audit.map((entry) => {
            const person = entry.event_data.person as Attribution | null;
            return (
              <div key={entry.id} className="border-t border-slate-200 py-2">
                <p>
                  {entry.event_type.replaceAll("_", " ")} ·{" "}
                  {displayTimestamp(entry.event_at, timezone)}
                  {person?.name ? ` · ${person.name}` : ""}
                </p>
                <p className="text-slate-500">
                  Recorded by{" "}
                  {relatedName(entry.staff_profiles) ||
                    entry.authenticated_user_id ||
                    "Legacy account"}{" "}
                  · {displayTimestamp(entry.created_at, timezone)}
                </p>
                <details>
                  <summary className="cursor-pointer py-1">
                    Original audit data
                  </summary>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(entry.event_data, null, 2)}
                  </pre>
                </details>
              </div>
            );
          })}
        </details>
      </div>
    );
  }
  function table(rows: Rental[], history = false) {
    return (
      <table className="w-full table-fixed text-left text-xs sm:text-sm">
        <thead
          className={`border-b text-xs ${history ? "border-slate-300 bg-slate-200 text-slate-700" : "border-teal-200 bg-teal-100 text-teal-900"}`}
        >
          <tr>
            <th className="w-[25%] p-2">Status</th>
            <th className="w-[29%] p-2">BiPAP Serial Number</th>
            <th className="w-[22%] p-2">Company</th>
            <th className="w-[24%] p-2 text-center">Update</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((record, index) => {
            const state = rentalState(record.status);
            return (
              <Fragment key={record.id}>
                <tr
                  className={`border-b border-slate-200 align-middle ${index % 2 === 0 ? "bg-white" : history ? "bg-slate-50" : "bg-teal-50"}`}
                >
                  <td className={`p-1 font-bold sm:p-2 ${state.color}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.dot}`}
                      />
                      <span className="min-w-0 break-words">{state.label}</span>
                    </span>
                  </td>
                  <td className="break-words p-2">
                    {record.serial_number || "—"}
                  </td>
                  <td className="break-words p-2">
                    {vendorName(record).replace(" Equipment", "")}
                  </td>
                  <td className="p-1 text-center align-middle sm:p-2">
                    {!history && state.action && (
                      <button
                        disabled={saving}
                        className="inline-flex min-h-11 w-full max-w-28 items-center justify-center rounded-lg bg-cyan-700 px-1 text-center text-xs font-bold text-white disabled:opacity-50 sm:text-sm"
                        aria-expanded={editor?.record?.id === record.id}
                        onClick={() => begin(state.action!, record)}
                      >
                        {state.button}
                      </button>
                    )}
                    <button
                      disabled={saving}
                      className="min-h-9 w-full text-xs text-slate-500 underline"
                      onClick={() => {
                        setEditor(null);
                        setScanner(false);
                        setDetailId(detailId === record.id ? "" : record.id);
                      }}
                    >
                      {history ? "Details / Edit" : "Edit / Details"}
                    </button>
                  </td>
                </tr>
                {editor?.record?.id === record.id && !popupOpen && (
                  <tr>
                    <td colSpan={4}>{renderForm()}</td>
                  </tr>
                )}
                {detailId === record.id && (
                  <tr>
                    <td colSpan={4}>{details(record)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    );
  }
  if (!permitted) return <p>You do not have access to Rental Management.</p>;
  const rank = (record: Rental) =>
    ({ order: 0, delivery: 0, pickup: 1, returned: 2 })[
      rentalState(record.status).action ?? "delivery"
    ];
  const current = records
    .filter((r) => rentalState(r.status).action)
    .sort((a, b) => rank(a) - rank(b));
  const completed = records
    .filter((r) => !rentalState(r.status).action)
    .filter((r) =>
      [
        r.serial_number,
        r.barcode_number,
        vendorName(r),
        ...stages.map((stage) => personFor(r, stage).name),
        ...stages.map((stage) => displayTimestamp(atFor(r, stage), timezone)),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .reverse();
  return (
    <main className="min-h-screen bg-slate-100 px-2 py-4 sm:px-4">
      {popupOpen && (
        <RentalPopup
          title={editor.action === "delivery" ? "Delivered" : "Return BiPAP"}
          saving={saving}
          onClose={() => {
            setEditor(null);
            setScanner(false);
          }}
        >
          {renderForm()}
        </RentalPopup>
      )}
      <div className="mx-auto max-w-3xl rounded-2xl bg-slate-50 p-2 shadow-soft sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-cyan-200 bg-cyan-100 px-3 py-2">
          <h1 className="text-lg font-black text-hospital-ink">
            BiPAP Rental Management
          </h1>
          <Link
            href={
              authContext.operationsRole === "command_center"
                ? "/command-center"
                : authContext.role === "admin"
                  ? "/admin"
                  : "/operations"
            }
            className="min-h-11 py-3 text-xs font-bold text-cyan-700"
          >
            Back
          </Link>
        </div>
        {error && (
          <p role="alert" className="mb-2 text-xs text-red-700">
            {error}{" "}
            <button className="underline" onClick={() => void load()}>
              Retry
            </button>
          </p>
        )}
        <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <button
            disabled={loading || saving || !vendors.some((v) => v.is_active)}
            className={`${buttonClass} block`}
            aria-expanded={editor?.action === "order"}
            onClick={() => begin("order")}
          >
            + Order BiPAP
          </button>
          <button
            disabled={loading || saving}
            className="mb-2 block min-h-11 px-3 text-xs text-cyan-700 underline"
            aria-expanded={lookupOpen}
            onClick={() => {
              setLookupOpen(!lookupOpen);
              setLookupScanner(false);
            }}
          >
            Find / Scan
          </button>
          {lookupOpen && (
            <form
              className="mb-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                findEquipment(lookup);
              }}
            >
              <label className="block text-xs font-bold">
                Barcode or serial number
                <input
                  type="text"
                  className={inputClass}
                  value={lookup}
                  onChange={(event) => setLookup(event.target.value)}
                />
              </label>
              <button
                disabled={saving || !lookup.trim()}
                className={buttonClass}
              >
                Find
              </button>
              <button
                disabled={saving}
                type="button"
                className="ml-3 min-h-11 text-sm text-cyan-700"
                onClick={() => {
                  setScanner(false);
                  setLookupScanner(!lookupScanner);
                }}
              >
                {lookupScanner ? "Stop scanning" : "Scan to find"}
              </button>
              {lookupScanner && <RentalBarcodeScanner onScan={findEquipment} />}
              {lookupError && (
                <p role="alert" className="text-xs text-red-700">
                  {lookupError}
                </p>
              )}
            </form>
          )}
          {editor?.action === "order" && (
            <div className="mb-3">{renderForm()}</div>
          )}
        </div>
        <div className="overflow-hidden rounded-lg border border-teal-200 bg-teal-50">
          {loading ? (
            <p role="status" className="p-2 text-sm">
              Loading rentals…
            </p>
          ) : (
            <>
              {table(current)}
              {!current.length && (
                <p className="p-3 text-sm text-slate-500">
                  No current rentals.
                </p>
              )}
            </>
          )}
        </div>
        <section className="mt-3 rounded-lg border border-slate-300 bg-slate-100 p-2 sm:p-3">
          <button
            className="min-h-11 text-sm font-bold text-cyan-700"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            Rental History {historyOpen ? "−" : "+"}
          </button>
          {historyOpen && (
            <>
              <div className="mb-2 flex items-center gap-3">
                <input
                  type="search"
                  aria-label="Search rental history"
                  placeholder="Search rental history"
                  value={query}
                  className={inputClass}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <a
                  href="/api/rental-history/export?scope=all"
                  className="text-xs font-bold text-cyan-700"
                >
                  Export
                </a>
              </div>
              {table(completed, true)}
              {!completed.length && (
                <p className="p-2 text-sm text-slate-500">
                  No matching completed rentals.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
