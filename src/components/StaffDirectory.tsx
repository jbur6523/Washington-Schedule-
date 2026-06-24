"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Mail, Phone, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { coworkerTitleDetails, coworkerTitleValues, type CoworkerTitle } from "@/lib/coworker-titles";

type EmploymentType = "full_time" | "per_diem";
type HomeAssignment = "day_shift" | "night_shift" | "pft" | "pulmonary_rehab" | "flexible";
type PreferredContactMethod = "phone" | "email" | "app";
type DirectoryFilter =
  | "all"
  | "full_time"
  | "per_diem"
  | "day_shift"
  | "night_shift"
  | "pft"
  | "pulmonary_rehab"
  | "flexible"
  | "active"
  | "inactive";

type StaffProfile = {
  id: string;
  department_id: string;
  display_name: string;
  employment_type: EmploymentType;
  home_assignment: HomeAssignment;
  phone_number: string | null;
  email: string | null;
  preferred_contact_method: PreferredContactMethod | null;
  is_active: boolean;
};

type CoworkerTitleRow = {
  id: string;
  target_staff_profile_id: string;
  title: CoworkerTitle;
};

type StaffDirectoryProps = {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
};

const directoryFilters: Array<{ id: DirectoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "full_time", label: "Full-time" },
  { id: "per_diem", label: "Per diem" },
  { id: "day_shift", label: "Day Shift" },
  { id: "night_shift", label: "Night Shift" },
  { id: "pft", label: "PFT" },
  { id: "pulmonary_rehab", label: "Pulmonary Rehab" },
  { id: "flexible", label: "Flexible" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" }
];

const employmentLabels: Record<EmploymentType, string> = {
  full_time: "Full-time",
  per_diem: "Per diem"
};

const assignmentLabels: Record<HomeAssignment, string> = {
  day_shift: "Day Shift",
  night_shift: "Night Shift",
  pft: "PFT",
  pulmonary_rehab: "Pulmonary Rehab",
  flexible: "Flexible"
};

const contactLabels: Record<PreferredContactMethod, string> = {
  phone: "Phone",
  email: "Email",
  app: "App"
};

function formatPhoneHref(phoneNumber: string) {
  const dialable = phoneNumber.replace(/[^\d+]/g, "");
  return dialable ? `tel:${dialable}` : undefined;
}

function DirectoryCard({
  profile,
  assignedTitles,
  onOpenTitles
}: {
  profile: StaffProfile;
  assignedTitles: CoworkerTitle[];
  onOpenTitles?: (profile: StaffProfile) => void;
}) {
  const phoneHref = profile.phone_number ? formatPhoneHref(profile.phone_number) : undefined;
  const assignedTitleLabels = assignedTitles.map((title) => coworkerTitleDetails[title].label).join(", ");

  return (
    <article className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-black leading-6 text-hospital-ink">{profile.display_name}</h3>
          <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
            {employmentLabels[profile.employment_type]} - {assignmentLabels[profile.home_assignment]}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${
            profile.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {profile.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {profile.phone_number && phoneHref && (
          <a
            href={phoneHref}
            className="flex min-h-10 items-center gap-2 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 text-sm font-bold text-cyan-800"
          >
            <Phone size={16} />
            {profile.phone_number}
          </a>
        )}
        {profile.email && (
          <a
            href={`mailto:${profile.email}`}
            className="flex min-h-10 items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold text-slate-700"
          >
            <Mail size={16} />
            {profile.email}
          </a>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {profile.preferred_contact_method && (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-extrabold text-violet-700">
            Prefers {contactLabels[profile.preferred_contact_method]}
          </span>
        )}
        {assignedTitles.map((title) => (
          <span
            key={title}
            title={coworkerTitleDetails[title].label}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-50 text-sm"
          >
            {coworkerTitleDetails[title].icon}
          </span>
        ))}
      </div>

      {onOpenTitles && (
        <button
          type="button"
          onClick={() => onOpenTitles(profile)}
          className="mt-3 min-h-10 w-full rounded-2xl border border-cyan-100 bg-cyan-50 px-3 text-sm font-extrabold text-cyan-700"
        >
          {assignedTitles.length ? `My Titles: ${assignedTitleLabels}` : "Add Coworker Titles"}
        </button>
      )}
    </article>
  );
}

function CoworkerTitleSheet({
  profile,
  draftTitles,
  saving,
  onToggleTitle,
  onCancel,
  onSave
}: {
  profile: StaffProfile;
  draftTitles: CoworkerTitle[];
  saving: boolean;
  onToggleTitle: (title: CoworkerTitle) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );

    document.body.style.overflow = "hidden";
    firstFocusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      );

      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousActiveElement?.focus();
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-slate-950/40 px-3 pb-3 pt-12 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coworker-title-heading"
        aria-describedby="coworker-title-description"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-cyan-100 bg-white p-4 shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Coworker Titles</p>
            <h3 id="coworker-title-heading" className="mt-1 text-2xl font-black text-hospital-ink">
              {profile.display_name}
            </h3>
            <p id="coworker-title-description" className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Private to you. Icons show only on your schedule.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 disabled:opacity-60"
            aria-label="Close coworker titles"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          {coworkerTitleValues.map((title) => {
            const selected = draftTitles.includes(title);
            const details = coworkerTitleDetails[title];

            return (
              <button
                key={title}
                type="button"
                onClick={() => onToggleTitle(title)}
                aria-pressed={selected}
                className={`flex min-h-12 items-center justify-between rounded-2xl border px-3 text-left text-sm font-extrabold transition ${
                  selected
                    ? "border-cyan-300 bg-cyan-50 text-cyan-900 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-base shadow-sm">
                    {details.icon}
                  </span>
                  <span className="min-w-0">{details.label}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs uppercase tracking-wide ${
                    selected ? "bg-cyan-700 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {selected ? "Selected" : "Tap"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Titles"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function StaffDirectory({ authContext, developmentFallback }: StaffDirectoryProps) {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(!developmentFallback);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [directoryFilter, setDirectoryFilter] = useState<DirectoryFilter>("all");
  const [coworkerTitles, setCoworkerTitles] = useState<Record<string, CoworkerTitle[]>>({});
  const [titleProfile, setTitleProfile] = useState<StaffProfile | null>(null);
  const [titleDraft, setTitleDraft] = useState<CoworkerTitle[]>([]);
  const [titleSaving, setTitleSaving] = useState(false);
  const canEdit = authContext.role === "admin" && !developmentFallback;

  const loadProfiles = useCallback(async () => {
    if (developmentFallback) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("staff_profiles")
      .select("id, department_id, display_name, employment_type, home_assignment, phone_number, email, preferred_contact_method, is_active")
      .eq("department_id", authContext.departmentId)
      .order("display_name", { ascending: true });

    if (loadError) {
      setError("Unable to load Staff Directory.");
      setProfiles([]);
    } else {
      setProfiles((data ?? []) as unknown as StaffProfile[]);
    }

    if (!loadError && authContext.staffProfileId) {
      const { data: titleData, error: titleError } = await supabase
        .from("coworker_titles")
        .select("id, target_staff_profile_id, title")
        .eq("department_id", authContext.departmentId)
        .eq("owner_staff_profile_id", authContext.staffProfileId);

      if (titleError) {
        setError("Staff Directory loaded, but coworker titles could not be loaded.");
        setCoworkerTitles({});
      } else {
        const nextTitles: Record<string, CoworkerTitle[]> = {};
        ((titleData ?? []) as CoworkerTitleRow[]).forEach((row) => {
          nextTitles[row.target_staff_profile_id] = [
            ...(nextTitles[row.target_staff_profile_id] ?? []),
            row.title
          ];
        });
        setCoworkerTitles(nextTitles);
      }
    } else if (!authContext.staffProfileId) {
      setCoworkerTitles({});
    }

    setLoading(false);
  }, [authContext.departmentId, authContext.staffProfileId, developmentFallback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfiles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProfiles]);

  const filterDirectoryProfiles = useCallback((profile: StaffProfile, selectedFilter: DirectoryFilter) => {
    if (selectedFilter === "all") {
      return true;
    }

    if (selectedFilter === "active") {
      return profile.is_active;
    }

    if (selectedFilter === "inactive") {
      return !profile.is_active;
    }

    return profile.employment_type === selectedFilter || profile.home_assignment === selectedFilter;
  }, []);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => filterDirectoryProfiles(profile, directoryFilter));
  }, [profiles, directoryFilter, filterDirectoryProfiles]);

  const openTitlePanel = (profile: StaffProfile) => {
    if (!authContext.staffProfileId) {
      setError("Your account is not linked to a staff profile yet.");
      return;
    }

    if (profile.id === authContext.staffProfileId) {
      setError("Coworker titles are for other staff members.");
      return;
    }

    setTitleProfile(profile);
    setTitleDraft(coworkerTitles[profile.id] ?? []);
    setSuccess("");
    setError("");
  };

  const toggleDraftTitle = (title: CoworkerTitle) => {
    setTitleDraft((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title]
    );
  };

  const closeTitleSheet = useCallback(() => {
    setTitleProfile(null);
    setTitleDraft([]);
  }, []);

  const saveCoworkerTitles = async () => {
    if (!titleProfile || !authContext.staffProfileId) {
      setError("Your account is not linked to a staff profile yet.");
      return;
    }

    if (titleProfile.id === authContext.staffProfileId) {
      setError("Coworker titles cannot be assigned to yourself.");
      return;
    }

    setTitleSaving(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const existingTitles = coworkerTitles[titleProfile.id] ?? [];
    const titlesToDelete = existingTitles.filter((title) => !titleDraft.includes(title));
    const titlesToInsert = titleDraft.filter((title) => !existingTitles.includes(title));

    if (titlesToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("coworker_titles")
        .delete()
        .eq("department_id", authContext.departmentId)
        .eq("owner_staff_profile_id", authContext.staffProfileId)
        .eq("target_staff_profile_id", titleProfile.id)
        .in("title", titlesToDelete);

      if (deleteError) {
        setTitleSaving(false);
        setError("Unable to remove coworker titles.");
        return;
      }
    }

    if (titlesToInsert.length > 0) {
      const { error: insertError } = await supabase.from("coworker_titles").insert(
        titlesToInsert.map((title) => ({
          department_id: authContext.departmentId,
          owner_staff_profile_id: authContext.staffProfileId,
          target_staff_profile_id: titleProfile.id,
          title
        }))
      );

      if (insertError) {
        setTitleSaving(false);
        setError("Unable to save coworker titles.");
        return;
      }
    }

    setCoworkerTitles((current) => ({
      ...current,
      [titleProfile.id]: titleDraft
    }));
    setTitleSaving(false);
    setTitleProfile(null);
    setTitleDraft([]);
    setSuccess("Coworker titles saved.");
  };

  if (developmentFallback) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-soft">
        <h2 className="text-xl font-black text-amber-950">Staff Directory</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-amber-900">
          Supabase is not configured locally, so the real Staff Directory is unavailable in this development session.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
              {authContext.departmentName}
            </p>
            <h2 className="mt-1 text-2xl font-black text-hospital-ink">Staff Directory</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Department contacts are visible only to authenticated department users.
            </p>
          </div>
          {canEdit && (
            <Link
              href="/admin/roster"
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 px-3 text-xs font-extrabold text-cyan-700"
            >
              Admin Roster Management
            </Link>
          )}
        </div>

        {authContext.role !== "admin" && (
          <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
            Staff self-edit is planned for a later phase.
          </p>
        )}

        <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {directoryFilters.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setDirectoryFilter(option.id)}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold ${
                directoryFilter === option.id
                  ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-xl rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 shadow-soft"
        >
          {success}
        </p>
      )}

      {titleProfile && (
        <CoworkerTitleSheet
          profile={titleProfile}
          draftTitles={titleDraft}
          saving={titleSaving}
          onToggleTitle={toggleDraftTitle}
          onCancel={closeTitleSheet}
          onSave={() => void saveCoworkerTitles()}
        />
      )}

      {loading && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">Loading Staff Directory...</p>
        </section>
      )}

      {!loading && profiles.length === 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">No staff profiles have been added yet.</p>
        </section>
      )}

      {!loading && profiles.length > 0 && filteredProfiles.length === 0 && (
        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <p className="text-sm font-bold text-slate-500">No staff profiles match this filter.</p>
        </section>
      )}

      <div className="grid gap-3">
        {filteredProfiles.map((profile) => (
          <DirectoryCard
            key={profile.id}
            profile={profile}
            assignedTitles={coworkerTitles[profile.id] ?? []}
            onOpenTitles={
              authContext.staffProfileId && authContext.staffProfileId !== profile.id
                ? openTitlePanel
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
