# Operations Dashboard

The Operations Dashboard is the department operations entry point for WHHS RT Schedule. It is separate from personal schedule management.

## Access

Dashboard access is role based:

- Admin users see `Admin Dashboard`.
- Lead users see `Lead Dashboard`.
- Staff with `staff_profiles.operations_role = aide` see `Aide Dashboard`.
- Staff with `staff_profiles.operations_role = command_center` route to the separate Respiratory Command Center instead of the normal Operations Dashboard.
- Staff with `staff_profiles.operations_role = director` route to the read-only Shift Status page instead of the normal Operations Dashboard.
- Staff with `staff_profiles.operations_role = icu_command_center` route to the separate ICU Command Center instead of the normal Operations Dashboard.
- Regular staff do not see the dashboard button.

Admins are the app superuser for management review and testing. The Admin Dashboard links to every major module, including role-specific dashboards, without granting those permissions to non-admin roles. Leads use their existing app role. Aide access is a separate operations capability so it does not grant lead/admin schedule permissions.
Command Center, ICU Command Center, and Director access are separate experiences for shared department operations and director read-only status viewing.

Unauthenticated users are redirected to login. Regular staff who open dashboard routes directly see a friendly access-denied state.

Roster deactivation preserves history, but emergency stabilization on 2026-07-07 deferred using inactive status as a hard app-access lockout. Normal role-based route protections still apply.

## Admin Staff Access Control

Admin roster management includes an `Active` status for staff profiles. The status is currently roster/display state only; hard access lockout is deferred pending safer management/IT approval and production testing. Historical records remain intact. Admins cannot deactivate their own active account from the roster editor.

## Header Entry Point

The top header shows one dashboard button for users with operations access:

- Admin
- Lead
- Aide

The dashboard page title uses the full label.
Command Center, ICU Command Center, and Director accounts do not use this header entry point because they route directly to their simplified pages after login.

## Lead Command Board

The Lead Command Board is available at `/command-center` for Admin, Lead, and `operations_role = command_center` users.

Seeded shared-device login:

- Username: `sputum`
- Setup password: provided out of band by the department administrator. Do not publish the shared-device password in app UI or documentation.

The command phone menu contains:

- Shift Update
- Rental Management
- Aide Communication Board
- Lead Communication Board
- ICU Snapshot
- Short Shift Alert

It does not show the normal bottom navigation, Gossip, Staff Directory, Admin settings, or personal staff tools. ICU Snapshot is read-only from the Respiratory Command Center. Rental actions and Short Shift actions require staff attribution so history and exports show the selected staff member or initials instead of the shared login. Aide Communication Board lets Command Center users send notes or questions to Aides/Admin users in Order Management. Lead Communication Board lets Command Center, Director, and ICU Command Center users leave operational notes for RT Leads.

## ICU Command Center

The ICU Command Center is available at `/icu-command-center` for Admin users and `operations_role = icu_command_center`.

Seeded shared-device login:

- Username: `ventilator`

The ICU Command Center tracks ICU respiratory devices and settings by bed only. It supports Vent, BiPAP, CPAP, and HFNC entries, conditional device settings, active-device snapshot counts, Update, Discontinue, History, Today's ICU Activity, Search Previous Date, Lead Communication Board, and a Vent-only Critical toggle. Discontinue requires Discontinued Date and Discontinued Time for all devices. Vent discontinuation also requires a Ventilator Outcome. Discontinue does not hard-delete records.

Director and Lead Command Board users can view ICU details read-only. Regular Staff, Aides, unauthenticated users, and Director users cannot edit ICU entries.

The ICU Command Center must not store patient names, MRNs, DOBs, diagnoses, clinical free-text notes, or patient-identifying information.

Lead Communication Board notes created from ICU Command Center are for operational lead awareness only and include a `No patient information.` reminder. ICU users can create/view notes but cannot mark them reviewed unless they also have Lead/Admin access.

Trusted-device sign-in persistence is documented in `docs/auth.md`. It keeps the Supabase session on the department phone without storing the command-center password.

## Director Shift Status

The Director read-only page is available at `/director/shift-status` for Admin, Lead, and `operations_role = director` users.

Seeded director username:

- `aloha`

The Director should set or choose his own password through the normal password setup/reset process. The page is the primary live visual reporting dashboard for respiratory shift status. It uses a compact executive layout with visible header `Sign Out`, a `Respiratory Directory` action, a `Current Shift Status` card for Scheduled and RTs Needed, a `Department Snapshot` card for Vents, BiPAPs, scheduled procedure total, Active Rentals, left-aligned shift/date context, and last-updated metadata, plus scheduled procedure detail cards for C-Sections, Vaginal Delivery, CABG, Bronchs, Sputum Inductions, and MRI with left-aligned shift/date context. The `Respiratory Directory` modal includes all active and inactive staff names and phone numbers from `staff_profiles`, sorted by display name, without usernames, auth IDs, emails, edit buttons, or admin controls. The Current Shift Status card also includes `View Shift`, which opens a read-only modal schedule preview for uploaded dates and Day/Night shifts. The modal defaults to the current `America/Los_Angeles` date when uploaded, then the closest future uploaded date, then the previous shift date if no future date exists. Its date dropdown shows the previous shift date when uploaded, the current date when uploaded, and all future uploaded dates; older past dates can be entered manually as `MMDDYY`. View Shift defaults to Day Shift from `07:00-18:59` Pacific or Night Shift from `19:00-06:59` Pacific, and the schedule list has extra bottom padding so the final staff card remains visible. Scheduled Procedures entered from the Lead Command Board display on the Director Dashboard and reset to `0` after 24 hours without deleting old shift update records. Department Snapshot scheduled procedure total follows the same 24-hour freshness rule, while Vent, BiPAP, and Active Rentals continue showing latest known values. The page remains read-only and does not allow editing.

Email reporting is intentionally out of scope for this phase. The Command Center updates the app, and the Director dashboard displays those latest numbers. `View Text Report` and `Copy Summary` are available for manual sharing.

## Rental Management

The first dashboard tool is `Rental Management`.

Purpose:

- Track BiPAP V60 rentals.
- Log called-in BiPAP V60 rental orders and confirm delivery from pending cards.
- Start pickup requests for active BiPAP V60 rentals and complete pickup from pending cards.
- Prepare for future transfer, room tracking, notifications, and analytics workflows.

The dashboard starts with `Rental Actions`, which contains `Order Rental` and `Return Rental`.

## Aide Order Management

Aide users see an additional `Order Management` card on the Aide Dashboard. Admin users also see Order Management and have the same create/view permissions for beta testing and oversight. The tool opens `/operations/order-management` and is not shown to Staff, Lead, Director, Command Center, or unauthenticated users.

Order Management is intentionally simple in this phase:

- The main page shows a single `Create Order` action and submitted order history.
- The `To-Do List` action opens a shared department order-notes modal for Admin and Aide users.
- The `Aide Communication Board` action shows notes from Lead Command Board users, with a badge for new unacknowledged notes.
- The create form opens separately in a mobile modal instead of loading inline by default.
- Aide takes or uploads a picture when available.
- Picture upload is optional but strongly encouraged.
- Aide can enter an optional Req Number.
- Aide can add optional notes, capped at 280 characters, and note-only orders are allowed when a picture is not available.
- The app automatically stores the current Aide as the creator.
- Submit is disabled until the user adds a picture, note, or Req Number.
- Saved orders show `Order Req - XXXXXX`, created date/time, creator display name, notes, and an image thumbnail when present.
- Tapping an order thumbnail opens a full-size preview modal.
- The shared To-Do List saves only when the user taps `Save`, shows last updated metadata, and requires confirmation before clearing.
- Clearing the To-Do List transforms the confirmation card into a same-size rotating celebration card, then closes the modal automatically.
- Admin can create orders and upload images with the same permissions as Aides, and can view submitted order count, orders, thumbnails/previews, created date/time, creator display name, and notes for monitoring.
- Aide/Admin users can acknowledge Aide Communication Board and send optional responses. Command Center/Lead/Admin users can create notes and view acknowledgement/response status.

Order Management is protected by route checks and Supabase RLS/storage policies. Lead, Director, Command Center, and regular Staff do not have access.

Aide schedule/staff cards use a soft pink treatment and an `Aide` badge based on `staff_profiles.operations_role = aide`. This changes only user-facing display; it does not mutate employment type or schedule data.

## Current Rental Scope

Rental Management currently supports:

- Rental company selection
- Quantity ordered, with one pending delivery record created per BiPAP V60 ordered
- Equipment Type: BiPAP
- Model: V60
- Called In / Pending Delivery logging
- Pending Delivery cards only when pending records exist
- delivery confirmation from a Pending Delivery card
- 1D barcode scan or manual Barcode # entry during delivery confirmation
- optional Serial Number entry when the equipment label is available
- Delivered / Confirm Delivery date/time
- optional notes with no patient information
- combined Rental Management overview card with delivered/active Active Rentals count, Pending count, and Oldest Rental `MM/DD` date
- dedicated Active Rentals screen with full active rental details
- dedicated Rental History screen for searching, filtering, and manually exporting pending, active, called-for-pickup, and picked-up rental records
- Return Rental workflow for pickup calls and picked-up confirmation
- dashboard Pending section for pending deliveries and pending pickups, with neutral cancel actions that preserve Rental History events

The Rental Management dashboard stays summary-focused. The top overview card combines the page title with Active Rentals count, Pending count, and Oldest Rental date. Active Rentals count includes delivered/active rentals only. Pending counts include rentals waiting for delivery and rentals waiting for pickup. The compact `Rental Actions` card combines `Order Rental`, `Return Rental`, and `View Active Rentals` so the dashboard does not need separate action cards for each workflow. `View Active Rentals` opens the full list, sorted oldest active rental first.
`Rental History` opens the searchable history list with status, equipment, vendor, and date range filters. It can export the current filtered view or all history as an Excel-compatible CSV paper trail. The app database remains the source of truth, and this phase does not sync with Google Drive, Google Sheets, OneDrive, SharePoint, or Excel Online.

Return Rental is active and opens the existing dedicated pickup request workflow screen.

## Shift Status Updates

Command Center and Lead/Admin users can save shift updates. Normal Schedule users see `Current Shift Status` directly under the Schedule page Shift View selector instead of the old Scheduled, Available, Coverage, Short Shifts, and Switch Requests summary row. The compact Schedule card shows RTs Scheduled, RTs Needed, Vents, last updated time, and updated-by attribution when available. RTs Needed can include decimals such as `6.9`. `Staffed`, `Short`, or `No Update` appears only in the title line; Staffed is green, Short is red, and No Update is neutral gray. `Short` requires `RTs Needed - RTs Scheduled >= 0.5`, so small decimal gaps remain `Staffed`. The compact Schedule card uses the same latest Lead Command Board Shift Update source as the Director dashboard for staffing values. Its Vent count uses the freshest source between Lead Command Board `vent_count` and the ICU Command Center active vent snapshot. The Director Shift Status page remains the fuller read-only dashboard with staffing, equipment, scheduled procedure counts, freshness indicator, text report, Respiratory Directory, View Shift modal, and Sign Out.

## Go-Live Note

Before official department use, run the deployed smoke test for Admin, Lead, Aide, Command Center, Director, and regular Staff access. After that smoke test passes, run the one-time rental test-data wipe so the live rental log starts clean.

## Out of Scope

This phase does not implement:

- Room transfer
- Notifications
- Analytics
- Billing
- Payroll integration
- EMR integration
- Patient information
- ICU patient charting
