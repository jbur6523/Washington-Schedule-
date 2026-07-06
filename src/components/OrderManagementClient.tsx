"use client";

/* eslint-disable @next/next/no-img-element -- Order images use short-lived private Supabase signed URLs. */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, ChevronDown, ClipboardList, PackageCheck, PackagePlus, X } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

const orderImageBucket = "department-order-images";
const maxNoteLength = 280;
const recentOrderLimit = 7;
const orderPageSize = 25;
const orderSelectColumns =
  "id, department_id, created_by_staff_profile_id, created_by_name, req_number, image_url, image_storage_path, notes, created_at, updated_at";
const todoClearMessageStorageKey = "order-todo-clear-message-index";
const todoClearMessages = [
  "Slaaayyyyyy 👏🏻",
  "Productivity MAXIMIZED ✨",
  "Clean slate activated ✨",
  "We are so back. 💅🏻",
  "Chaos reduced by 3% 💃🏻"
];

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

type OrderTodoRow = {
  id: string;
  department_id: string;
  content: string;
  updated_by_staff_profile_id: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
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
  const todoClearFallbackIndexRef = useRef(-1);
  const todoClearCelebrationTimerRef = useRef<number | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderWithPreview[]>([]);
  const [allOrders, setAllOrders] = useState<OrderWithPreview[]>([]);
  const [searchOrders, setSearchOrders] = useState<OrderWithPreview[]>([]);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [historyMode, setHistoryMode] = useState<"recent" | "all">("recent");
  const [orderSearch, setOrderSearch] = useState("");
  const [submittedOrderSearch, setSubmittedOrderSearch] = useState("");
  const [allHasMore, setAllHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allLoading, setAllLoading] = useState(false);
  const [allLoadingMore, setAllLoadingMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reqNumber, setReqNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{ url: string; label: string } | null>(null);
  const [expandedNotesOrderId, setExpandedNotesOrderId] = useState<string | null>(null);
  const [todoOpen, setTodoOpen] = useState(false);
  const [todoContent, setTodoContent] = useState("");
  const [savedTodoContent, setSavedTodoContent] = useState("");
  const [todoUpdatedAt, setTodoUpdatedAt] = useState<string | null>(null);
  const [todoUpdatedBy, setTodoUpdatedBy] = useState<string | null>(null);
  const [todoLoading, setTodoLoading] = useState(false);
  const [todoSaveStatus, setTodoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [todoError, setTodoError] = useState("");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [clearCelebrationMessage, setClearCelebrationMessage] = useState("");

  const isAdminView = authContext.role === "admin";
  const canCreateOrders = authContext.role === "admin" || authContext.operationsRole === "aide";
  const hasOrderContent = Boolean(selectedFile) || Boolean(notes.trim()) || Boolean(reqNumber.trim());
  const canCreate = canCreateOrders && Boolean(authContext.staffProfileId) && hasOrderContent && !saving;
  const noteLength = notes.length;
  const createdByLabel = authContext.displayName || "Current user";
  const backLabel = isAdminView ? "Back to Admin Dashboard" : "Back to Aide Dashboard";
  const todoHasUnsavedChanges = todoContent !== savedTodoContent;
  const todoIsSaving = todoSaveStatus === "saving";
  const activeSearchQuery = submittedOrderSearch.trim();
  const searchActive = activeSearchQuery.length > 0;
  const displayedOrders = searchActive ? searchOrders : historyMode === "recent" ? recentOrders : allOrders;
  const displayedOrdersLoading = searchActive ? searchLoading : historyMode === "recent" ? loading : allLoading;
  const submittedCountLabel = orderCount ?? recentOrders.length;

  const signOrderPreviews = useCallback(async (rows: DepartmentOrderRow[]) => {
    const supabase = createClient();
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

    return ordersWithPreviews;
  }, []);

  const loadRecentOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError, count } = await supabase
      .from("department_orders")
      .select(orderSelectColumns, { count: "exact" })
      .eq("department_id", authContext.departmentId)
      .order("created_at", { ascending: false })
      .range(0, recentOrderLimit - 1);

    if (loadError) {
      setError("Unable to load orders.");
      setRecentOrders([]);
      setOrderCount(null);
      setLoading(false);
      return;
    }

    setRecentOrders(await signOrderPreviews((data ?? []) as DepartmentOrderRow[]));
    setOrderCount(count ?? 0);
    setLoading(false);
  }, [authContext.departmentId, signOrderPreviews]);

  const loadAllOrdersPage = useCallback(
    async (reset = false) => {
      const start = reset ? 0 : allOrders.length;

      if (reset) {
        setAllLoading(true);
        setAllOrders([]);
      } else {
        setAllLoadingMore(true);
      }

      setError("");

      const supabase = createClient();
      const { data, error: loadError, count } = await supabase
        .from("department_orders")
        .select(orderSelectColumns, { count: "exact" })
        .eq("department_id", authContext.departmentId)
        .order("created_at", { ascending: false })
        .range(start, start + orderPageSize - 1);

      if (loadError) {
        setError("Unable to load orders.");
        setAllLoading(false);
        setAllLoadingMore(false);
        return;
      }

      const nextOrders = await signOrderPreviews((data ?? []) as DepartmentOrderRow[]);
      const nextTotal = count ?? orderCount ?? start + nextOrders.length;

      setOrderCount(nextTotal);
      setAllOrders((current) => (reset ? nextOrders : [...current, ...nextOrders]));
      setAllHasMore(start + nextOrders.length < nextTotal);
      setAllLoading(false);
      setAllLoadingMore(false);
    },
    [allOrders.length, authContext.departmentId, orderCount, signOrderPreviews]
  );

  const searchOrdersByReqNumber = useCallback(
    async (query: string) => {
      const searchValue = query.trim();
      if (!searchValue) {
        setSearchOrders([]);
        setSearchError("");
        setSearchLoading(false);
        return;
      }

      setSearchLoading(true);
      setSearchError("");

      const supabase = createClient();
      const { data, error: searchLoadError } = await supabase
        .from("department_orders")
        .select(orderSelectColumns)
        .eq("department_id", authContext.departmentId)
        .ilike("req_number", `%${searchValue}%`)
        .order("created_at", { ascending: false })
        .limit(orderPageSize);

      if (searchLoadError) {
        setSearchOrders([]);
        setSearchError("Unable to search orders.");
        setSearchLoading(false);
        return;
      }

      setSearchOrders(await signOrderPreviews((data ?? []) as DepartmentOrderRow[]));
      setSearchLoading(false);
    },
    [authContext.departmentId, signOrderPreviews]
  );

  const loadTodo = useCallback(async () => {
    setTodoLoading(true);
    setTodoError("");
    setTodoSaveStatus("idle");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("order_management_todo")
      .select("id, department_id, content, updated_by_staff_profile_id, updated_by_name, created_at, updated_at")
      .eq("department_id", authContext.departmentId)
      .maybeSingle();

    if (loadError) {
      setTodoLoading(false);
      setTodoError("Could not load the to-do list.");
      return;
    }

    const todo = data as OrderTodoRow | null;
    const content = todo?.content ?? "";

    setTodoContent(content);
    setSavedTodoContent(content);
    setTodoUpdatedAt(todo?.updated_at ?? null);
    setTodoUpdatedBy(todo?.updated_by_name ?? null);
    setTodoLoading(false);
  }, [authContext.departmentId]);

  const saveTodo = useCallback(
    async (content: string) => {
      if (!authContext.staffProfileId) {
        setTodoSaveStatus("error");
        setTodoError("Your account is not linked to a staff profile.");
        return false;
      }

      setTodoSaveStatus("saving");
      setTodoError("");

      const supabase = createClient();
      const { data, error: saveError } = await supabase
        .from("order_management_todo")
        .upsert(
          {
            department_id: authContext.departmentId,
            content,
            updated_by_staff_profile_id: authContext.staffProfileId,
            updated_by_name: createdByLabel
          },
          { onConflict: "department_id" }
        )
        .select("id, department_id, content, updated_by_staff_profile_id, updated_by_name, created_at, updated_at")
        .single();

      if (saveError) {
        setTodoSaveStatus("error");
        setTodoError("Could not save the to-do list.");
        return false;
      }

      const todo = data as OrderTodoRow;

      setSavedTodoContent(todo.content);
      setTodoUpdatedAt(todo.updated_at);
      setTodoUpdatedBy(todo.updated_by_name);
      setTodoSaveStatus("saved");
      return true;
    },
    [authContext.departmentId, authContext.staffProfileId, createdByLabel]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRecentOrders();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRecentOrders]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchOrdersByReqNumber(submittedOrderSearch);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [submittedOrderSearch, searchOrdersByReqNumber]);

  useEffect(() => {
    if (historyMode !== "all" || allOrders.length > 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadAllOrdersPage(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [allOrders.length, historyMode, loadAllOrdersPage]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isCreateOpen && !todoOpen && !expandedImage) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [expandedImage, isCreateOpen, todoOpen]);

  useEffect(() => {
    if (!todoOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadTodo();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadTodo, todoOpen]);

  useEffect(() => {
    return () => {
      if (todoClearCelebrationTimerRef.current !== null) {
        window.clearTimeout(todoClearCelebrationTimerRef.current);
      }
    };
  }, []);

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

  const openTodo = () => {
    setTodoError("");
    setTodoSaveStatus("idle");
    setClearConfirmOpen(false);
    setDiscardConfirmOpen(false);
    setClearCelebrationMessage("");
    setTodoOpen(true);
  };

  const closeCreateOrder = () => {
    if (saving) {
      return;
    }

    resetForm();
    setError("");
    setIsCreateOpen(false);
  };

  const closeTodo = () => {
    if (todoIsSaving) {
      return;
    }

    setTodoOpen(false);
    setClearConfirmOpen(false);
    setDiscardConfirmOpen(false);
    setTodoError("");
    setClearCelebrationMessage("");

    if (todoClearCelebrationTimerRef.current !== null) {
      window.clearTimeout(todoClearCelebrationTimerRef.current);
      todoClearCelebrationTimerRef.current = null;
    }
  };

  const requestCloseTodo = () => {
    if (todoIsSaving) {
      return;
    }

    if (todoHasUnsavedChanges) {
      setDiscardConfirmOpen(true);
      return;
    }

    closeTodo();
  };

  const discardTodoChanges = () => {
    setTodoContent(savedTodoContent);
    setDiscardConfirmOpen(false);
    closeTodo();
  };

  const saveAndCloseTodo = async () => {
    if (todoIsSaving) {
      return;
    }

    const saved = await saveTodo(todoContent);
    if (!saved) {
      return;
    }

    setSuccess("To-do list saved.");
    closeTodo();
  };

  const clearTodo = async () => {
    const saved = await saveTodo("");

    if (!saved) {
      setTodoError("Could not clear to-do list. Please try again.");
      return;
    }

    setTodoContent("");
    setSavedTodoContent("");
    setDiscardConfirmOpen(false);

    let nextMessageIndex = 0;

    try {
      const storedIndex = window.localStorage.getItem(todoClearMessageStorageKey);
      const previousIndex = storedIndex === null ? -1 : Number(storedIndex);
      nextMessageIndex = Number.isFinite(previousIndex) ? (previousIndex + 1) % todoClearMessages.length : 0;
      window.localStorage.setItem(todoClearMessageStorageKey, String(nextMessageIndex));
    } catch {
      nextMessageIndex = (todoClearFallbackIndexRef.current + 1) % todoClearMessages.length;
      todoClearFallbackIndexRef.current = nextMessageIndex;
    }

    setClearCelebrationMessage(todoClearMessages[nextMessageIndex]);

    if (todoClearCelebrationTimerRef.current !== null) {
      window.clearTimeout(todoClearCelebrationTimerRef.current);
    }

    todoClearCelebrationTimerRef.current = window.setTimeout(() => {
      setClearConfirmOpen(false);
      setClearCelebrationMessage("");
      setTodoOpen(false);
      todoClearCelebrationTimerRef.current = null;
    }, 1000);
  };

  const runOrderSearch = () => {
    const searchValue = orderSearch.trim();
    if (!searchValue) {
      return;
    }

    setSubmittedOrderSearch(searchValue);
    setHistoryMode("recent");
    setExpandedNotesOrderId(null);
  };

  const clearOrderSearch = () => {
    setOrderSearch("");
    setSubmittedOrderSearch("");
    setSearchOrders([]);
    setSearchError("");
    setSearchLoading(false);
    setHistoryMode("recent");
    setExpandedNotesOrderId(null);
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
    setAllOrders([]);
    setAllHasMore(false);
    await loadRecentOrders();
  };

  const ordersMarkup = useMemo(() => {
    if (displayedOrdersLoading) {
      return (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">
            {searchActive ? "Searching orders..." : "Loading orders..."}
          </p>
        </section>
      );
    }

    if (searchError) {
      return (
        <section className="rounded-3xl border border-rose-100 bg-rose-50 p-4 shadow-soft">
          <p className="text-sm font-bold text-rose-700">{searchError}</p>
        </section>
      );
    }

    if (displayedOrders.length === 0) {
      return (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">
            {searchActive ? "No orders found for that Req Number." : "No department orders yet."}
          </p>
        </section>
      );
    }

    return (
      <div className="grid gap-3">
        {displayedOrders.map((order) => {
          const created = formatCreatedAt(order.created_at);
          const reqLabel = order.req_number?.trim() || "Not entered";
          const notesOpen = expandedNotesOrderId === order.id;

          return (
            <article key={order.id} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-left">
                  <p className="break-words text-base font-black leading-5 text-hospital-ink">Order Req - {reqLabel}</p>
                  <p className="mt-2 text-sm font-bold leading-5 text-slate-600">
                    Date: {created.date}
                    {created.time ? ` Time: ${created.time}` : ""}
                  </p>
                  <p className="mt-1 text-sm font-bold leading-5 text-slate-600">
                    Created by: {order.created_by_name || "User"}
                  </p>
                </div>
                {order.signedImageUrl && (
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
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
                  </div>
                )}
              </div>
              {order.notes && (
                <>
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setExpandedNotesOrderId(notesOpen ? null : order.id)}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-pink-100 bg-pink-50 px-5 text-sm font-extrabold text-pink-700"
                      aria-expanded={notesOpen}
                    >
                      {notesOpen ? "Hide Notes" : "View Notes"}
                      <ChevronDown
                        size={16}
                        className={notesOpen ? "rotate-180 transition-transform" : "transition-transform"}
                      />
                    </button>
                  </div>
                  {notesOpen && (
                    <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-left">
                      <p className="text-sm font-semibold leading-5 text-slate-600">{order.notes}</p>
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>
    );
  }, [displayedOrders, displayedOrdersLoading, expandedNotesOrderId, searchActive, searchError]);

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
            <button
              type="button"
              onClick={openTodo}
              className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-300 px-4 text-sm font-extrabold text-amber-950 shadow-md shadow-amber-900/10"
            >
              <ClipboardList size={18} />
              To-Do List
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
              <p className="mt-1 text-3xl font-black leading-none text-hospital-ink">{submittedCountLabel}</p>
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
              {submittedCountLabel} submitted
            </span>
          </div>

          <form
            className="block rounded-3xl border border-white bg-white/95 p-4 shadow-soft"
            onSubmit={(event) => {
              event.preventDefault();
              runOrderSearch();
            }}
          >
            <label className="block">
              <span className="text-sm font-black text-hospital-ink">Order Look Up</span>
              <span className="mt-0.5 block text-xs font-bold text-slate-500">Req order #</span>
              <input
                value={orderSearch}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setOrderSearch(nextValue);
                  if (!nextValue.trim() && searchActive) {
                    clearOrderSearch();
                  }
                }}
                placeholder="Enter Req Number"
                className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <button
                type="submit"
                disabled={!orderSearch.trim() || searchLoading}
                className={`min-h-11 rounded-2xl px-4 text-sm font-black shadow-sm ${
                  orderSearch.trim() && !searchLoading
                    ? "bg-pink-600 text-white shadow-pink-900/15"
                    : "border border-slate-200 bg-transparent text-slate-400"
                }`}
              >
                {searchLoading ? "Searching..." : "Search Order"}
              </button>
              {(orderSearch || searchActive) && (
                <button
                  type="button"
                  onClick={clearOrderSearch}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          {searchActive && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2">
              <p className="text-sm font-black text-amber-900">Search Results</p>
              <button
                type="button"
                onClick={clearOrderSearch}
                className="text-xs font-black text-amber-800 underline"
              >
                Clear Search
              </button>
            </div>
          )}

          {ordersMarkup}

          {!searchActive && (
            <div className="flex justify-center">
              {historyMode === "recent" && (orderCount ?? recentOrders.length) > recentOrderLimit && (
                <button
                  type="button"
                  onClick={() => {
                    setHistoryMode("all");
                    if (allOrders.length === 0) {
                      setAllLoading(true);
                    }
                  }}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-pink-200 bg-white px-6 text-sm font-black text-pink-700 shadow-sm"
                >
                  View All
                </button>
              )}
              {historyMode === "all" && allHasMore && (
                <button
                  type="button"
                  onClick={() => void loadAllOrdersPage(false)}
                  disabled={allLoadingMore}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-pink-200 bg-white px-6 text-sm font-black text-pink-700 shadow-sm disabled:opacity-60"
                >
                  {allLoadingMore ? "Loading..." : "Load More Orders"}
                </button>
              )}
            </div>
          )}
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

        {todoOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 px-4 py-4 sm:items-center">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="order-todo-title"
              className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-pink-700">
                    <ClipboardList size={14} />
                    Shared Notes
                  </p>
                  <h2 id="order-todo-title" className="mt-1 text-2xl font-black text-hospital-ink">
                    To-Do List
                  </h2>
                  <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                    Shared department order notes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={requestCloseTodo}
                  disabled={todoIsSaving}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 disabled:opacity-50"
                  aria-label="Close to-do list"
                >
                  <X size={18} />
                </button>
              </div>

              {todoLoading ? (
                <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                  Loading to-do list...
                </p>
              ) : (
                <label className="mt-4 block">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">To-Do List</span>
                  <textarea
                    value={todoContent}
                    onChange={(event) => {
                      setTodoContent(event.target.value.slice(0, 5000));
                      setTodoError("");
                      setTodoSaveStatus("idle");
                    }}
                    placeholder="Add supply/order tasks here..."
                    className="mt-1 min-h-64 w-full rounded-2xl border border-amber-100 bg-amber-50/40 px-3 py-3 text-base font-bold leading-6 text-hospital-ink outline-none focus:border-amber-300 focus:bg-white"
                  />
                  <span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                    <span>No patient information.</span>
                    <span>{todoContent.length}/5000</span>
                  </span>
                </label>
              )}

              <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                {todoUpdatedAt ? (
                  <>
                    <p>Last updated: {formatCreatedAt(todoUpdatedAt).date} {formatCreatedAt(todoUpdatedAt).time}</p>
                    <p className="mt-1">Updated by: {todoUpdatedBy || "User"}</p>
                  </>
                ) : (
                  <p>No updates yet.</p>
                )}
                {todoSaveStatus === "error" && (
                  <p className="mt-1 font-black text-rose-600">Could not save</p>
                )}
              </div>

              {todoError && (
                <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                  {todoError}
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setClearConfirmOpen(true)}
                  disabled={todoLoading || todoIsSaving || (!todoContent.trim() && !savedTodoContent.trim())}
                  className="min-h-12 rounded-2xl bg-emerald-600 px-4 text-sm font-extrabold text-white shadow-md shadow-emerald-900/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear List
                </button>
                <button
                  type="button"
                  onClick={() => (todoHasUnsavedChanges ? void saveAndCloseTodo() : closeTodo())}
                  disabled={todoIsSaving}
                  className={`min-h-12 rounded-2xl px-4 text-sm font-extrabold shadow-md disabled:opacity-50 ${
                    todoHasUnsavedChanges
                      ? "bg-pink-600 text-white shadow-pink-900/20"
                      : "border border-slate-200 bg-white text-slate-700 shadow-slate-900/5"
                  }`}
                >
                  {todoIsSaving ? "Saving..." : todoHasUnsavedChanges ? "Save" : "Close"}
                </button>
              </div>
            </section>

            {clearConfirmOpen && (
              <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4">
                <section
                  className={`w-full max-w-sm rounded-3xl p-5 text-center shadow-2xl ${
                    clearCelebrationMessage
                      ? "border border-emerald-100 bg-emerald-50"
                      : "bg-white"
                  }`}
                >
                  {clearCelebrationMessage ? (
                    <div className="flex min-h-32 flex-col items-center justify-center gap-3">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                        <PackageCheck size={24} />
                      </div>
                      <p className="text-3xl font-black leading-tight text-emerald-800">
                        {clearCelebrationMessage}
                      </p>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-xl font-black text-hospital-ink">Clear to-do list?</h3>
                      <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                        This will clear the shared order to-do list.
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setClearConfirmOpen(false)}
                          className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void clearTodo()}
                          disabled={todoIsSaving}
                          className="min-h-11 rounded-2xl bg-emerald-600 px-3 text-sm font-extrabold text-white disabled:opacity-50"
                        >
                          Yes, Clear List
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}

            {discardConfirmOpen && (
              <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4">
                <section className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl">
                  <h3 className="text-xl font-black text-hospital-ink">Discard unsaved changes?</h3>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                    Your changes have not been saved.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDiscardConfirmOpen(false)}
                      className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700"
                    >
                      Keep Editing
                    </button>
                    <button
                      type="button"
                      onClick={discardTodoChanges}
                      className="min-h-11 rounded-2xl bg-slate-800 px-3 text-sm font-extrabold text-white"
                    >
                      Discard
                    </button>
                  </div>
                </section>
              </div>
            )}
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
