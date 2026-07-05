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
- Check in rented BiPAP and V60 equipment as it arrives.
- Prepare for future check-out, transfer, barcode-driven lookup, room tracking, and return workflows.

The first active workflow is `Rental Check In`.

## Current Rental Scope

Rental Management currently supports:

- Rental company selection
- 1D barcode scan or manual serial entry
- BiPAP/V60 equipment type
- check-in date/time
- optional notes with no patient information
- active rental preview

Future cards still labeled `Coming Soon`:

- Active Rentals full workflow
- Transfer Room
- Return Equipment

## Out of Scope

This phase does not implement:

- Return workflow
- Room transfer
- Rental history
- Notifications
- Analytics
- Billing
- Payroll integration
- EMR integration
- Patient information
