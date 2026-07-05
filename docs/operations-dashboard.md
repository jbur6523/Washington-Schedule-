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

## Director Shift Status

The Director read-only page is available at `/director/shift-status` for `operations_role = director`.

Seeded director username:

- `aloha`

The Director should set or choose his own password through the normal password setup/reset process. The page shows staffing, equipment, procedure counts, last updated time, and updated-by display name/initials. It does not allow editing.

## Rental Management

The first dashboard tool is `Rental Management`.

Purpose:

- Track BiPAP V60 rentals.
- Log called-in BiPAP V60 rental orders and confirm delivery from pending cards.
- Start pickup requests for active BiPAP V60 rentals and complete pickup from pending cards.
- Prepare for future transfer, room tracking, notifications, and analytics workflows.

The dashboard starts with `Rental Actions`, which contains `Order Rental` and `Return Rental`.

## Current Rental Scope

Rental Management currently supports:

- Rental company selection
- Equipment Type: BiPAP
- Model: V60
- Called In / Pending Delivery logging
- Pending Delivery cards only when pending records exist
- delivery confirmation from a Pending Delivery card
- 1D barcode scan or manual Barcode # entry during delivery confirmation
- optional Serial Number entry when the equipment label is available
- Delivered / Confirm Delivery date/time
- optional notes with no patient information
- combined Rental Management overview card with Active Rentals count and Oldest Rental `MM/DD` date
- dedicated Active Rentals screen with full active rental details
- dedicated Rental History screen for searching, filtering, and manually exporting pending, active, called-for-pickup, and picked-up rental records
- Return Rental workflow for pickup calls and picked-up confirmation
- dashboard Pending section for pending deliveries and pending pickups, with neutral cancel actions that preserve Rental History events

The Rental Management dashboard stays summary-focused. The top overview card combines the page title with Active Rentals count, Oldest Rental date, and `View Active Rentals`. `View Active Rentals` opens the full list, sorted oldest active rental first. The compact `Rental Actions` card combines `Order Rental` and `Return Rental` so the dashboard does not need separate action cards for each workflow.
`Rental History` opens the searchable history list with status, equipment, vendor, and date range filters. It can export the current filtered view or all history as an Excel-compatible CSV paper trail. The app database remains the source of truth, and this phase does not sync with Google Drive, Google Sheets, OneDrive, SharePoint, or Excel Online.

Return Rental is active and opens the existing dedicated pickup request workflow screen.

## Shift Status Updates

Command Center and Lead/Admin users can save shift updates. Normal Schedule users see only the compact current shift summary: RTs on/needed, vent count, and last updated time. The Director Shift Status page shows the full read-only staffing, equipment, and scheduled procedure counts.

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
