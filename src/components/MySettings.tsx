"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Settings, X } from "lucide-react";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";
import { NotificationSettings } from "@/components/NotificationSettings";

type PreferredContactMethod = "phone" | "email" | "app";

type MySettingsProps = {
  authContext: AuthenticatedUserContext;
  developmentFallback?: boolean;
  onClose: () => void;
};

type ContactForm = {
  phoneNumber: string;
  email: string;
  preferredContactMethod: PreferredContactMethod | "";
};

function isValidEmail(value: string) {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function MySettings({ authContext, developmentFallback, onClose }: MySettingsProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [contactForm, setContactForm] = useState<ContactForm>({
    phoneNumber: "",
    email: "",
    preferredContactMethod: ""
  });
  const [loadingContact, setLoadingContact] = useState(!developmentFallback);
  const [savingContact, setSavingContact] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const closeSettings = useCallback(() => {
    if (!savingContact) {
      onClose();
    }
  }, [onClose, savingContact]);

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
        closeSettings();
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
  }, [closeSettings]);

  const loadContactInfo = useCallback(async () => {
    if (developmentFallback || !authContext.staffProfileId) {
      setLoadingContact(false);
      return;
    }

    setLoadingContact(true);
    setError("");

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("staff_profiles")
      .select("phone_number, email, preferred_contact_method")
      .eq("id", authContext.staffProfileId)
      .eq("department_id", authContext.departmentId)
      .maybeSingle();

    if (loadError) {
      setError("Unable to load your contact information.");
    } else {
      setContactForm({
        phoneNumber: (data?.phone_number as string | null) ?? "",
        email: (data?.email as string | null) ?? "",
        preferredContactMethod: ((data?.preferred_contact_method as PreferredContactMethod | null) ?? "")
      });
    }

    setLoadingContact(false);
  }, [authContext.departmentId, authContext.staffProfileId, developmentFallback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadContactInfo();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadContactInfo]);

  const saveContactInfo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authContext.staffProfileId) {
      setError("Your account is not linked to a staff profile yet.");
      return;
    }

    if (!isValidEmail(contactForm.email)) {
      setError("Enter a valid email address or leave email blank.");
      return;
    }

    setSavingContact(true);
    setError("");
    setMessage("");

    const response = await fetch("/api/settings/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(contactForm)
    });
    const result = await response.json().catch(() => null);

    setSavingContact(false);

    if (!response.ok) {
      setError(result?.message ?? "Unable to save settings.");
      return;
    }

    window.dispatchEvent(new CustomEvent("washington-schedule:contact-updated"));
    setMessage("Settings saved.");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-slate-950/40 px-3 pb-3 pt-12 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
      role="presentation"
      onMouseDown={closeSettings}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-settings-heading"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-cyan-100 bg-white p-4 shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">My Settings</p>
            <h2 id="my-settings-heading" className="mt-1 text-2xl font-black text-hospital-ink">
              My Profile
            </h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Update your contact info and notification preferences.
            </p>
          </div>
          <button
            type="button"
            onClick={closeSettings}
            disabled={savingContact}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 disabled:opacity-60"
            aria-label="Close My Settings"
          >
            <X size={18} />
          </button>
        </div>

        {message && (
          <p role="status" className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}

        <form onSubmit={saveContactInfo} className="mt-4 rounded-3xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
              <Settings size={20} />
            </span>
            <div>
              <h3 className="text-xl font-black text-hospital-ink">My Contact Info</h3>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                These optional details appear in the Staff Directory only.
              </p>
            </div>
          </div>

          {loadingContact ? (
            <p className="mt-4 text-sm font-bold text-slate-500">Loading contact info...</p>
          ) : (
            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Phone Number</span>
                <input
                  type="tel"
                  value={contactForm.phoneNumber}
                  onChange={(event) => setContactForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
                <span className="mt-1 block text-xs font-bold text-slate-500">
                  Optional: Others in the department can view
                </span>
              </label>

              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Email</span>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                />
                <span className="mt-1 block text-xs font-bold text-slate-500">
                  Optional: Others in the department can view
                </span>
              </label>

              <label className="block">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Preferred Contact Method
                </span>
                <select
                  value={contactForm.preferredContactMethod}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      preferredContactMethod: event.target.value as PreferredContactMethod | ""
                    }))
                  }
                  className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-hospital-ink outline-none focus:border-cyan-300"
                >
                  <option value="">None</option>
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="app">App</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={savingContact}
                className="min-h-11 rounded-2xl bg-cyan-700 px-3 text-sm font-extrabold text-white shadow-sm disabled:opacity-60"
              >
                {savingContact ? "Saving..." : "Save Contact Info"}
              </button>
            </div>
          )}
        </form>

        <div className="mt-4">
          <NotificationSettings authContext={authContext} developmentFallback={developmentFallback} />
        </div>
      </section>
    </div>
  );
}
