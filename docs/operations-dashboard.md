# Operations Dashboard

The Operations Dashboard is the department operations entry point for WHHS RT Schedule. It is separate from personal schedule management.

## Access

Dashboard access is role based:

- Admin users see `Admin Dashboard`.
- Lead users see `Lead Dashboard`.
- Staff with `staff_profiles.operations_role = aide` see `Aide Dashboard`.
- Regular staff do not see the dashboard button.

Admins and leads use their existing app role. Aide access is a separate operations capability so it does not grant lead/admin schedule permissions.

Unauthenticated users are redirected to login. Regular staff who open dashboard routes directly see a friendly access-denied state.

## Header Entry Point

The top header shows one dashboard button for users with operations access:

- Admin
- Lead
- Aide

The dashboard page title uses the full label.

## Rental Management

The first dashboard tool is `Rental Management`.

Purpose:

- Track BiPAP V60 rentals.
- Log called-in BiPAP V60 rental orders and confirm delivery from pending cards.
- Prepare for future check-out, transfer, barcode-driven lookup, room tracking, and return workflows.

The first active workflow is `Rental Check In`.

## Current Rental Scope

Rental Management currently supports:

- Rental company selection
- Equipment Type: BiPAP
- Model: V60
- Called In / Pending Delivery logging
- Pending Delivery cards only when pending records exist
- delivery confirmation from a Pending Delivery card
- 1D barcode scan or manual serial entry during delivery confirmation
- Delivered / Check In date/time
- optional notes with no patient information
- active rental summary on the Rental Management dashboard
- dedicated Active Rentals screen with full active rental details
- dedicated Rental History screen for searching, filtering, and manually exporting pending, active, called-for-pickup, and picked-up rental records
- Return Equipment workflow for pickup calls and picked-up confirmation
- dashboard Pending section for pending deliveries and pending pickups, with neutral cancel actions that preserve Rental History events

The Rental Management dashboard stays summary-focused. `View Active Rentals` opens the full list, sorted oldest active rental first.
`Rental History` opens the searchable history list with status, equipment, vendor, and date range filters. It can export the current filtered view or all history as an Excel-compatible CSV paper trail. The app database remains the source of truth, and this phase does not sync with Google Drive, Google Sheets, OneDrive, SharePoint, or Excel Online.

Return Equipment is active and opens a dedicated workflow screen.

## Out of Scope

This phase does not implement:

- Return workflow
- Room transfer
- Notifications
- Analytics
- Billing
- Payroll integration
- EMR integration
- Patient information
