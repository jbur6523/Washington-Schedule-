"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ImageIcon, Loader2, Send, Trash2, X } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";

const GOSSIP_BUCKET = "gossip-images";
const MAX_BODY_LENGTH = 140;
const MAX_IMAGE_DIMENSION = 1200;
const IMAGE_QUALITY = 0.8;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

type GossipBoardProps = {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
};

type StaffProfileSummary = {
  id: string;
  display_name: string;
};

type GossipPost = {
  id: string;
  department_id: string;
  staff_profile_id: string;
  body: string | null;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_size_bytes: number | null;
  created_at: string;
  updated_at: string;
  staff_profiles: StaffProfileSummary | StaffProfileSummary[] | null;
};

type CompressedImage = {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  originalSizeBytes: number;
  fileName: string;
};

function firstStaffProfile(value: StaffProfileSummary | StaffProfileSummary[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatPostTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const ageMs = now.getTime() - date.getTime();
  const minutes = Math.floor(ageMs / 60000);

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeFileName(name: string) {
  const clean = name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || "gossip-image.jpg";
}

async function compressImage(file: File): Promise<CompressedImage> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to read this image."));
      img.src = sourceUrl;
    });

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / image.width, MAX_IMAGE_DIMENSION / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Image compression is not available on this device.");
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Unable to compress this image."));
          }
        },
        "image/jpeg",
        IMAGE_QUALITY
      );
    });

    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
      width,
      height,
      sizeBytes: blob.size,
      originalSizeBytes: file.size,
      fileName: `${safeFileName(file.name).replace(/\.[^.]+$/, "")}.jpg`
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function GossipBoard({ authContext, developmentFallback }: GossipBoardProps) {
  const [posts, setPosts] = useState<GossipPost[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [selectedImage, setSelectedImage] = useState<CompressedImage | null>(null);
  const [loading, setLoading] = useState(!developmentFallback);
  const [posting, setPosting] = useState(false);
  const [imageStatus, setImageStatus] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const trimmedBody = body.trim();
  const canPost = Boolean(trimmedBody || selectedImage) && !posting && !developmentFallback && Boolean(authContext.staffProfileId);

  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [posts]
  );

  const loadPosts = useCallback(async () => {
    if (developmentFallback) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("gossip_posts")
      .select(
        "id, department_id, staff_profile_id, body, image_path, image_width, image_height, image_size_bytes, created_at, updated_at, staff_profiles(id, display_name)"
      )
      .eq("department_id", authContext.departmentId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (loadError) {
      setPosts([]);
      setImageUrls({});
      setError("Unable to load Gossip Board posts. Confirm the Gossip migration and storage setup are applied.");
      setLoading(false);
      return;
    }

    const nextPosts = (data ?? []) as GossipPost[];
    const paths = nextPosts.map((post) => post.image_path).filter(Boolean) as string[];
    const signedEntries = await Promise.all(
      paths.map(async (path) => {
        const { data: signed, error: signedError } = await supabase.storage.from(GOSSIP_BUCKET).createSignedUrl(path, 60 * 30);
        return signedError || !signed?.signedUrl ? null : [path, signed.signedUrl] as const;
      })
    );

    setPosts(nextPosts);
    setImageUrls(Object.fromEntries(signedEntries.filter(Boolean) as Array<readonly [string, string]>));
    setLoading(false);
  }, [authContext.departmentId, developmentFallback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPosts();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadPosts]);

  useEffect(() => {
    return () => {
      if (selectedImage?.previewUrl) {
        URL.revokeObjectURL(selectedImage.previewUrl);
      }
    };
  }, [selectedImage]);

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError("");
    setSuccess("");

    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setError("Use a JPG, PNG, or WebP image.");
      return;
    }

    setImageStatus("Compressing image...");

    try {
      const compressed = await compressImage(file);
      setSelectedImage((current) => {
        if (current?.previewUrl) {
          URL.revokeObjectURL(current.previewUrl);
        }

        return compressed;
      });
      setImageStatus(`Compressed from ${formatFileSize(file.size)} to ${formatFileSize(compressed.sizeBytes)}.`);
    } catch {
      setSelectedImage(null);
      setImageStatus("");
      setError("Unable to compress this image. Try a different photo.");
    }
  };

  const removeSelectedImage = () => {
    setSelectedImage((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return null;
    });
    setImageStatus("");
  };

  const createPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (developmentFallback) {
      setError("Gossip Board requires Supabase.");
      return;
    }

    if (!authContext.staffProfileId) {
      setError("Your staff profile must be linked before posting.");
      return;
    }

    if (!trimmedBody && !selectedImage) {
      setError("Write a message or attach an image before posting.");
      return;
    }

    if (trimmedBody.length > MAX_BODY_LENGTH) {
      setError("Gossip posts are limited to 140 characters.");
      return;
    }

    setPosting(true);
    setImageStatus(selectedImage ? "Uploading image..." : "");

    const supabase = createClient();
    const postId = crypto.randomUUID();
    let imagePath: string | null = null;

    if (selectedImage) {
      imagePath = `${authContext.departmentId}/${postId}/${Date.now()}-${selectedImage.fileName}`;
      const { error: uploadError } = await supabase.storage
        .from(GOSSIP_BUCKET)
        .upload(imagePath, selectedImage.blob, {
          cacheControl: "3600",
          contentType: "image/jpeg",
          upsert: false
        });

      if (uploadError) {
        setPosting(false);
        setImageStatus("");
        setError("Image upload failed. Confirm the private gossip-images bucket is configured.");
        return;
      }
    }

    const { error: insertError } = await supabase.from("gossip_posts").insert({
      id: postId,
      department_id: authContext.departmentId,
      staff_profile_id: authContext.staffProfileId,
      body: trimmedBody || null,
      image_path: imagePath,
      image_width: selectedImage?.width ?? null,
      image_height: selectedImage?.height ?? null,
      image_size_bytes: selectedImage?.sizeBytes ?? null
    });

    setPosting(false);
    setImageStatus("");

    if (insertError) {
      if (imagePath) {
        await supabase.storage.from(GOSSIP_BUCKET).remove([imagePath]);
      }

      setError("Post failed. Please try again.");
      return;
    }

    setBody("");
    removeSelectedImage();
    setSuccess("Posted.");
    await loadPosts();
  };

  const deletePost = async (post: GossipPost) => {
    if (post.staff_profile_id !== authContext.staffProfileId && authContext.role !== "admin") {
      return;
    }

    setDeletingId(post.id);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const { error: deleteError } = await supabase.from("gossip_posts").update({ is_deleted: true }).eq("id", post.id);

    setDeletingId("");

    if (deleteError) {
      setError("Unable to delete that post.");
      return;
    }

    setPosts((current) => current.filter((candidate) => candidate.id !== post.id));
    setSuccess("Post deleted.");
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <h2 className="text-xl font-black text-hospital-ink">Gossip Board</h2>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-600">Drop the tea. Keep it cute.</p>

        <form onSubmit={createPost} className="mt-4 space-y-3">
          <label className="block">
            <span className="sr-only">Gossip post</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value.slice(0, MAX_BODY_LENGTH))}
              maxLength={MAX_BODY_LENGTH}
              placeholder="What’s the tea?"
              disabled={posting || developmentFallback}
              className="min-h-24 w-full rounded-2xl border border-cyan-100 bg-cyan-50/40 px-3 py-2 text-sm font-bold text-hospital-ink outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white"
            />
          </label>

          <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
            <span>140 characters max. No patient info.</span>
            <span className={body.length >= MAX_BODY_LENGTH ? "text-rose-600" : "text-cyan-700"}>{body.length}/140</span>
          </div>
          <p className="text-xs font-bold text-rose-700">No patient information. No clinical details.</p>

          {selectedImage && (
            <div className="rounded-2xl border border-cyan-100 bg-white p-2">
              <div className="relative overflow-hidden rounded-xl bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedImage.previewUrl} alt="Selected gossip upload preview" className="max-h-64 w-full object-cover" />
                <button
                  type="button"
                  onClick={removeSelectedImage}
                  disabled={posting}
                  className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-700 shadow"
                  aria-label="Remove image"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mt-2 text-xs font-bold text-slate-500">
                {selectedImage.width}x{selectedImage.height} - {formatFileSize(selectedImage.sizeBytes)}
              </p>
            </div>
          )}

          {imageStatus && (
            <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800">
              {imageStatus}
            </p>
          )}

          {error && (
            <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              {success}
            </p>
          )}

          <div className="grid grid-cols-[1fr_1.2fr] gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={posting || developmentFallback}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-100 bg-white px-3 text-sm font-extrabold text-cyan-800 disabled:opacity-60"
            >
              <ImageIcon size={17} />
              Add Image
            </button>
            <button
              type="submit"
              disabled={!canPost}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white shadow-sm disabled:opacity-50"
            >
              {posting ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
              {posting ? "Posting..." : "Post"}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
            className="hidden"
          />
        </form>
      </section>

      {loading && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">Loading posts...</p>
        </section>
      )}

      {!loading && sortedPosts.length === 0 && (
        <section className="rounded-3xl border border-dashed border-cyan-100 bg-white/80 p-4 text-center shadow-soft">
          <p className="text-sm font-bold text-slate-500">No tea yet. Be the first to post.</p>
        </section>
      )}

      <div className="space-y-3">
        {sortedPosts.map((post) => {
          const staffProfile = firstStaffProfile(post.staff_profiles);
          const canDelete = post.staff_profile_id === authContext.staffProfileId || authContext.role === "admin";
          const imageUrl = post.image_path ? imageUrls[post.image_path] : "";

          return (
            <article key={post.id} className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-hospital-ink">{staffProfile?.display_name ?? "Staff member"}</p>
                  <p className="mt-0.5 text-xs font-bold text-slate-400">{formatPostTime(post.created_at)}</p>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void deletePost(post)}
                    disabled={deletingId === post.id}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rose-100 bg-rose-50 text-rose-700 disabled:opacity-60"
                    aria-label="Delete gossip post"
                  >
                    {deletingId === post.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                  </button>
                )}
              </div>

              {post.body && <p className="mt-3 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-700">{post.body}</p>}

              {post.image_path && imageUrl && (
                <a href={imageUrl} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-2xl bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="Gossip post attachment" className="max-h-96 w-full object-cover" loading="lazy" />
                </a>
              )}

              {post.image_path && !imageUrl && (
                <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-500">
                  Image preview unavailable.
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
