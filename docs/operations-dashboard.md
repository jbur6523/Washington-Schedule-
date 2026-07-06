# Operations Dashboard

The Operations Dashboard is the department operations entry point for WHHS RT Schedule. It is separate from personal schedule management.

## Access

Dashboard access is role based:

- Admin users see `Admin Dashboard`.
- Lead users see `Lead Dashboard`.
- Staff with `staff_profiles.operations_role = aide` see `Aide Dashboard`.
- Staff with `staff_profiles.operations_role = command_center` route to the separate Respiratory Command Center instead of the normal Operations Dashboard.
- Staff with `staff_profiles.operations_role = director` route to the read-only Shift Status page instead of the normal Operations Dashboard.
- Regular staff do not see the dashboard button.

Admins and leads use their existing app role. Aide access is a separate operations capability so it does not grant lead/admin schedule permissions.
Command Center and Director access are separate experiences for shared department operations and director read-only status viewing.

Unauthenticated users are redirected to login. Regular staff who open dashboard routes directly see a friendly access-denied state.

## Header Entry Point

The top header shows one dashboard button for users with operations access:

- Admin
- Lead
- Aide

The dashboard page title uses the full label.
Command Center and Director accounts do not use this header entry point because they route directly to their simplified pages after login.

## Respiratory Command Center

The Respiratory Command Center is available at `/command-center` for `operations_role = command_center`.

Seeded shared-device login:

- Username: `sputum`
- Temporary password: `2000`

The command phone menu contains:

- Shift Update
- Rental Management
- Short Shift Alert

It does not show the normal bottom navigation, Gossip, Staff Directory, Admin settings, or personal staff tools. Rental actions and Short Shift actions require staff attribution so history and exports show the selected staff member or initials instead of the shared login.

Trusted-device sign-in persistence is documented in `docs/auth.md`. It keeps the Supabase session on the department phone without storing the command-center password.

## Director Shift Status

The Director read-only page is available at `/director/shift-status` for `operations_role = director`.

Seeded director username:

- `aloha`

The Director should set or choose his own password through the normal password setup/reset process. The page is the primary live visual reporting dashboard for respiratory shift status. It uses a compact executive layout with visible header `Sign Out`, a `Respiratory Directory` action, a `Current Shift Status` card for Scheduled and RTs Needed, a `Department Snapshot` card for Vents, BiPAPs, scheduled procedure total, Active Rentals, left-aligned shift/date context, and last-updated metadata, plus scheduled procedure detail cards with left-aligned shift/date context. The `Respiratory Directory` modal includes all active and inactive staff names and phone numbers from `staff_profiles`, sorted by display name, without usernames, auth IDs, emails, edit buttons, or admin controls. The Current Shift Status card also includes `View Shift`, which opens a read-only modal schedule preview for uploaded dates and Day/Night shifts. The modal defaults to the current `America/Los_Angeles` date when uploaded, then the closest future uploaded date, then the previous shift date if no future date exists. Its date dropdown shows the previous shift date when uploaded, the current date when uploaded, and all future uploaded dates; older past dates can be entered manually as `MMDDYY`. View Shift defaults to Day Shift from `07:00-18:59` Pacific or Night Shift from `19:00-06:59` Pacific, and the schedule list has extra bottom padding so the final staff card remains visible. Scheduled Procedures reset to `0` at `07:30` and `19:30` Pacific until a new Command Center update is submitted after the reset boundary, while Department Snapshot continues showing latest known Vent, BiPAP, and Active Rentals numbers. The page remains read-only and does not allow editing.

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

Command Center and Lead/Admin users can save shift updates. Normal Schedule users see `Current Shift Status` directly under the Schedule page Shift View selector instead of the old Scheduled, Available, Coverage, Short Shifts, and Switch Requests summary row. The compact Schedule card shows RTs Scheduled, RTs Needed, Vents, last updated time, and updated-by attribution when available. RTs Needed can include decimals such as `6.9`. `Staffed`, `Short`, or `No Update` appears only in the title line; Staffed is green, Short is red, and No Update is neutral gray. The compact Schedule card ignores the Day/Night/All schedule filter and uses the same Command Center update source as the Director dashboard. It prefers the active current-shift window: Day Shift is `08:00-19:59`, and Night Shift is `20:00-07:59`. During the day window, it can fall back to a same-day Night update if one has already been submitted; after the night reset, it does not fall back to stale Day data. The Director Shift Status page remains the fuller read-only dashboard with staffing, equipment, scheduled procedure counts, freshness indicator, text report, Respiratory Directory, View Shift modal, and Sign Out.

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
