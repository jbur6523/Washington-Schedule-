"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, UserRoundCheck, X } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { generateBaseUsername, normalizeUsername } from "@/lib/auth/username";
import { createClient } from "@/lib/supabase/client";

type EmploymentType = "full_time" | "per_diem";
type HomeAssignment = "day_shift" | "night_shift" | "pft" | "pulmonary_rehab" | "rt_aide" | "flexible";
type PreferredContactMethod = "phone" | "email" | "app";
type StaffRole = "admin" | "lead" | "staff";
type OperationsRole = "none" | "aide";
type RosterFilter =
  | "all"
  | "admin"
  | "lead"
  | "staff"
  | "aide"
  | "claimed"
  | "unclaimed"
  | "active"
  | "inactive"
  | "full_time"
  | "per_diem"
  | "day_shift"
  | "night_shift"
  | "pft"
  | "pulmonary_rehab"
  | "rt_aide"
  | "flexible";

type StaffProfile = {
  id: string;
  department_id: string;
  profile_id: string | null;
  auth_user_id: string | null;
  display_name: string;
  username: string | null;
  username_normalized: string | null;
  assigned_role: StaffRole;
  operations_role: OperationsRole;
  employment_type: EmploymentType;
  home_assignment: HomeAssignment;
  phone_number: string | null;
  email: string | null;
  preferred_contact_method: PreferredContactMethod | null;
  is_active: boolean;
  account_claimed_at: string | null;
};

type StaffProfileForm = {
  id?: string;
  display_name: string;
  username: string;
  username_normalized: string;
  assigned_role: StaffRole;
  operations_role: OperationsRole;
  employment_type: EmploymentType;
  home_assignment: HomeAssignment;
  phone_number: string;
  email: string;
  preferred_contact_method: PreferredContactMethod | "";
  is_active: boolean;
  account_claimed_at?: string | null;
};

type BatchRosterRow = {
  lineNumber: number;
  display_name: string;
  employment_type: EmploymentType | "";
  home_assignment: HomeAssignment | "";
  username: string;
  username_normalized: string;
  assigned_role: StaffRole;
  status: "ready" | "needs_review";
  issue: string;
};

type PhonePreloadRow = {
  lineNumber: number;
  username: string;
  username_normalized: string;
  phone_number: string;
  matchedProfileId: string | null;
  matchedStaffName: string;
  existingPhoneNumber: string | null;
  status: "ready" | "needs_review" | "not_found";
  issue: string;
};

type AdminRosterManagementProps = {
  authContext: AuthenticatedUserContext;
};

const emptyForm: StaffProfileForm = {
  display_name: "",
  username: "",
  username_normalized: "",
  assigned_role: "staff",
  operations_role: "none",
  employment_type: "full_time",
  home_assignment: "day_shift",
  phone_number: "",
  email: "",
  preferred_contact_method: "",
  is_active: true
};

const rosterFilters: Array<{ id: RosterFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "admin", label: "Admin" },
  { id: "lead", label: "Lead" },
  { id: "staff", label: "Staff" },
  { id: "aide", label: "Aide" },
  { id: "claimed", label: "Claimed" },
  { id: "unclaimed", label: "Unclaimed" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "full_time", label: "Full-time" },
  { id: "per_diem", label: "Per diem" },
  { id: "day_shift", label: "Day Shift" },
  { id: "night_shift", label: "Night Shift" },
  { id: "pft", label: "PFT" },
  { id: "pulmonary_rehab", label: "Pulmonary Rehab" },
  { id: "rt_aide", label: "RT Aide" },
  { id: "flexible", label: "Flexible" }
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
  rt_aide: "RT Aide",
  flexible: "Flexible"
};

const roleLabels: Record<StaffRole, string> = {
  admin: "Admin",
  lead: "Lead",
  staff: "Staff"
};

const operationsRoleLabels: Record<OperationsRole, string> = {
  none: "None",
  aide: "Aide Dashboard"
};

const leadDisplayNames = new Set([
  "allantimbang",
  "jonathanburdick",
  "heatherheath",
  "tomnguyen",
  "winhlaing",
  "beiyi",
  "katrynavuong",
  "joanndevera",
  "victordavis",
  "jeanrodrillo",
  "genebenoza",
  "stephanieortiz"
]);

function normalizeName(value: string) {
  return normalizeUsername(value);
}

function normalizeOptional(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isValidPreloadPhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  return Boolean(trimmed) && trimmed.toUpperCase() !== "VERIFY" && digits.length >= 7;
}

function roleForStaff(displayName: string, username: string): StaffRole {
  const normalizedName = normalizeName(displayName);

  if (username === "burj" && normalizedName === "jonathanburdick") {
    return "admin";
  }

  return leadDisplayNames.has(normalizedName) ? "lead" : "staff";
}

function nextAvailableUsername(displayName: string, profiles: StaffProfile[], excludeProfileId?: string) {
  const base = generateBaseUsername(displayName);
  const existing = new Set(
    profiles
      .filter((profile) => profile.id !== excludeProfileId)
      .map((profile) => profile.username_normalized)
      .filter((username): username is string => Boolean(username))
  );

  if (!existing.has(base)) {
    return base;
  }

  let index = 2;
  while (existing.has(`${base}${index}`)) {
    index += 1;
  }

  return `${base}${index}`;
}

function profileToForm(profile: StaffProfile): StaffProfileForm {
  return {
    id: profile.id,
    display_name: profile.display_name,
    username: profile.username ?? profile.username_normalized ?? "",
    username_normalized: profile.username_normalized ?? normalizeUsername(profile.username ?? ""),
    assigned_role: profile.assigned_role,
    operations_role: profile.operations_role ?? "none",
    employment_type: profile.employment_type,
    home_assignment: profile.home_assignment,
    phone_number: profile.phone_number ?? "",
    email: profile.email ?? "",
    preferred_contact_method: profile.preferred_contact_method ?? "",
    is_active: profile.is_active,
    account_claimed_at: profile.account_claimed_at
  };
}

function StaffProfileEditor({
  form,
  saving,
  onChange,
  onCancel,
  onSubmit,
  onResetAccount,
  onRegenerateUsername
}: {
  form: StaffProfileForm;
  saving: boolean;
  onChange: (form: StaffProfileForm) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResetAccount: () => void;
  onRegenerateUsername: () => void;
}) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const isBurj = form.username_normalized === "burj";
  const canRegenerateUsername = !form.account_claimed_at;
  const canSave = Boolean(form.display_name.trim() && form.username_normalized && form.employment_type && form.home_assignment);
  const closeEditor = useCallback(() => {
    if (!saving) {
      onCancel();
    }
  }, [onCancel, saving]);

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
        closeEditor();
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
  }, [closeEditor]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-slate-950/40 px-3 pb-3 pt-12 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
      role="presentation"
      onMouseDown={closeEditor}
    >
      <form
        ref={dialogRef}
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-profile-editor-heading"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-cyan-100 bg-white p-4 shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
              {form.id ? "Editing profile" : "New staff profile"}
            </p>
            <h2 id="staff-profile-editor-heading" className="mt-1 text-xl font-black text-hospital-ink">
              {form.id ? form.display_name || "Edit Staff Profile" : "Add Staff Profile"}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeEditor}
            disabled={saving}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 disabled:opacity-60"
            aria-label="Close staff profile editor"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Staff name</span>
            <input
              value={form.display_name}
              onChange={(event) => onChange({ ...form, display_name: event.target.value })}
              required
              className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
          </label>

          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Assigned username</span>
            <input
              value={form.username}
              readOnly
              className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black lowercase text-hospital-ink outline-none"
            />
          </label>
          {canRegenerateUsername && (
            <button
              type="button"
              onClick={onRegenerateUsername}
              className="min-h-10 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 text-sm font-extrabold text-cyan-700"
            >
              Regenerate Username
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Employment</span>
              <select
                value={form.employment_type}
                onChange={(event) => onChange({ ...form, employment_type: event.target.value as EmploymentType })}
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              >
                <option value="full_time">Full-time</option>
                <option value="per_diem">Per diem</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Assignment</span>
              <select
                value={form.home_assignment}
                onChange={(event) => onChange({ ...form, home_assignment: event.target.value as HomeAssignment })}
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              >
                <option value="day_shift">Day Shift</option>
                <option value="night_shift">Night Shift</option>
                <option value="pft">PFT</option>
                <option value="pulmonary_rehab">Pulmonary Rehab</option>
                <option value="rt_aide">RT Aide</option>
                <option value="flexible">Flexible</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Role</span>
            {isBurj ? (
              <input
                value="Admin"
                readOnly
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-hospital-ink outline-none"
              />
            ) : (
              <select
                value={form.assigned_role === "admin" ? "staff" : form.assigned_role}
                onChange={(event) => onChange({ ...form, assigned_role: event.target.value as StaffRole })}
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              >
                <option value="staff">Staff</option>
                <option value="lead">Lead</option>
              </select>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Operations dashboard</span>
            <select
              value={form.operations_role}
              onChange={(event) => onChange({ ...form, operations_role: event.target.value as OperationsRole })}
              className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
            >
              <option value="none">None</option>
              <option value="aide">Aide Dashboard</option>
            </select>
            <span className="mt-1 block text-xs font-bold text-slate-400">
              Admin and Lead dashboards come from the main role. Use Aide Dashboard for aide access.
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Phone number</span>
            <input
              type="tel"
              value={form.phone_number}
              onChange={(event) => onChange({ ...form, phone_number: event.target.value })}
              className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
          </label>

          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange({ ...form, email: event.target.value })}
              className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Preferred</span>
              <select
                value={form.preferred_contact_method}
                onChange={(event) =>
                  onChange({ ...form, preferred_contact_method: event.target.value as PreferredContactMethod | "" })
                }
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              >
                <option value="">None</option>
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="app">App</option>
              </select>
            </label>
            <label className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 pb-3 text-sm font-extrabold text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => onChange({ ...form, is_active: event.target.checked })}
                className="h-4 w-4"
              />
              Active
            </label>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={closeEditor}
            disabled={saving}
            className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !canSave}
            className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>

        {form.id && (
          <button
            type="button"
            onClick={onResetAccount}
            disabled={saving}
            className="mt-2 min-h-11 w-full rounded-2xl border border-rose-100 bg-rose-50 px-3 text-sm font-extrabold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset / Unclaim Account
          </button>
        )}
      </form>
    </div>
  );
}

function AdminRosterCard({ profile, onEdit }: { profile: StaffProfile; onEdit: (profile: StaffProfile) => void }) {
  const claimedDate = profile.account_claimed_at ? new Date(profile.account_claimed_at).toLocaleDateString() : "";

  return (
    <article className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-black leading-6 text-hospital-ink">{profile.display_name}</h3>
          <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
            {employmentLabels[profile.employment_type]} - {assignmentLabels[profile.home_assignment]}
          </p>
          <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-cyan-700">
            Username: {profile.username ?? profile.username_normalized ?? "Unassigned"}
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-600">
          {roleLabels[profile.assigned_role]}
        </span>
        {profile.operations_role === "aide" && (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-extrabold text-violet-700">
            {operationsRoleLabels[profile.operations_role]}
          </span>
        )}
        {profile.account_claimed_at ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-extrabold text-cyan-700">
            <UserRoundCheck size={13} />
            Claimed{claimedDate ? ` ${claimedDate}` : ""}
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-700">
            Unclaimed
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onEdit(profile)}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700"
      >
        <Pencil size={15} />
        Edit Profile
      </button>
    </article>
  );
}

export function AdminRosterManagement({ authContext }: AdminRosterManagementProps) {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<RosterFilter>("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<StaffProfileForm | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchRows, setBatchRows] = useState<BatchRosterRow[]>([]);
  const [phonePreloadOpen, setPhonePreloadOpen] = useState(false);
  const [phonePreloadText, setPhonePreloadText] = useState("");
  const [phonePreloadRows, setPhonePreloadRows] = useState<PhonePreloadRow[]>([]);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("staff_profiles")
      .select("id, department_id, profile_id, auth_user_id, display_name, username, username_normalized, assigned_role, operations_role, employment_type, home_assignment, phone_number, email, preferred_contact_method, is_active, account_claimed_at")
      .eq("department_id", authContext.departmentId)
      .order("display_name", { ascending: true });

    if (loadError) {
      setError("Unable to load roster profiles.");
      setProfiles([]);
    } else {
      setProfiles((data ?? []) as unknown as StaffProfile[]);
    }

    setLoading(false);
  }, [authContext.departmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfiles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProfiles]);

  const filteredProfiles = useMemo(() => {
    const normalizedSearch = normalizeName(search);

    return profiles.filter((profile) => {
      const matchesSearch =
        !normalizedSearch ||
        normalizeName(profile.display_name).includes(normalizedSearch) ||
        normalizeUsername(profile.username ?? "").includes(normalizedSearch);

      if (!matchesSearch) {
        return false;
      }

      if (selectedFilter === "all") {
        return true;
      }

      if (selectedFilter === "admin" || selectedFilter === "lead" || selectedFilter === "staff") {
        return profile.assigned_role === selectedFilter;
      }

      if (selectedFilter === "aide") {
        return profile.operations_role === "aide";
      }

      if (selectedFilter === "claimed") {
        return Boolean(profile.account_claimed_at);
      }

      if (selectedFilter === "unclaimed") {
        return !profile.account_claimed_at;
      }

      if (selectedFilter === "active") {
        return profile.is_active;
      }

      if (selectedFilter === "inactive") {
        return !profile.is_active;
      }

      return profile.employment_type === selectedFilter || profile.home_assignment === selectedFilter;
    });
  }, [profiles, search, selectedFilter]);

  const updateForm = (nextForm: StaffProfileForm) => {
    if (nextForm.id) {
      setForm(nextForm);
      return;
    }

    const username = nextAvailableUsername(nextForm.display_name, profiles);
    setForm({
      ...nextForm,
      username,
      username_normalized: normalizeUsername(username),
      assigned_role: roleForStaff(nextForm.display_name, username)
    });
  };

  const startCreate = () => {
    setForm(emptyForm);
    setBatchOpen(false);
    setPhonePreloadOpen(false);
    setSuccess("");
    setError("");
  };

  const startBatch = () => {
    setBatchOpen((current) => !current);
    setForm(null);
    setPhonePreloadOpen(false);
    setSuccess("");
    setError("");
  };

  const startPhonePreload = () => {
    setPhonePreloadOpen((current) => !current);
    setForm(null);
    setBatchOpen(false);
    setSuccess("");
    setError("");
  };

  const closeForm = useCallback(() => {
    setForm(null);
  }, []);

  const regenerateUsername = () => {
    if (!form || form.account_claimed_at) {
      return;
    }

    const username = nextAvailableUsername(form.display_name, profiles, form.id);
    setForm({
      ...form,
      username,
      username_normalized: normalizeUsername(username),
      assigned_role: roleForStaff(form.display_name, username)
    });
  };

  const parseBatchRows = () => {
    const existingNames = new Set(profiles.map((profile) => normalizeName(profile.display_name)));
    const usedUsernames = new Set(
      profiles
        .map((profile) => profile.username_normalized)
        .filter((username): username is string => Boolean(username))
    );
    const seenNames = new Set<string>();
    const parsed = batchText
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
      .filter(({ line }) => Boolean(line))
      .map(({ line, lineNumber }) => {
        const [rawName = "", rawEmployment = "", rawAssignment = ""] = line.split("|").map((part) => part.trim());
        const displayName = rawName;
        const employmentType = rawEmployment as EmploymentType;
        const homeAssignment = rawAssignment as HomeAssignment;
        const normalizedName = normalizeName(displayName);
        const username = nextAvailableUsername(displayName, [
          ...profiles,
          ...Array.from(usedUsernames).map((usernameValue) => ({
            id: usernameValue,
            department_id: authContext.departmentId,
            profile_id: null,
            auth_user_id: null,
            display_name: usernameValue,
            username: usernameValue,
            username_normalized: usernameValue,
            assigned_role: "staff" as StaffRole,
            operations_role: "none" as OperationsRole,
            employment_type: "full_time" as EmploymentType,
            home_assignment: "flexible" as HomeAssignment,
            phone_number: null,
            email: null,
            preferred_contact_method: null,
            is_active: true,
            account_claimed_at: null
          }))
        ]);
        const usernameNormalized = normalizeUsername(username);
        const issues: string[] = [];

        if (!displayName) {
          issues.push("Missing display name");
        }

        if (!["full_time", "per_diem"].includes(employmentType)) {
          issues.push("Employment type must be full_time or per_diem");
        }

        if (!["day_shift", "night_shift", "pft", "pulmonary_rehab", "rt_aide", "flexible"].includes(homeAssignment)) {
          issues.push("Home assignment is invalid");
        }

        if (existingNames.has(normalizedName) || seenNames.has(normalizedName)) {
          issues.push("Possible duplicate name");
        }

        if (usedUsernames.has(usernameNormalized)) {
          issues.push("Possible duplicate username");
        }

        seenNames.add(normalizedName);
        usedUsernames.add(usernameNormalized);

        return {
          lineNumber,
          display_name: displayName,
          employment_type: ["full_time", "per_diem"].includes(employmentType) ? employmentType : "",
          home_assignment: ["day_shift", "night_shift", "pft", "pulmonary_rehab", "rt_aide", "flexible"].includes(homeAssignment)
            ? homeAssignment
            : "",
          username,
          username_normalized: usernameNormalized,
          assigned_role: roleForStaff(displayName, username),
          status: issues.length ? "needs_review" : "ready",
          issue: issues.join("; ")
        } satisfies BatchRosterRow;
      });

    setBatchRows(parsed);
    setSuccess("");
    setError("");
  };

  const createBatchRows = async () => {
    if (batchRows.length === 0 || batchRows.some((row) => row.status !== "ready")) {
      setError("Preview and review batch rows before creating profiles.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const response = await fetch("/api/admin/staff-profiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        profiles: batchRows.map((row) => ({
          department_id: authContext.departmentId,
          display_name: row.display_name,
          username: row.username,
          username_normalized: row.username_normalized,
          assigned_role: row.assigned_role,
          operations_role: "none",
          employment_type: row.employment_type,
          home_assignment: row.home_assignment,
          preferred_contact_method: "app",
          is_active: true
        }))
      })
    });
    const result = await response.json().catch(() => null);

    setSaving(false);

    if (!response.ok) {
      setError(result?.message ?? "Unable to create batch roster profiles.");
      return;
    }

    setBatchText("");
    setBatchRows([]);
    setBatchOpen(false);
    setSuccess("Batch roster profiles created.");
    await loadProfiles();
  };

  const parsePhonePreloadRows = () => {
    const profileByUsername = new Map(
      profiles
        .filter((profile) => profile.username_normalized)
        .map((profile) => [profile.username_normalized as string, profile])
    );
    const parsed = phonePreloadText
      .split(/\r?\n/)
      .map((line, index) => ({
        line: line.split("#")[0]?.trim() ?? "",
        lineNumber: index + 1
      }))
      .filter(({ line }) => Boolean(line))
      .map(({ line, lineNumber }) => {
        const parts = line.split("|").map((part) => part.trim());
        const rawUsername = parts[0] ?? "";
        const phoneNumber = parts[1] ?? "";
        const usernameNormalized = normalizeUsername(rawUsername);
        const matchedProfile = usernameNormalized ? profileByUsername.get(usernameNormalized) ?? null : null;
        const issues: string[] = [];

        if (!usernameNormalized) {
          issues.push("Missing username");
        }

        if (!phoneNumber || phoneNumber.toUpperCase() === "VERIFY" || !isValidPreloadPhone(phoneNumber)) {
          issues.push("Phone needs review");
        }

        if (!matchedProfile) {
          return {
            lineNumber,
            username: rawUsername,
            username_normalized: usernameNormalized,
            phone_number: phoneNumber,
            matchedProfileId: null,
            matchedStaffName: "",
            existingPhoneNumber: null,
            status: "not_found",
            issue: issues.length ? `${issues.join("; ")}; username not found` : "Username not found"
          } satisfies PhonePreloadRow;
        }

        return {
          lineNumber,
          username: rawUsername,
          username_normalized: usernameNormalized,
          phone_number: phoneNumber,
          matchedProfileId: matchedProfile.id,
          matchedStaffName: matchedProfile.display_name,
          existingPhoneNumber: matchedProfile.phone_number,
          status: issues.length ? "needs_review" : "ready",
          issue: issues.join("; ")
        } satisfies PhonePreloadRow;
      });

    setPhonePreloadRows(parsed);
    setSuccess("");
    setError("");
  };

  const confirmPhonePreload = async () => {
    const readyRows = phonePreloadRows.filter((row) => row.status === "ready" && row.matchedProfileId);

    if (readyRows.length === 0) {
      setError("No ready phone rows to save.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const response = await fetch("/api/admin/phone-preload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        rows: readyRows.map((row) => ({
          staffProfileId: row.matchedProfileId,
          phoneNumber: row.phone_number.trim()
        }))
      })
    });
    const result = await response.json().catch(() => null);

    setSaving(false);

    if (!response.ok) {
      setError(result?.message ?? "Unable to preload phone numbers.");
      return;
    }

    const updated = Number(result?.updated ?? 0);
    const skipped = phonePreloadRows.length - updated;
    setSuccess(`Phone preload complete. ${updated} saved, ${skipped} skipped.`);
    setPhonePreloadText("");
    setPhonePreloadRows([]);
    await loadProfiles();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const finalUsername = form.username_normalized
      ? form.username
      : nextAvailableUsername(form.display_name, profiles, form.id);
    const finalUsernameNormalized = normalizeUsername(finalUsername);
    const assignedRole: StaffRole =
      finalUsernameNormalized === "burj"
        ? "admin"
        : form.assigned_role === "admin"
          ? "staff"
          : form.id
            ? form.assigned_role
            : roleForStaff(form.display_name, finalUsernameNormalized);
    const payload = {
      department_id: authContext.departmentId,
      display_name: form.display_name.trim(),
      username: finalUsername,
      username_normalized: finalUsernameNormalized,
      assigned_role: assignedRole,
      operations_role: form.operations_role,
      employment_type: form.employment_type,
      home_assignment: form.home_assignment,
      phone_number: normalizeOptional(form.phone_number),
      email: normalizeOptional(form.email),
      preferred_contact_method: form.preferred_contact_method || null,
      is_active: form.is_active
    };
    const response = await fetch(form.id ? `/api/admin/staff-profiles/${form.id}` : "/api/admin/staff-profiles", {
      method: form.id ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);

    setSaving(false);

    if (!response.ok) {
      setError(result?.message ?? "Unable to save staff profile.");
      return;
    }

    setForm(null);
    setSuccess(form.id ? "Staff profile updated." : "Staff profile created.");
    await loadProfiles();
  };

  const resetAccount = async () => {
    if (!form?.id) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const response = await fetch(`/api/admin/staff-profiles/${form.id}/reset-account`, {
      method: "POST"
    });
    const result = await response.json().catch(() => null);

    setSaving(false);

    if (!response.ok) {
      setError(result?.message ?? "Unable to reset account.");
      return;
    }

    setForm(null);
    setSuccess("Account reset. The assigned username can be claimed again.");
    await loadProfiles();
  };

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
          <Link href="/admin" className="inline-flex items-center gap-2 text-xs font-extrabold text-cyan-700">
            <ArrowLeft size={15} />
            Back to Admin
          </Link>
          <p className="mt-4 text-xs font-extrabold uppercase tracking-wide text-cyan-700">
            {authContext.departmentName}
          </p>
          <h1 className="mt-1 text-2xl font-black text-hospital-ink">Roster Management</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Add, edit, activate, deactivate, and reset staff accounts from one admin-only page.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white"
            >
              <Plus size={16} />
              Add Staff
            </button>
            <button
              type="button"
              onClick={startBatch}
              className="min-h-11 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 text-sm font-extrabold text-cyan-700"
            >
              Batch Add
            </button>
            <button
              type="button"
              onClick={startPhonePreload}
              className="min-h-11 rounded-2xl border border-violet-100 bg-violet-50 px-3 text-sm font-extrabold text-violet-700"
            >
              Phone Preload
            </button>
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="fixed inset-x-3 bottom-24 z-[60] mx-auto max-w-xl rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 shadow-soft"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="fixed inset-x-3 bottom-24 z-[60] mx-auto max-w-xl rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 shadow-soft"
          >
            {success}
          </p>
        )}

        {form && (
          <StaffProfileEditor
            form={form}
            saving={saving}
            onChange={updateForm}
            onCancel={closeForm}
            onSubmit={handleSubmit}
            onResetAccount={resetAccount}
            onRegenerateUsername={regenerateUsername}
          />
        )}

        {batchOpen && (
          <section className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Batch Add Roster</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Paste one staff member per line using: Name | employment_type | home_assignment
            </p>
            <textarea
              value={batchText}
              onChange={(event) => setBatchText(event.target.value)}
              placeholder={"Allan Timbang | full_time | day_shift\nJoann Devera | full_time | night_shift\nMona Ahmed | per_diem | day_shift"}
              className="mt-3 min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={parseBatchRows}
                className="min-h-11 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 text-sm font-extrabold text-cyan-700"
              >
                Preview Rows
              </button>
              <button
                type="button"
                onClick={createBatchRows}
                disabled={saving || batchRows.length === 0 || batchRows.some((row) => row.status !== "ready")}
                className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Profiles"}
              </button>
            </div>

            {batchRows.length > 0 && (
              <div className="mt-4 space-y-2">
                {batchRows.map((row) => (
                  <div
                    key={`${row.lineNumber}-${row.display_name}`}
                    className={`rounded-2xl border px-3 py-2 ${
                      row.status === "ready" ? "border-emerald-100 bg-emerald-50" : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-hospital-ink">{row.display_name || "Missing name"}</p>
                        <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                          {row.employment_type || "invalid"} - {row.home_assignment || "invalid"}
                        </p>
                        <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-cyan-700">
                          {row.username} - {roleLabels[row.assigned_role]}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-xs font-extrabold ${
                          row.status === "ready" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {row.status === "ready" ? "Ready" : "Needs Review"}
                      </span>
                    </div>
                    {row.issue && <p className="mt-2 text-xs font-bold leading-5 text-amber-900">{row.issue}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {phonePreloadOpen && (
          <section className="rounded-3xl border border-violet-100 bg-white/95 p-4 shadow-soft">
            <h2 className="text-lg font-black text-hospital-ink">Phone Number Preload</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Paste username and phone number rows. Phone numbers stay hidden from the normal Staff Directory until that account is claimed.
            </p>
            <p className="mt-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-bold leading-5 text-violet-900">
              Format: username | phone_number. Comments after # are ignored.
            </p>
            <textarea
              value={phonePreloadText}
              onChange={(event) => setPhonePreloadText(event.target.value)}
              placeholder={"burj | 510-555-0101 # Jonathan Burdick\njesr | VERIFY # Needs review\nkhek | 510-555-0112 # Pawanjit/Kinty Khera"}
              className="mt-3 min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-hospital-ink outline-none focus:border-violet-300"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={parsePhonePreloadRows}
                className="min-h-11 rounded-2xl border border-violet-100 bg-violet-50 px-3 text-sm font-extrabold text-violet-700"
              >
                Preview Phones
              </button>
              <button
                type="button"
                onClick={confirmPhonePreload}
                disabled={saving || phonePreloadRows.every((row) => row.status !== "ready")}
                className="min-h-11 rounded-2xl bg-violet-700 px-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Confirm Phone Preload"}
              </button>
            </div>

            {phonePreloadRows.length > 0 && (
              <div className="mt-4 space-y-2">
                {phonePreloadRows.map((row) => (
                  <div
                    key={`${row.lineNumber}-${row.username}`}
                    className={`rounded-2xl border px-3 py-2 ${
                      row.status === "ready"
                        ? "border-emerald-100 bg-emerald-50"
                        : row.status === "not_found"
                          ? "border-rose-100 bg-rose-50"
                          : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-hospital-ink">{row.username || "Missing username"}</p>
                        <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                          {row.matchedStaffName || "No staff match"}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-700">
                          {row.phone_number || "No phone number"}
                        </p>
                        {row.status === "ready" && row.existingPhoneNumber && (
                          <p className="mt-1 text-xs font-bold text-violet-800">
                            Existing number will be replaced.
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-xs font-extrabold ${
                          row.status === "ready"
                            ? "bg-emerald-100 text-emerald-700"
                            : row.status === "not_found"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {row.status === "ready"
                          ? "Ready"
                          : row.status === "not_found"
                            ? "Username not found"
                            : "Needs Review"}
                      </span>
                    </div>
                    {row.issue && <p className="mt-2 text-xs font-bold leading-5 text-slate-700">{row.issue}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
          <div className="grid gap-3">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Search roster</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name or username"
                className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
              />
            </label>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {rosterFilters.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedFilter(option.id)}
                  className={`shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold ${
                    selectedFilter === option.id
                      ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {loading && (
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <p className="text-sm font-bold text-slate-500">Loading roster...</p>
          </section>
        )}

        {!loading && filteredProfiles.length === 0 && (
          <section className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
            <p className="text-sm font-bold text-slate-500">No roster profiles match this view.</p>
          </section>
        )}

        <div className="grid gap-3">
          {filteredProfiles.map((profile) => (
            <AdminRosterCard
              key={profile.id}
              profile={profile}
              onEdit={(selectedProfile) => {
                setForm(profileToForm(selectedProfile));
                setBatchOpen(false);
                setSuccess("");
                setError("");
              }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
