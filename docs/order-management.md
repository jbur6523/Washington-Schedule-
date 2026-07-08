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
- one yellow `To-Do List` button
- one `RT Aide Notes` button for Command Center notes and questions
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
- saved order history cards with `Order Req - XXXXXX`, `Date: MM/DD/YYYY Time: HH:mm`, `Created by: User`, an image thumbnail when attached, and notes
- tapping a thumbnail opens a full-size preview modal so photographed order sheets can be read

Admin users open the same modal form as Aides and can create/upload orders for beta testing. Admin users also see submitted orders, thumbnails, created date/time, creator display names, and notes for monitoring.

Notes show the helper text:

`No patient information.`

## Order History

Order History is optimized for larger order volume:

- The default view automatically loads only the 7 most recent submitted orders.
- If more orders exist, a centered `View All` button appears below the current list.
- After `View All`, order history loads in pages of 25 orders at a time and a centered `Load More Orders` button fetches the next page while more orders exist.
- `Order Look Up` searches the database by optional Req Number, including older orders outside the recent list.
- Search does not run while typing. The user enters a Req Number and taps the enabled `Search Order` button, or clears the search to return to the default recent list.
- Search supports partial Req Number matching.
- History cards keep the printable operational format with left-aligned text details, a right-aligned thumbnail only when an image exists, and a centered `View Notes` button when notes exist.

## To-Do List

The `To-Do List` button opens a modal shared by all Order Management users in the department.

- Admin and Aide users can view and edit the same shared note.
- The modal contains one large text area for supply/order tasks.
- Changes save only when the user taps `Save`.
- The bottom action says `Close` when there are no edits and changes to `Save` when the note has unsaved changes.
- Using the top close button with unsaved changes shows a `Discard unsaved changes?` confirmation.
- Metadata shows the last updated date/time and display name.
- `Close` dismisses the modal without changing saved content.
- `Clear List` is a green completion action and requires confirmation before setting the shared note to blank.
- After clearing, the confirmation card transforms into a same-size celebration card for about 1 second, then closes the To-Do List modal automatically.
- The clear-list celebration cycles through: `Slaaayyyyyy`, `Productivity MAXIMIZED`, `Clean slate activated`, `We are so back.`, and `Chaos reduced by 3%`.
- The clear-list cycle uses local device storage key `order-todo-clear-message-index` when available.
- The celebration message is not shown as a bottom toast or as a large banner inside the To-Do List editor.
- The helper text says `No patient information.`

## RT Aide Notes

The `RT Aide Notes` button opens a shared Command Center-to-Aide notes workflow.

- Respiratory Command Center users, Lead users, and Admin users can create notes or questions for RT Aides.
- Creating an RT-side note requires `Added by`. The selector uses active Lead/Admin staff options, with `Not listed? Type name manually` as a fallback. The visible `Created by` value uses this selected or typed display name.
- Aide and Admin users can view notes from Order Management as separate task/message cards with status and priority chips.
- Aide and Admin users can acknowledge new notes with a compact checkbox-style control.
- Optional Aide notes are collapsed behind `+ Add Note` by default; Aides can acknowledge without writing a note. Sending an Aide note requires `Added by` from the active Aide list, with the same manual fallback.
- If an Aide note exists, it appears directly under the original RT note. Acknowledgement metadata appears at the bottom of the note card.
- Normal note cards use soft purple styling. Urgent note cards use soft red styling.
- RT Aide Notes show 10 active notes at a time. `Load More` reveals the next 10 while the Order Management badge still counts all notes with `status = new`.
- The Order Management button shows a `new` badge count for notes with `status = new`.
- Acknowledging a note saves acknowledged date/time and the Aide/Admin display name, then removes it from the new-note badge count.
- Sending an optional note saves response text, responded date/time, and responder display name, and sets status to `responded`.
- RT Command Center users can reopen `RT Aide Notes` to see whether notes are New, Acknowledged, or Responded and can read optional Aide note text.
- Staff, Director, ICU Command Center, and unauthenticated users do not have access.

Note and optional Add Note fields are capped at 500 characters and show:

`No patient information.`

## Data Model

Orders are stored in `department_orders`.

Images are stored in the private `department-order-images` Supabase Storage bucket, not directly as base64 in the database. The app stores the storage path and displays thumbnails/previews with signed URLs. Full-size signed image previews load only when the user taps a thumbnail.

Order history uses indexes for newest-first history and Req Number lookup:

- `department_orders_department_created_idx` and `department_orders_created_at_idx` support newest-first order history.
- `department_orders_req_number_idx` supports Req Number search.

The shared To-Do List is stored in `order_management_todo` as one department-scoped row. RLS allows Admin and Aide users to read and update the shared note.

RT Aide Notes are stored in `rt_aide_notes`. RLS allows Admin, Lead, and Respiratory Command Center users to create/view notes, and Aide/Admin users to acknowledge or respond. Staff, Director, ICU Command Center, and unauthenticated users are not granted note access.

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
