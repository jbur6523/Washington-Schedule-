"use client";

/* eslint-disable @next/next/no-img-element -- Order images use short-lived private Supabase signed URLs. */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, ImagePlus, PackageCheck } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

const orderImageBucket = "department-order-images";
const maxNoteLength = 280;

type DepartmentOrderRow = {
  id: string;
  department_id: string;
  created_by_staff_profile_id: string | null;
  created_by_name: string | null;
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
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
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
  const [notes, setNotes] = useState("");

  const canCreateOrders = authContext.operationsRole === "aide";
  const canCreate = canCreateOrders && Boolean(authContext.staffProfileId) && Boolean(selectedFile) && !saving;

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("department_orders")
      .select(
        "id, department_id, created_by_staff_profile_id, created_by_name, image_url, image_storage_path, notes, created_at, updated_at"
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

  const noteLength = notes.length;
  const createdByLabel = authContext.displayName || "Current aide";
  const backLabel = authContext.role === "admin" ? "Back to Admin Dashboard" : "Back to Aide Dashboard";

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
    setNotes("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreateOrders) {
      setError("Only aides can create orders.");
      return;
    }

    if (!authContext.staffProfileId) {
      setError("Your account is not linked to a staff profile.");
      return;
    }

    if (!selectedFile) {
      setError("Add a picture before creating the order.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const orderId = crypto.randomUUID();
    const imagePath = `${authContext.departmentId}/${orderId}/${Date.now()}-${safeFileName(selectedFile.name)}`;
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

    const { error: insertError } = await supabase.from("department_orders").insert({
      id: orderId,
      department_id: authContext.departmentId,
      created_by_staff_profile_id: authContext.staffProfileId,
      created_by_name: createdByLabel,
      image_storage_path: imagePath,
      image_url: null,
      notes: notes.trim() || null
    });

    if (insertError) {
      await supabase.storage.from(orderImageBucket).remove([imagePath]);
      setSaving(false);
      setError("Unable to create order.");
      return;
    }

    resetForm();
    setSuccess("Order created.");
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
        {orders.map((order) => (
          <article key={order.id} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                {order.signedImageUrl ? (
                  <img
                    src={order.signedImageUrl}
                    alt="Order item preview"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-slate-300">
                    <ImagePlus size={24} />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-hospital-ink">
                  Order created {formatCreatedAt(order.created_at)}
                </p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Created by: {order.created_by_name || "Aide"}
                </p>
                {order.notes && (
                  <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold leading-5 text-slate-600">
                    {order.notes}
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }, [loading, orders]);

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-pink-700">
            <PackageCheck size={15} />
            {authContext.role === "admin" ? "Admin View" : "Aide Tool"}
          </p>
          <h1 className="mt-2 text-3xl font-black text-hospital-ink">Order Management</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            {authContext.role === "admin"
              ? "Monitor department supply orders."
              : "Create and track department supply orders."}
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
        <form onSubmit={createOrder} className="rounded-3xl border border-pink-100 bg-white/95 p-4 shadow-soft">
          <h2 className="text-xl font-black text-hospital-ink">Create Order</h2>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
            Take or upload a picture, then add optional order notes.
          </p>

          <div className="mt-4 rounded-3xl border border-pink-100 bg-pink-50/70 p-3">
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
          {success && (
            <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={!canCreate}
            className="mt-4 min-h-12 w-full rounded-2xl bg-pink-600 px-4 text-sm font-extrabold text-white shadow-md shadow-pink-900/20 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            {saving ? "Creating..." : "Create Order"}
          </button>
          {!selectedFile && (
            <p className="mt-2 text-center text-xs font-bold text-slate-500">
              Add a picture to create an order.
            </p>
          )}
        </form>
        ) : (
          <section className="rounded-3xl border border-cyan-100 bg-cyan-50/70 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Admin monitoring view</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-cyan-900">
              Aides create orders. Admin can review submitted orders and thumbnails during beta testing.
            </p>
            {error && (
              <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {error}
              </p>
            )}
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-hospital-ink">Orders</h2>
            <span className="rounded-full bg-pink-50 px-2.5 py-1 text-xs font-extrabold text-pink-700">
              {orders.length}
            </span>
          </div>
          {ordersMarkup}
        </section>
      </div>
    </main>
  );
}
