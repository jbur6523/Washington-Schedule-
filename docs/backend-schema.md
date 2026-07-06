# WHHS RT Schedule Backend Schema

This backend foundation supports the Washington Hospital respiratory department app. It uses Supabase Auth, Postgres, Row Level Security, and future private storage while keeping schedule coordination data protected.

Required public environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Use the Supabase publishable key for client and SSR auth. `SUPABASE_SECRET_KEY` is server-only and is used only by route handlers that create/link/reset Supabase Auth users. Do not expose a secret key or service-role key in browser-readable variables.

## Table Purposes

### Core

- `hospitals`: top-level hospital record. Washington Hospital is the initial hospital record.
- `departments`: department records under a hospital. The respiratory department keeps `active_schedule_version_id` here.
- `profiles`: app user profile linked to `auth.users`.
- `department_memberships`: joins profiles to departments with an `admin`, `lead`, or `staff` role.

### Staff Directory

- `staff_profiles`: department staff directory records. Staff can exist before they create an account, so `profile_id` is nullable.
- `staff_profiles.username` and `staff_profiles.username_normalized`: permanent department-assigned username.
- `staff_profiles.account_claimed_at` and `staff_profiles.auth_user_id`: account claim/link state.
- `staff_profiles.assigned_role`: intended role for account claim. Only username `burj` may be assigned `admin`.
- Phone numbers are stored only in `staff_profiles.phone_number`.
- General staff status updates are stored on `staff_profiles.status_message` and `staff_profiles.status_updated_at`.
- Staff contact data is separate from schedule entries, requests, offers, import rows, and Cover/Switch data.
- Aide display styling is derived from `staff_profiles.operations_role = aide`. Schedule and staff cards can show `Aide` instead of FT/PD without changing `employment_type`.

### Schedules

- `schedule_versions`: draft, review, published, and archived schedule versions.
- `schedule_entries`: scheduled or available staff rows for a specific schedule version.
- `schedule_entries.is_shift_lead`: entry-level Shift Lead flag shown as a crown on Schedule cards.
- `shift_shortages`: shift-level Short Shift alerts. This is the only table that represents Short Shift.
- `user_schedule_overrides`: staff-owned self-managed app schedule changes layered on top of the baseline schedule.
- `shift_status_updates`: Command Center shift-level operational updates. Rows store RTs scheduled, RTs needed, vent/BiPAP counts, scheduled procedure counts, and visible updated-by attribution for the Director Shift Status page and compact Schedule summary. `rts_required` is displayed as `RTs Needed` and supports decimal values such as `6.9`.

### Requests and Offers

- `shift_requests`: employee-level requests tied to a schedule entry.
  - Allowed request types are `switch_requested` and `coverage_requested`.
  - A staff member can have both request types active on the same shift.
  - Requests can target either a baseline schedule entry or a self-added schedule override.
- `coverage_offers`: legacy staff offers to cover Short Shift alerts.
- `shift_request_offers`: staff offers to cover or switch in response to active Switch Requested and Coverage Requested rows.

### Notifications

- `push_subscriptions`: staff-owned device subscriptions for Web Push.
- `notification_preferences`: staff-owned alert preferences and optional quiet hours.
- `notification_events`: in-app notification records and server-side push delivery state.
- Push subscription secrets must not be public or logged.

### Gossip Board

- `gossip_posts`: staff-only department posts for the Gossip Board.
- Text is capped at 140 characters.
- Optional compressed images are stored by private path in the `gossip-images` Supabase Storage bucket.
- Soft-deleted posts are hidden with `is_deleted = true`.

### Order Management

- `department_orders`: Aide-created department supply order records. Each row stores department, creator staff profile, creator display name fallback, optional private image storage path, optional image URL fallback, notes capped at 280 characters, and created/updated timestamps.
- `department-order-images`: private Supabase Storage bucket for Order Management photos. Images are stored under department-scoped paths and displayed through signed URLs.
- Order Management creation is Aide-only. RLS and storage policies use `staff_profiles.operations_role = aide` and active staff profiles to allow Aides to create/read orders and upload/read order images. Admin users can read orders and order images for beta monitoring, but cannot create/upload through this workflow unless separately granted later.
- Order Management notes must not contain patient information, MRNs, clinical details, staff usernames, auth IDs, staff phone numbers, or staff emails.

### Rental Management

- `rental_vendors`: department rental companies, including US Med Equipment, Med One Capital, Agiliti Health Inc, SRC, and Other.
- `rental_equipment`: reusable equipment identity by `barcode_number` and optional `serial_number`.
- Rental equipment terminology: BiPAP is the equipment category and V60 is the model. Existing `equipment_type` values of `bipap` or `v60` are normalized in user-facing UI as `BiPAP V60`; quick-reference cards display `BiPAP V60 - SN XXXXX` when serial number is entered and `BiPAP V60 - Barcode XXXXX` when only the required barcode number is available.
- `rental_records`: active and historical rental records. `pending_delivery` / `called_in` records display as blue `Pending Delivery`, can exist before a serial number is known, and do not count as Active Rentals. Delivery confirmation updates the pending row to `active`. Delivery cancellation uses `delivery_cancelled`, `cancelled_at`, `cancelled_by_staff_profile_id`, and `cancellation_note`; it stays out of Active Rentals and remains visible in Rental History. `checked_in_at` is retained as the delivered timestamp for compatibility and displays as `Delivered` in the UI. `pickup_requested_at`, `pickup_requested_by_staff_profile_id`, `pickup_confirmation_number`, and `pickup_request_note` support the Called for Pickup step. Canceling a pickup returns status to `active` and keeps the cancellation in `rental_events`. `returned_at`, `returned_by_staff_profile_id`, and `return_note` support Picked Up confirmation. `active` / `delivered` records display green, `pickup_requested` / `pickup_called` / `called_for_pickup` records display yellow, `returned` / `picked_up` records display as gray `Picked Up`, and `delivery_cancelled` records display as gray `Delivery Canceled`.
- `rental_events`: audit-style rental events such as `called_in`, `delivered`, `checked_in`, `manual_check_in`, `barcode_scanned`, pickup-call events, `pickup_cancelled`, `delivery_cancelled`, `returned` / `picked_up`, and future `transferred` events. Rental History can use events for timeline details and picked-up-by display when those events exist.
- Rental notes are capped at 140 characters and must not contain patient information.
- Barcode # and Serial Number are separate identifiers. `barcode_number` is required when delivery is confirmed. `serial_number` is nullable and optional because it may not be easy to find on the equipment label.
- Rental History export is generated server-side from `rental_records`, `rental_vendors`, `rental_events`, and related `staff_profiles` display names. The database remains the source of truth; exported CSV files include separate Barcode # and Serial Number columns and do not include usernames, auth IDs, staff phone numbers, staff emails, patient information, or clinical details.
- Shared Command Center rental actions store the selected staff attribution in the existing staff-related rental fields and event actor fields. The shared `sputum` login is not intended to appear as the visible rental actor.

### Import and Review

- `schedule_imports`: admin-only schedule import jobs.
- `schedule_import_rows`: editable extracted or pasted rows for human review before creating a schedule version.
- Import approval can create schedule versions and entries after admin review. OCR remains out of scope.

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
- A coverage offer targets one Short Shift alert.
- A shift request offer targets one Switch Requested or Coverage Requested row.
- A rental record references one rental equipment row, one vendor, and the staff member who checked it in.

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

Operational access beyond the normal app role is stored in `staff_profiles.operations_role`:

- `none`: no special operations experience.
- `aide`: access to the Aide Dashboard, Rental Management, and Aide-only Order Management without granting Lead/Admin schedule permissions.
- `command_center`: shared department phone access. Routes to `/command-center`, can use Shift Update, Rental Management, and Short Shift Alert, and must provide staff attribution for visible actions.
- `director`: read-only Director Shift Status access. Routes to `/director/shift-status` and cannot edit shift updates or rental workflows.

Seeded special usernames:

- `sputum`: Command Center shared-device login. Temporary password target is `2000`.
- `aloha`: Director read-only login. Password should be set through the normal password setup/reset process.

## RLS Strategy

All production tables have Row Level Security enabled.

Helper functions:

- `current_profile_id()`: returns the profile linked to `auth.uid()`.
- `user_is_department_member(department_id)`: checks department membership.
- `user_is_department_admin(department_id)`: checks department admin role.
- `user_is_command_center(department_id)`: checks whether the current account is the shared Command Center account for that department.
- `user_is_department_aide(department_id)`: checks whether the current account is an active Aide in that department.
- `current_staff_profile_id(department_id)`: returns the staff profile linked to the current profile in a department.

General policy rules:

- Authenticated users can access only their department data.
- Admins can manage department-scoped data.
- Staff can read active published schedule data and staff directory data for their department.
- Staff can create/cancel only records tied to their own linked `staff_profiles` row.
- Command Center can insert department-scoped shift status, Short Shift, and rental workflow rows where policy explicitly allows it.
- Import tables are admin-only.
- Audit events are admin-readable only.

## Staff Directory Phone Number Rules

- Phone numbers are allowed only in `staff_profiles`.
- Phone numbers should be work phone numbers or staff-approved contact numbers.
- Phone numbers are not stored on schedule entries, shift requests, coverage offers, shift request offers, import rows, Cover/Switch posts, or audit summaries.
- Phone numbers should not appear on Schedule cards by default.
- Phone numbers should not appear on Cover/Switch cards by default.
- Phone numbers should not appear in schedule import previews unless a separate staff directory import workflow is built.
- Phone numbers are never public and never visible to unauthenticated users.
- Use placeholder phone numbers only in seed data, screenshots, or examples.
- Emergency contacts are out of scope.

Staff Directory reads from `staff_profiles`. Admin users can create/edit these records, while staff users can view the directory according to RLS. Staff users can update only their own optional contact fields through the protected My Settings route.

Staff status messages are profile-level, not schedule-entry-level. Staff users update only their own status through the protected status settings route, and the Schedule screen renders that message under the staff member's name wherever they appear.

Shift Lead is schedule-entry-level, not profile-level. It is stored on `schedule_entries.is_shift_lead`, is visible to authenticated schedule viewers, and is separate from the app `lead` role.

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
- Review-first imports can create draft/review versions or publish only when the admin explicitly chooses Save and Publish.

## Self-Managed Schedule

- The app is not the official hospital schedule.
- The published schedule is the baseline schedule.
- Staff-managed schedule changes are stored in `user_schedule_overrides`.
- Staff can remove themselves from their own baseline shift with `remove_self`.
- Staff can add themselves to another app shift with `add_self`.
- Moves are represented as one `remove_self` plus one `add_self`.
- Staff can update/deactivate only their own overrides.
- Schedule rendering applies active overrides by subtracting active removals and adding active self-added shifts.

## Shift Request Rules

- Employee-level request types are only `switch_requested` and `coverage_requested`.
- Legacy request labels are excluded from the app UI and database workflows.
- Requests are tied to either `schedule_entry_id` or `user_schedule_override_id`, plus `staff_profile_id`.
- Requests do not alter the baseline schedule entry.
- Request notes are capped at 140 characters.
- Cancelled and resolved requests remain in the database for history.
- Active requests appear on Cover/Switch.
- Coverage offers and switch offers are stored in `shift_request_offers`.
- Switch offers must target a shift in the same Sunday-through-Saturday department week as the requested shift.
- Request owners can accept or decline offers on their own requests.
- Accepting an offer marks the offer accepted and resolves the related request, but it does not rewrite the published baseline schedule.
- Offer created, accepted, and declined events create in-app notifications and attempt Web Push delivery when allowed by preferences.

## Short Shift Rules

- Short Shift is shift-level only.
- Short Shift belongs in `shift_shortages`, not on employee records.
- Severity values are `short` and `urgent`.
- Short Shift alerts have `status = active`, `resolved`, or `cancelled`.
- Lead and admin users can create, resolve, or cancel Short Shift alerts.
- Short Shift can appear on Cover/Switch and schedule shift sections as a department need.
- Creating an active Short Shift through the protected server route can send Web Push notifications to active staff who opted in.

## Notification Rules

- Staff can manage only their own push subscriptions and notification preferences.
- Staff can read and mark only their own notification events.
- Short Shift and Cover/Switch notification delivery runs server-side.
- `VAPID_PRIVATE_KEY` must remain server-only.
- Notification text should be short and generic.
- Notification bodies must not include phone numbers, patient information, clinical notes, payroll data, EMR data, or private reasons.
- Notifications are app/push based only. Email and SMS notifications are out of scope.

## Gossip Board Rules

- Gossip Board is authenticated and department-only.
- Posts are not anonymous in this phase.
- Users can create and soft-delete only their own posts.
- Admin users can soft-delete any department post.
- Images are compressed client-side before upload.
- Gossip posts do not trigger push, email, or SMS notifications in this phase.
- Gossip text and images must not include patient information or clinical details.

## Import and Review Foundation

- Schedule imports are admin-only.
- Uploaded images are kept in browser state only during the current Phase 8 workflow.
- If image persistence is later added, uploaded images should use private storage and a short retention/deletion policy.
- Import rows can store raw extracted names for review, but should not store phone numbers or patient data.
- Admin review and approval must happen before imported data becomes a schedule version.
- Crossed-out names should be removed during review before approval.
- `schedule_import_rows.shift_start` and `shift_end` store structured shift times for version creation.

## Out of Scope

- OCR or AI extraction.
- OCR auto-publish.
- Email notifications.
- SMS notifications.
- Native mobile app.
- Billing.
- Public SaaS onboarding.
- Payroll integration.
- EMR integration.
- Patient information.
- Clinical notes.
- Hire dates.
- Emergency contact numbers.
- Real staff phone numbers in seed data.

