# Order Management

Order Management is a simple Aide-only supply order tool for WHHS RT Schedule.

## Access

- Visible only to users with `staff_profiles.operations_role = aide`.
- The route is `/operations/order-management`.
- Staff, Lead, Director, Command Center, and unauthenticated users cannot use the workflow.
- Supabase RLS and storage policies enforce Aide-only access; the UI is not the only protection.

Junette and Michaela display as Aides when their existing staff profile role data has `operations_role = aide`. The app does not create duplicate staff profiles or change employment data for this display.

## Aide Card Styling

Staff with `operations_role = aide` display with:

- light pink card background
- pink `Aide` badge
- `Aide` as the visible title instead of FT/PD where the card uses an employment badge

This is display logic only. It does not change schedule times, employment type, published schedule entries, or role assignments.

## Create Order

The first version supports:

- take or upload a picture from a phone
- optional notes up to 280 characters
- automatic created-by attribution from the current Aide display name/staff profile
- saved order list with thumbnail, created date/time, creator, and notes

Notes show the helper text:

`No patient information.`

## Data Model

Orders are stored in `department_orders`.

Images are stored in the private `department-order-images` Supabase Storage bucket. The app stores the storage path and displays thumbnails with signed URLs.

The workflow must not store or display:

- patient names
- MRNs
- clinical details
- staff usernames
- auth IDs
- staff phone numbers
- staff emails

## Scope

This phase does not include approvals, inventory counts, order statuses, email notifications, vendor integrations, or permanent delete tools.
