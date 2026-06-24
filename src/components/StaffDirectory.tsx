"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Mail, Pencil, Phone, Plus, UserRoundCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { generateBaseUsername, normalizeUsername } from "@/lib/auth/username";

type EmploymentType = "full_time" | "per_diem";
type HomeAssignment = "day_shift" | "night_shift" | "pft" | "pulmonary_rehab" | "flexible";
type PreferredContactMethod = "phone" | "email" | "app";
type StaffRole = "admin" | "lead" | "staff";
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
  profile_id: string | null;
  auth_user_id: string | null;
  display_name: string;
  username: string | null;
  username_normalized: string | null;
  assigned_role: StaffRole;
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
  employment_type: EmploymentType;
  home_assignment: HomeAssignment;
  phone_number: string;
  email: string;
  preferred_contact_method: PreferredContactMethod | "";
  is_active: boolean;
};

type StaffDirectoryProps = {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
};

const emptyForm: StaffProfileForm = {
  display_name: "",
  username: "",
  username_normalized: "",
  assigned_role: "staff",
  employment_type: "full_time",
  home_assignment: "day_shift",
  phone_number: "",
  email: "",
  preferred_contact_method: "",
  is_active: true
};

const filters: Array<{ id: DirectoryFilter; label: string }> = [
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

const roleLabels: Record<StaffRole, string> = {
  admin: "Admin",
  lead: "Lead",
  staff: "Staff"
};

function formatPhoneHref(phoneNumber: string) {
  const dialable = phoneNumber.replace(/[^\d+]/g, "");
  return dialable ? `tel:${dialable}` : undefined;
}

function normalizeOptional(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nextAvailableUsername(displayName: string, profiles: StaffProfile[]) {
  const base = generateBaseUsername(displayName);
  const existing = new Set(
    profiles
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
    employment_type: profile.employment_type,
    home_assignment: profile.home_assignment,
    phone_number: profile.phone_number ?? "",
    email: profile.email ?? "",
    preferred_contact_method: profile.preferred_contact_method ?? "",
    is_active: profile.is_active
  };
}

function DirectoryCard({
  profile,
  canEdit,
  onEdit
}: {
  profile: StaffProfile;
  canEdit: boolean;
  onEdit: (profile: StaffProfile) => void;
}) {
  const phoneHref = profile.phone_number ? formatPhoneHref(profile.phone_number) : undefined;

  return (
    <article className="rounded-3xl border border-white bg-white/95 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-black leading-6 text-hospital-ink">{profile.display_name}</h3>
          <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
            {employmentLabels[profile.employment_type]} - {assignmentLabels[profile.home_assignment]}
          </p>
          {profile.username && (
            <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-cyan-700">
              Username: {profile.username}
            </p>
          )}
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
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-600">
          {roleLabels[profile.assigned_role]}
        </span>
        {profile.preferred_contact_method && (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-extrabold text-violet-700">
            Prefers {contactLabels[profile.preferred_contact_method]}
          </span>
        )}
        {profile.account_claimed_at && (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-extrabold text-cyan-700">
            <UserRoundCheck size={13} />
            Claimed
          </span>
        )}
        {!profile.account_claimed_at && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-700">
            Unclaimed
          </span>
        )}
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={() => onEdit(profile)}
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700"
        >
          <Pencil size={15} />
          Edit Profile
        </button>
      )}
    </article>
  );
}

function StaffProfileEditor({
  form,
  saving,
  onChange,
  onCancel,
  onSubmit,
  onResetAccount
}: {
  form: StaffProfileForm;
  saving: boolean;
  onChange: (form: StaffProfileForm) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResetAccount: () => void;
}) {
  const isBurj = form.username_normalized === "burj";

  return (
    <form onSubmit={onSubmit} className="rounded-3xl border border-cyan-100 bg-white/95 p-4 shadow-soft">
      <h3 className="text-lg font-black text-hospital-ink">
        {form.id ? "Edit Staff Profile" : "Add Staff Profile"}
      </h3>
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

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Employment</span>
            <select
              value={form.employment_type}
              onChange={(event) =>
                onChange({ ...form, employment_type: event.target.value as EmploymentType })
              }
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
              onChange={(event) =>
                onChange({ ...form, home_assignment: event.target.value as HomeAssignment })
              }
              className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
            >
              <option value="day_shift">Day Shift</option>
              <option value="night_shift">Night Shift</option>
              <option value="pft">PFT</option>
              <option value="pulmonary_rehab">Pulmonary Rehab</option>
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
                onChange({
                  ...form,
                  preferred_contact_method: event.target.value as PreferredContactMethod | ""
                })
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
          onClick={onCancel}
          className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-600"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
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
  );
}

export function StaffDirectory({ authContext, developmentFallback }: StaffDirectoryProps) {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(!developmentFallback);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [form, setForm] = useState<StaffProfileForm | null>(null);
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
      .select(
        "id, department_id, profile_id, auth_user_id, display_name, username, username_normalized, assigned_role, employment_type, home_assignment, phone_number, email, preferred_contact_method, is_active, account_claimed_at"
      )
      .eq("department_id", authContext.departmentId)
      .order("display_name", { ascending: true });

    if (loadError) {
      setError("Unable to load Staff Directory.");
      setProfiles([]);
    } else {
      setProfiles((data ?? []) as StaffProfile[]);
    }

    setLoading(false);
  }, [authContext.departmentId, developmentFallback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfiles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProfiles]);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      if (filter === "all") {
        return true;
      }

      if (filter === "active") {
        return profile.is_active;
      }

      if (filter === "inactive") {
        return !profile.is_active;
      }

      return profile.employment_type === filter || profile.home_assignment === filter;
    });
  }, [profiles, filter]);

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
      assigned_role: username === "burj" ? "admin" : nextForm.assigned_role === "admin" ? "staff" : nextForm.assigned_role
    });
  };

  const startCreate = () => {
    updateForm(emptyForm);
    setSuccess("");
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form || !canEdit) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const assignedRole: StaffRole =
      form.username_normalized === "burj"
        ? "admin"
        : form.assigned_role === "admin"
          ? "staff"
          : form.assigned_role;
    const payload = {
      department_id: authContext.departmentId,
      display_name: form.display_name.trim(),
      username: form.username,
      username_normalized: form.username_normalized,
      assigned_role: assignedRole,
      employment_type: form.employment_type,
      home_assignment: form.home_assignment,
      phone_number: normalizeOptional(form.phone_number),
      email: normalizeOptional(form.email),
      preferred_contact_method: form.preferred_contact_method || null,
      is_active: form.is_active
    };
    const supabase = createClient();
    const result = form.id
      ? await supabase.from("staff_profiles").update(payload).eq("id", form.id)
      : await supabase.from("staff_profiles").insert(payload);

    setSaving(false);

    if (result.error) {
      setError("Unable to save staff profile.");
      return;
    }

    const existingProfile = profiles.find((profile) => profile.id === form.id);

    if (existingProfile?.profile_id) {
      await supabase
        .from("department_memberships")
        .update({ role: assignedRole })
        .eq("department_id", authContext.departmentId)
        .eq("profile_id", existingProfile.profile_id);
    }

    setForm(null);
    setSuccess(form.id ? "Staff profile updated." : "Staff profile created.");
    await loadProfiles();
  };

  const resetAccount = async () => {
    if (!form?.id || !canEdit) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const response = await fetch(`/api/admin/staff-profiles/${form.id}/reset-account`, {
      method: "POST"
    });

    setSaving(false);

    if (!response.ok) {
      setError("Unable to reset account.");
      return;
    }

    setForm(null);
    setSuccess("Account reset. The assigned username can be claimed again.");
    await loadProfiles();
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
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-2xl bg-cyan-700 px-3 text-xs font-extrabold text-white"
            >
              <Plus size={15} />
              Add
            </button>
          )}
        </div>

        {authContext.role !== "admin" && (
          <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
            Staff self-edit is planned for a later phase.
          </p>
        )}

        <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold ${
                filter === option.id
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
        <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          {success}
        </p>
      )}

      {form && (
        <StaffProfileEditor
          form={form}
          saving={saving}
          onChange={updateForm}
          onCancel={() => setForm(null)}
          onSubmit={handleSubmit}
          onResetAccount={resetAccount}
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
            canEdit={canEdit}
            onEdit={(selectedProfile) => {
              setForm(profileToForm(selectedProfile));
              setSuccess("");
              setError("");
            }}
          />
        ))}
      </div>
    </div>
  );
}
