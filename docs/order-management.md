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
- one `Aide Communication Board` button for Command Center notes and questions
- an `Order History` section for submitted orders
- `No department orders yet.` when the history is empty

The Create Order form opens separately in a mobile modal. It supports:

- take or upload a picture from a phone
- picture upload is optional but strongly encouraged
- optional `Req Number`
- optional PMM Numbers with catalog item-name lookup
- multiple manual Non-Catalog Items without fake PMM values
- optional notes up to 280 characters
- PMM-only, Non-Catalog-only, note-only, Req-number-only, and image-only orders are allowed
- automatic created-by attribution from the current Aide display name/staff profile
- `Submit Order` is disabled until a meaningful order component is present and all PMM/manual lines are valid
- saved order history cards with `Order Req - XXXXXX`, `Date: MM/DD/YYYY Time: HH:mm`, `Created by: User`, an image thumbnail when attached, and notes
- a `View Order` dialog with date, creator, Req Number, PMM numbers, historical item-name snapshots, Non-Catalog Items, notes, and an image when present
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
- PMM and item-name searching are not added in this phase; the explicit Req Number search behavior remains unchanged.
- History cards keep the printable operational format with left-aligned text details, a right-aligned thumbnail only when an image exists, and a centered `View Notes` button when notes exist.

## PMM Catalog

PMM numbers are stored as text so leading zeroes are preserved. Create Order accepts commas, spaces, semicolons, and line breaks, formats Space as a comma delimiter, and removes repeated PMMs while preserving their first-entered order. Values are never coerced through JavaScript numbers.

The catalog migration seeds 169 resolved records from the reviewed PMM bundle:

- 161 active and orderable
- 6 discontinued and non-orderable
- 2 do-not-use and non-orderable
- 6 of the active rows are marked `review_required`; they remain orderable but display an amber review warning

The 17 unresolved `unknown` or `review` records are excluded from the seed. An unseeded PMM displays as not found and cannot be submitted as a PMM line. The Order Management user may instead remove it and add a clearly named Non-Catalog Item; the app never guesses an item name or uses `NONSTOCK`, `0`, or another fake PMM.

Authorized Admin and Aide Order Management users may read the catalog. Authenticated browser users cannot insert, update, or delete catalog rows. Catalog additions and corrections require a reviewed forward-only migration. Before adding a row:

1. Confirm the PMM number and item name with the department.
2. Keep the PMM as numeric text and ensure it is unique.
3. Set status and `is_orderable` consistently.
4. Keep unresolved items out of the active seed.
5. Run the catalog count and duplicate checks in the post-apply verification SQL.

## Normalized Order Lines and Atomic Save

`department_order_lines` stores PMM and Non-Catalog lines. PMM lines reference `pmm_catalog` and copy the current catalog item name into `item_name_snapshot`. View Order reads that snapshot, so a later catalog rename does not rewrite historical orders. Legacy `department_orders` rows without child lines continue to display their existing Req Number, creator, notes, and image.

Create Order generates a UUID before upload because the private storage path includes the order ID. The same UUID is the database idempotency key. `create_department_order_with_lines` authenticates the caller internally, verifies department membership plus the existing Admin/Aide role, revalidates every PMM, and writes the parent and all lines in one PostgreSQL transaction. An identical retry returns the existing order ID; a conflicting reuse is rejected.

Image storage is external to the PostgreSQL transaction. The browser uploads first and removes the private object after an explicit database rejection. A tab closure, transport ambiguity, or failed cleanup can leave an orphaned private object, but the RPC cannot leave a partial parent/line database order.

## PMM Migration and Rollout

The forward-only migration is `202607150001_order_management_pmm_catalog.sql`. It must not be applied until the target migration history is reconciled, because older duplicate timestamp prefixes exist and the production state is unknown.

Approved rollout order:

1. Run `supabase/manual/order_management_pmm_preflight.sql` read-only against the approved target.
2. Review its required tables, columns, helpers, policies, and grants.
3. Apply only the reviewed PMM migration through the approved Supabase process; do not create or manipulate a migration-history table.
4. Run `supabase/manual/order_management_pmm_post_apply_verification.sql` read-only and confirm 169 total rows, 161 active/orderable, 6 discontinued, 2 do-not-use, 6 review-required, zero duplicates, RLS, function ACLs, and indexes.
5. Deploy the matching application only after the schema verification succeeds.
6. Complete role and workflow acceptance testing in an approved non-production environment before a production pilot.

Rollback is application-first and forward-only: revert the application release while leaving the additive catalog and historical line data in place. Do not drop catalog or line tables after real orders exist. Any destructive cleanup requires a separately reviewed maintenance plan.

Manual acceptance must cover active, amber-review, unknown, discontinued, do-not-use, duplicate, Non-Catalog, PMM-only, legacy, image, notes, Req Number, long mobile View Order, Aide/Admin access, forbidden roles, and public `/login`. These tests must use approved non-PHI test data and an approved environment.

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

## Aide Communication Board

The `Aide Communication Board` button opens a shared Command Center-to-Aide notes workflow.

- Respiratory Command Center users, Lead users, and Admin users can create notes or questions for RT Aides.
- Creating an RT-side note requires `Added by`. The selector uses active Lead/Admin staff options, with `Not listed? Type name manually` as a fallback. The visible `Created by` value uses this selected or typed display name.
- Aide and Admin users can view notes from Order Management as separate task/message cards with status and priority chips.
- Aide and Admin users can acknowledge new notes with a compact checkbox-style control.
- Optional Aide notes are collapsed behind `+ Add Note` by default; Aides can acknowledge without writing a note. Sending an Aide note requires `Added by` from the active Aide list, with the same manual fallback.
- If an Aide note exists, it appears directly under the original RT note. Acknowledgement metadata appears at the bottom of the note card.
- Normal note cards use soft purple styling. Urgent note cards use soft red styling.
- Aide Communication Board shows 10 active notes at a time. `Load More` reveals the next 10 while the Order Management badge still counts all notes with `status = new`.
- The Order Management button shows a `new` badge count for notes with `status = new`.
- Acknowledging a note saves acknowledged date/time and the Aide/Admin display name, then removes it from the new-note badge count.
- Sending an optional note saves response text, responded date/time, and responder display name, and sets status to `responded`.
- RT Command Center users can reopen `Aide Communication Board` to see whether notes are New, Acknowledged, or Responded and can read optional Aide note text.
- Staff, Director, ICU Command Center, and unauthenticated users do not have access.

Note and optional Add Note fields are capped at 500 characters and show:

`No patient information.`

## Data Model

Orders are stored in `department_orders`.

PMM catalog entries are stored in `pmm_catalog`. Normalized PMM and Non-Catalog order lines are stored in `department_order_lines`.

Images are stored in the private `department-order-images` Supabase Storage bucket, not directly as base64 in the database. The app stores the storage path and displays thumbnails/previews with signed URLs. Full-size signed image previews load only when the user taps a thumbnail.

Order history uses indexes for newest-first history and Req Number lookup:

- `department_orders_department_created_idx` and `department_orders_created_at_idx` support newest-first order history.
- `department_orders_req_number_idx` supports Req Number search.

The shared To-Do List is stored in `order_management_todo` as one department-scoped row. RLS allows Admin and Aide users to read and update the shared note.

Aide Communication Board records are stored in `rt_aide_notes`. RLS allows Admin, Lead, and Respiratory Command Center users to create/view notes, and Aide/Admin users to acknowledge or respond. Staff, Director, ICU Command Center, and unauthenticated users are not granted note access.

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
