# Washington-Schedule Backend Schema

This backend foundation is for an internal Washington Hospital respiratory department pilot. It prepares Supabase Auth, Postgres, Row Level Security, and future private storage without replacing the current demo UI data source yet.

Required public environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Use the Supabase publishable key for client and SSR auth. `SUPABASE_SECRET_KEY` is server-only and is used only by route handlers that create/link/reset Supabase Auth users. Do not expose a secret key or service-role key in browser-readable variables.

## Table Purposes

### Core

- `hospitals`: top-level hospital record. The pilot starts with Washington Hospital.
- `departments`: department records under a hospital. The pilot starts with one respiratory department and keeps `active_schedule_version_id` here.
- `profiles`: app user profile linked to `auth.users`.
- `department_memberships`: joins profiles to departments with an `admin`, `lead`, or `staff` role.

### Staff Directory

- `staff_profiles`: department staff directory records. Staff can exist before they create an account, so `profile_id` is nullable.
- `staff_profiles.username` and `staff_profiles.username_normalized`: permanent department-assigned username.
- `staff_profiles.account_claimed_at` and `staff_profiles.auth_user_id`: account claim/link state.
- `staff_profiles.assigned_role`: intended role for account claim. Only username `burj` may be assigned `admin`.
- Phone numbers are stored only in `staff_profiles.phone_number`.
- Staff contact data is separate from schedule entries, requests, offers, import rows, and shift board data.

### Schedules

- `schedule_versions`: draft, review, published, and archived schedule versions.
- `schedule_entries`: scheduled or available staff rows for a specific schedule version.
- `shift_shortages`: shift-level Short Shift alerts. This is the only table that represents Short Shift.

### Requests and Offers

- `shift_requests`: employee-level requests tied to a schedule entry.
  - Allowed request types are `switch_requested` and `coverage_requested`.
  - A staff member can have both request types active on the same shift.
- `coverage_offers`: staff offers to cover either a shift request or a Short Shift alert.

### Import and Review

- `schedule_imports`: admin-only schedule import jobs.
- `schedule_import_rows`: editable extracted rows for human review before creating a schedule version.
- Import approval should create schedule versions and entries later. OCR and import processing are out of scope for this foundation.

### Audit

- `audit_events`: admin-readable history of important actions.
- Do not store raw phone numbers in `before_json` or `after_json` unless absolutely necessary. Prefer logging that a contact field changed.
- Do not store patient information, clinical notes, emergency contacts, hire dates, payroll data, or EMR data in audit events.

## Relationships

- A hospital has many departments.
- A department has many memberships, staff profiles, schedule versions, requests, offers, imports, and audit events.
- A profile can be linked to department memberships and optionally to a staff profile.
- A schedule version has many schedule entries and shift shortages.
- A schedule entry can have employee-level shift requests.
- A coverage offer targets exactly one shift request or one shift shortage.

## Role Model

Roles are stored in `department_memberships.role`.

- `admin`
  - Manage department data.
  - Manage staff directory and phone numbers.
  - Manage schedule versions, schedule entries, and Short Shift alerts.
  - Manage schedule imports and review rows.
  - Resolve requests and coverage offers.
  - Read audit events.
- `lead`
  - Has staff permissions.
  - Can manage Short Shift alerts in supported workflows.
  - Does not publish schedules, run imports, edit staff profiles, or manage admin settings.
- `staff`
  - Read active published schedule data for their department.
  - Read allowed staff directory data for their department.
  - Create and cancel their own shift requests.
  - Create and cancel their own coverage offers.

The app determines role and membership from `profiles` and `department_memberships`. It must not trust role values sent from browser state. `burj` is the only admin username. Other lead users use the `lead` role.

## RLS Strategy

All production tables have Row Level Security enabled.

Helper functions:

- `current_profile_id()`: returns the profile linked to `auth.uid()`.
- `user_is_department_member(department_id)`: checks department membership.
- `user_is_department_admin(department_id)`: checks department admin role.
- `current_staff_profile_id(department_id)`: returns the staff profile linked to the current profile in a department.

General policy rules:

- Authenticated users can access only their department data.
- Admins can manage department-scoped data.
- Staff can read active published schedule data and staff directory data for their department.
- Staff can create/cancel only records tied to their own linked `staff_profiles` row.
- Import tables are admin-only.
- Audit events are admin-readable only.

## Staff Directory Phone Number Rules

- Phone numbers are allowed only in `staff_profiles`.
- Phone numbers should be work phone numbers or staff-approved contact numbers.
- Phone numbers are not stored on schedule entries, shift requests, coverage offers, import rows, shift board posts, or audit summaries.
- Phone numbers should not appear on Schedule cards by default.
- Phone numbers should not appear on Shift Board cards by default.
- Phone numbers should not appear in schedule import previews unless a separate staff directory import workflow is built.
- Phone numbers are never public and never visible to unauthenticated users.
- Use fake/demo phone numbers only in seed data, screenshots, or examples.
- Emergency contacts are out of scope for the pilot.

Phase 3 Staff Directory reads from `staff_profiles`. Admin users can create/edit these records, while staff users can view the directory according to RLS. Staff self-edit remains future functionality.

Assigned username rule:

- First 3 letters of last name plus first letter of first name.
- Lowercase and remove spaces, hyphens, apostrophes, and punctuation.
- Append numbers for duplicates.
- `Bei Yi` is `yibe`.
- Users cannot choose arbitrary usernames.
- Admin roster provisioning supports single-profile creation and batch pasted rows in `Name | employment_type | home_assignment` format.
- Username regeneration is allowed only before the account is claimed.
- Reset/unclaim clears the auth/profile link but keeps the staff profile and historical schedule/request records.

## Schedule Versioning

- Admins create schedule versions in `draft` or `review` status.
- Admins publish a reviewed version by setting `schedule_versions.status = 'published'` and updating `departments.active_schedule_version_id`.
- Staff schedule reads are scoped to the active published version.
- Rollback currently means publishing a previous version again. A fuller rollback UI remains future work.
- The admin manual builder and batch paste format are documented in `docs/schedule-versions.md`.
- Import results must never auto-publish.

## Shift Request Rules

- Employee-level request types are only `switch_requested` and `coverage_requested`.
- Do not use Wants Off.
- Do not use Shift Available.
- Requests are tied to a `schedule_entry_id` and `staff_profile_id`.
- Requests do not alter the official schedule entry.
- Cancelled and resolved requests remain in the database for history.

## Short Shift Rules

- Short Shift is shift-level only.
- Short Shift belongs in `shift_shortages`, not on employee records.
- Severity values are `short` and `urgent`.
- Short Shift can appear on the Shift Board and schedule shift sections as a department need.

## Import and Review Foundation

- Schedule imports are admin-only.
- Uploaded images should use private storage in a later phase.
- Source images should be deleted after approval, rejection, or a short retention window.
- Import rows can store raw extracted names for review, but should not store phone numbers or patient data.
- Admin review and approval must happen before imported data becomes a schedule version.

## Out of Scope

- OCR or AI extraction.
- OCR auto-publish.
- Push notifications.
- Native mobile app.
- Billing.
- Public SaaS onboarding.
- Payroll integration.
- EMR integration.
- Patient information.
- Clinical notes.
- Hire dates.
- Emergency contact numbers.
- Real staff phone numbers in seed/demo data.
