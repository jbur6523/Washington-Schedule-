"use client";

/* eslint-disable @next/next/no-img-element -- Order images use short-lived private Supabase signed URLs. */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, ImagePlus, PackageCheck, PackagePlus, X } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

const orderImageBucket = "department-order-images";
const maxNoteLength = 280;

type DepartmentOrderRow = {
  id: string;
  department_id: string;
  created_by_staff_profile_id: string | null;
  created_by_name: string | null;
  req_number: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type OrderWithPreview = DepartmentOrderRow & {
  signedImageUrl: string | null;
};

type OrderManagementClientProps = {
  authContext: AuthenticatedUserContext;
};

function formatCreatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { date: value, time: "" };
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";

  return {
    date: `${part("month")}/${part("day")}/${part("year")}`,
    time: `${part("hour")}:${part("minute")}`
  };
}

function safeFileName(fileName: string) {
  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(-90) || "order-image";
}

export function OrderManagementClient({ authContext }: OrderManagementClientProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [orders, setOrders] = useState<OrderWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reqNumber, setReqNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{ url: string; label: string } | null>(null);

  const isAdminView = authContext.role === "admin";
  const canCreateOrders = authContext.role === "admin" || authContext.operationsRole === "aide";
  const hasOrderContent = Boolean(selectedFile) || Boolean(notes.trim()) || Boolean(reqNumber.trim());
  const canCreate = canCreateOrders && Boolean(authContext.staffProfileId) && hasOrderContent && !saving;

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("department_orders")
      .select(
        "id, department_id, created_by_staff_profile_id, created_by_name, req_number, image_url, image_storage_path, notes, created_at, updated_at"
      )
      .eq("department_id", authContext.departmentId)
      .order("created_at", { ascending: false });

    if (loadError) {
      setError("Unable to load orders.");
      setOrders([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as DepartmentOrderRow[];
    const ordersWithPreviews = await Promise.all(
      rows.map(async (order) => {
        if (!order.image_storage_path) {
          return { ...order, signedImageUrl: order.image_url };
        }

        const { data: signed, error: signedError } = await supabase.storage
          .from(orderImageBucket)
          .createSignedUrl(order.image_storage_path, 60 * 60);

        return {
          ...order,
          signedImageUrl: signedError ? null : signed?.signedUrl ?? null
        };
      })
    );

    setOrders(ordersWithPreviews);
    setLoading(false);
  }, [authContext.departmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOrders();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOrders]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isCreateOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isCreateOpen]);

  const noteLength = notes.length;
  const createdByLabel = authContext.displayName || "Current user";
  const backLabel = isAdminView ? "Back to Admin Dashboard" : "Back to Aide Dashboard";

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    const nextPreviewUrl = file ? URL.createObjectURL(file) : null;
    previewUrlRef.current = nextPreviewUrl;
    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);
    setError("");
    setSuccess("");
  };

  const resetForm = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setSelectedFile(null);
    setPreviewUrl(null);
    setReqNumber("");
    setNotes("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openCreateOrder = () => {
    setError("");
    setSuccess("");
    setIsCreateOpen(true);
  };

  const closeCreateOrder = () => {
    if (saving) {
      return;
    }

    resetForm();
    setError("");
    setIsCreateOpen(false);
  };

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreateOrders) {
      setError("Only aides and admins can create orders.");
      return;
    }

    if (!authContext.staffProfileId) {
      setError("Your account is not linked to a staff profile.");
      return;
    }

    if (!selectedFile && !notes.trim() && !reqNumber.trim()) {
      setError("Add a picture, note, or Req Number before creating the order.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const orderId = crypto.randomUUID();
    let imagePath: string | null = null;

    if (selectedFile) {
      imagePath = `${authContext.departmentId}/${orderId}/${Date.now()}-${safeFileName(selectedFile.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(orderImageBucket)
        .upload(imagePath, selectedFile, {
          contentType: selectedFile.type || "image/jpeg",
          upsert: false
        });

      if (uploadError) {
        setSaving(false);
        setError("Image upload failed. Please try again.");
        return;
      }
    }

    const { error: insertError } = await supabase.from("department_orders").insert({
      id: orderId,
      department_id: authContext.departmentId,
      created_by_staff_profile_id: authContext.staffProfileId,
      created_by_name: createdByLabel,
      req_number: reqNumber.trim() || null,
      image_storage_path: imagePath,
      image_url: null,
      notes: notes.trim() || null
    });

    if (insertError) {
      if (imagePath) {
        await supabase.storage.from(orderImageBucket).remove([imagePath]);
      }
      setSaving(false);
      setError("Unable to create order.");
      return;
    }

    resetForm();
    setSuccess("Order submitted.");
    setIsCreateOpen(false);
    setSaving(false);
    await loadOrders();
  };

  const ordersMarkup = useMemo(() => {
    if (loading) {
      return (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">Loading orders...</p>
        </section>
      );
    }

    if (orders.length === 0) {
      return (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">No department orders yet.</p>
        </section>
      );
    }

    return (
      <div className="grid gap-3">
        {orders.map((order) => {
          const created = formatCreatedAt(order.created_at);
          const reqLabel = order.req_number?.trim() || "Not entered";

          return (
            <article key={order.id} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                  {order.signedImageUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedImage({
                          url: order.signedImageUrl as string,
                          label: `Order Req - ${reqLabel}`
                        })
                      }
                      className="h-full w-full"
                      aria-label="Open full-size order image"
                    >
                      <img
                        src={order.signedImageUrl}
                        alt="Order item preview"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : (
                    <span className="grid h-full w-full place-items-center text-slate-300">
                      <ImagePlus size={24} />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-black leading-5 text-hospital-ink">Order Req - {reqLabel}</p>
                  <p className="mt-2 text-sm font-bold leading-5 text-slate-600">
                    Date: {created.date}
                    {created.time ? ` Time: ${created.time}` : ""}
                  </p>
                  <p className="mt-1 text-sm font-bold leading-5 text-slate-600">
                    Created by: {order.created_by_name || "User"}
                  </p>
                  {order.notes && (
                    <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2">
                      <p className="text-xs font-extrabold text-slate-400">Notes:</p>
                      <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">{order.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  }, [loading, orders]);

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-pink-700">
            <PackageCheck size={15} />
            {isAdminView ? "Admin View" : "Aide View"}
          </p>
          <h1 className="mt-2 text-3xl font-black text-hospital-ink">Order Management</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Create and monitor department supply orders.
          </p>
          <Link
            href="/operations"
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
          >
            <ArrowLeft size={17} />
            {backLabel}
          </Link>
        </section>

        {canCreateOrders ? (
          <section className="rounded-3xl border border-pink-100 bg-white/95 p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-pink-700">
                <PackagePlus size={22} />
              </span>
              <div>
                <h2 className="text-xl font-black text-hospital-ink">Create Order</h2>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                  Add a Req Number, picture, or notes for a department supply order.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openCreateOrder}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 px-4 text-sm font-extrabold text-white shadow-md shadow-pink-900/20"
            >
              <PackagePlus size={18} />
              Create Order
            </button>
            {success && (
              <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                {success}
              </p>
            )}
            {error && !isCreateOpen && (
              <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {error}
              </p>
            )}
          </section>
        ) : (
          <section className="rounded-3xl border border-cyan-100 bg-cyan-50/70 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Order access unavailable</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-cyan-900">
              This account can view Order Management, but create access is not enabled for this role.
            </p>
            <div className="mt-4 rounded-2xl bg-white px-3 py-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Submitted orders</p>
              <p className="mt-1 text-3xl font-black leading-none text-hospital-ink">{orders.length}</p>
            </div>
            {error && (
              <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {error}
              </p>
            )}
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-hospital-ink">Order History</h2>
            <span className="rounded-full bg-pink-50 px-2.5 py-1 text-xs font-extrabold text-pink-700">
              {orders.length} submitted
            </span>
          </div>
          {ordersMarkup}
        </section>

        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 px-4 py-4 sm:items-center">
            <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-pink-700">
                    <PackageCheck size={14} />
                    {isAdminView ? "Admin View" : "Aide View"}
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-hospital-ink">Create Order</h2>
                  <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                    Picture, notes, and Req Number are optional, but at least one is required.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCreateOrder}
                  disabled={saving}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 disabled:opacity-50"
                  aria-label="Cancel create order"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={createOrder} className="mt-4">
                <div className="rounded-3xl border border-pink-100 bg-pink-50/70 p-3">
                  <input
                    ref={fileInputRef}
                    id="order-picture"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                  <label
                    htmlFor="order-picture"
                    className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-pink-600 px-4 text-sm font-extrabold text-white shadow-sm shadow-pink-900/20"
                  >
                    <Camera size={18} />
                    Take / Upload Picture
                  </label>
                  <p className="mt-2 text-center text-xs font-bold text-pink-900/70">
                    Take a picture of your order 📸
                  </p>

                  {previewUrl && (
                    <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-2xl border border-white bg-white">
                      <img
                        src={previewUrl}
                        alt="Selected order item preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                </div>

                <label className="mt-4 grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Req Number
                  <input
                    value={reqNumber}
                    onChange={(event) => setReqNumber(event.target.value.slice(0, 80))}
                    placeholder="Optional"
                    className="min-h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-hospital-ink outline-none focus:border-pink-300"
                  />
                </label>

                <label className="mt-4 grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Notes (optional)
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value.slice(0, maxNoteLength))}
                    maxLength={maxNoteLength}
                    placeholder="Add order details..."
                    className="min-h-28 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold normal-case tracking-normal text-hospital-ink outline-none focus:border-pink-300"
                  />
                </label>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-slate-500">No patient information.</p>
                  <span className="text-xs font-bold text-slate-400">{noteLength}/{maxNoteLength}</span>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Created by</p>
                  <p className="text-sm font-extrabold text-hospital-ink">{createdByLabel}</p>
                </div>

                {error && (
                  <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                    {error}
                  </p>
                )}

                <div className="mt-4 grid gap-2">
                  <button
                    type="submit"
                    disabled={!canCreate}
                    className="min-h-12 w-full rounded-2xl bg-pink-600 px-4 text-sm font-extrabold text-white shadow-md shadow-pink-900/20 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
                  >
                    {saving ? "Submitting..." : "Submit Order"}
                  </button>
                  <button
                    type="button"
                    onClick={closeCreateOrder}
                    disabled={saving}
                    className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
                {!hasOrderContent && (
                  <p className="mt-2 text-center text-xs font-bold text-slate-500">
                    Add a picture, note, or Req Number to create an order.
                  </p>
                )}
              </form>
            </div>
          </div>
        )}

        {expandedImage && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/70 px-3 py-5"
            onClick={() => setExpandedImage(null)}
          >
            <div
              className="w-full max-w-3xl rounded-3xl bg-white p-3 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <p className="text-sm font-black text-hospital-ink">{expandedImage.label}</p>
                <button
                  type="button"
                  onClick={() => setExpandedImage(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600"
                  aria-label="Close image preview"
                >
                  <X size={18} />
                </button>
              </div>
              <img
                src={expandedImage.url}
                alt="Large order item preview"
                className="max-h-[82vh] w-full rounded-2xl object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
