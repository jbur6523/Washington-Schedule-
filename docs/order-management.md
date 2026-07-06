# Order Management

Order Management is a simple department supply order tool for WHHS RT Schedule. Aides are the primary users, and Admin has full access for beta testing and oversight.

## Access

- Visible to users with `staff_profiles.operations_role = aide`.
- Admin users can also open Order Management with the same create/view permissions as Aides.
- The route is `/operations/order-management`.
- Staff, Lead, Director, Command Center, and unauthenticated users cannot use the workflow.
- Supabase RLS and storage policies enforce Aide/Admin create, upload, and read access; the UI is not the only protection.

Junette and Michaela display as Aides when their existing staff profile role data has `operations_role = aide`. The app does not create duplicate staff profiles or change employment data for this display.

## Aide Card Styling

Staff with `operations_role = aide` display with:

- light pink card background
- pink `Aide` badge
- `Aide` as the visible title instead of FT/PD where the card uses an employment badge

This is display logic only. It does not change schedule times, employment type, published schedule entries, or role assignments.

## Create Order

The main Order Management page stays compact:

- one primary `Create Order` button
- an `Order History` section for submitted orders
- `No department orders yet.` when the history is empty

The Create Order form opens separately in a mobile modal. It supports:

- take or upload a picture from a phone
- picture upload is optional but strongly encouraged
- optional `Req Number`
- optional notes up to 280 characters
- note-only or Req-number-only orders are allowed when a picture is not available
- automatic created-by attribution from the current Aide display name/staff profile
- `Submit Order` is disabled until a picture, note, or Req Number is entered
- saved order history cards with `Order Req - XXXXXX`, `Date: MM/DD/YYYY Time: HH:mm`, `Created by: User`, thumbnail, and notes
- tapping a thumbnail opens a full-size preview modal so photographed order sheets can be read

Admin users open the same modal form as Aides and can create/upload orders for beta testing. Admin users also see submitted orders, thumbnails, created date/time, creator display names, and notes for monitoring.

Notes show the helper text:

`No patient information.`

## Data Model

Orders are stored in `department_orders`.

Images are stored in the private `department-order-images` Supabase Storage bucket. The app stores the storage path and displays thumbnails/previews with signed URLs.

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
