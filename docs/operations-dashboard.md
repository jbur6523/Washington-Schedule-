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

- Track BiPAP and ventilator rentals.
- Prepare for future check-out, check-in, transfer, barcode scanning, room tracking, and active rental status.

This phase is only the shell and placeholder.

## Placeholder Scope

The Rental Management placeholder page shows future cards:

- Check Out Rental
- Active Rentals
- Transfer Room
- Return Equipment

These are labeled `Coming Soon`.

## Out of Scope

This phase does not implement:

- Barcode scanner
- Rental database tables
- Check-out/check-in
- Room transfer
- Rental history
- Notifications
- Analytics
- Billing
- Payroll integration
- EMR integration
- Patient information
