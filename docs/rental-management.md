# Rental Management

Rental Management is a department operations tool for tracking rented BiPAP V60 equipment.

BiPAP is the equipment category. V60 is the model. User-facing rental screens should identify this equipment as `BiPAP V60`. Quick-reference cards use `BiPAP V60 - SN XXXXX` when a serial number is available, otherwise `BiPAP V60 - Barcode XXXXX`.

Rental identifiers are tracked separately:

- `Barcode #` is required when delivery is confirmed. It is the value scanned from the equipment barcode sticker.
- `Serial Number` is optional but encouraged when visible on the equipment/product label.

This phase implements Rental Actions, Pending Delivery cards, Active Rentals, Return Rental, and Rental History.

## Access

Rental Management is available to:

- Admin
- Lead
- Aide Dashboard users
- Command Center shared-device users

Regular staff cannot access Rental Management routes.

For Command Center users, rental lifecycle actions require staff attribution before saving. The selected staff member is used in Rental History and printable exports. Normal Admin, Lead, and Aide personal logins continue to auto-use the current logged-in staff member.

## Order Rental Workflow

Order Rental opens as a dedicated workflow at `/operations/rental-management/check-in` instead of expanding inline on the main Rental Management page.

It logs the called-in rental order only:

1. Select the rental company.
2. Enter the quantity ordered.
3. Review the prefilled equipment details: Equipment Type `BiPAP`, Model `V60`.
4. Review the compact called-in metadata: date, time, and staff member.
5. Add an optional note only if needed.
6. Save the pending delivery.

When the workflow is used from the shared Command Center login, the form requires an ordered-by staff selection before saving.

Saving creates one blue `Pending Delivery` record per ordered BiPAP V60. It does not require a barcode or serial number because the equipment has not arrived yet. Each pending record is confirmed separately when the matching device is delivered and scanned.

The Order Rental screen is intentionally compact:

- `Order Details` contains the rental company, quantity, vendor info, BiPAP V60 equipment display, and compact called-in metadata.
- Quantity defaults to `1`. If staff order multiple BiPAP V60 rentals at once, saving creates one separate `Pending Delivery` record per unit so each delivered device can later be scanned in with its own `Barcode #` and optional `Serial Number`.
- Called-in date/time/by are auto-captured from the current user/session and shown as small metadata.
- `Edit called-in details` is available if the date or time needs correction.
- Notes are optional and hidden behind `Add Note`.
- `Review & Save` summarizes the order before creating the pending delivery.

`Save Pending Delivery` remains disabled until required details are complete. Notes are optional, hidden by default, limited to 140 characters, and continue to show the `No patient information` reminder.

The Rental Management dashboard combines the department operations title and rental summary stats into one overview card. It shows Active Rentals count, Pending count, and the oldest active rental delivered date in `MM/DD` format. Active Rentals count includes only delivered/active rentals. Pending counts include both pending deliveries and pending pickups until the equipment is scanned in or scanned out. A compact `Rental Actions` card sits below the overview card with `Order Rental`, `Return Rental`, and `View Active Rentals` buttons. The old separate Order Rental and Return Rental dashboard cards were removed to reduce scrolling. The `Pending` section only appears when there is at least one pending delivery or pending pickup.

## Delivery Confirmation

Delivery confirmation starts from a Pending Delivery card on the main Rental Management dashboard. The dashboard action opens a centered `Confirm Delivery` modal immediately because the pending rental order is already selected. Staff do not need to leave Rental Management or reselect the rental from this path.

1. Tap `BiPAP V60 Delivered` or `Mark Delivered`.
2. Scan the equipment barcode inside the modal or enter the `Barcode #` manually.
3. Confirm the current location. It defaults to `RT Equipment Room`.
4. Enter `Serial Number` only if it is visible and easy to capture.
5. Use the auto-filled delivered date/time and staff member, or use `Edit delivery details` if corrections are needed.
6. Confirm delivery.

Confirming delivery updates the pending record to `active`, sets the delivered timestamp in `checked_in_at`, records the current location, saves `Barcode #`, saves `Serial Number` if entered, creates delivery events, and returns to the main Rental Management page with a `Rental delivered and active.` success message. The Active Rentals summary reloads so newly delivered equipment is included in the count.

`Barcode #` is required before `Confirm Delivery` is enabled. `Serial Number` is optional. Cancel closes the modal without creating partial delivery records.

When delivery is confirmed from the shared Command Center login, the modal requires delivered-by staff attribution. Rental History and exports show that selected person rather than the shared `sputum` login.

The full `/operations/rental-management/deliver/[id]` Confirm Delivery page remains available as a direct-route fallback, but the normal Pending Delivery dashboard card uses the modal flow.

## Stale-State Protection

Rental lifecycle writes are guarded by database transition functions so stale UI state and duplicate taps cannot create conflicting events.

Guarded transitions:

- `create_pending_rental_delivery`: creates each pending delivery record and its matching `called_in` event together.
- `confirm_rental_delivery`: allows only `pending_delivery` / `called_in` to become `active`; it saves barcode/serial/equipment identity and creates delivery events only after the guarded status update succeeds.
- `call_rental_pickup`: allows only `active` / `delivered` rentals to become `pickup_called`.
- `cancel_rental_pickup`: allows only pickup-pending statuses to return to `active`.
- `confirm_rental_picked_up`: allows only pickup-pending statuses to become `picked_up`.
- `cancel_rental_delivery`: allows only `pending_delivery` / `called_in` to become `delivery_cancelled`.

If another user already updated a rental from a stale modal, the action is rejected, no event is inserted, Rental Management refreshes, and the user sees a friendly stale-state message. Save/confirm buttons are also disabled while requests are pending to prevent double submission.

Command Center attribution is preserved by passing the selected staff profile to the transition functions. Rental History and exports continue to display the selected staff actor rather than the shared device account.

## Rental Lifecycle

Rental records use these user-facing lifecycle states:

- `Pending Delivery` displays blue. The rental was called in, but the equipment has not arrived.
- `Active` displays green. The equipment has been delivered and is physically in the hospital.
- `Called for Pickup` displays yellow. The vendor has been called, but the equipment is still physically in the hospital.
- `Picked Up` displays gray. The equipment has physically left the hospital.
- `Delivery Canceled` displays gray. The rental order was called in but will not be delivered.

`checked_in_at` remains the stored delivered time for compatibility. In the UI it is shown as `Delivered`.

## Vendors

Default rental vendors are seeded into `rental_vendors` for existing departments:

- US Med Equipment, formerly Freedom, `877-677-7767`
- Med One Capital, `510-380-8225`
- Agiliti Health Inc, formerly UHS, `510-279-3042`
- SRC, use only as last resort, `800-669-5767`
- Other

US Med Equipment has the first sort order and should appear first.

## Barcode Support

The scanner uses `@zxing/browser` with `@zxing/library`.

Supported browser barcode formats include:

- CODE_128
- CODE_39
- CODE_93
- UPC-A
- UPC-E
- EAN-13
- EAN-8
- ITF

If camera access is denied or scanning is unsupported, staff can enter `Barcode #` manually.

The scanner shows camera permission and scanning status. After a successful scan, the scanned barcode value is shown with a green confirmation state and can be rescanned if needed.

## Equipment Details

Supported equipment in this phase:

- Equipment Type: BiPAP
- Model: V60

Older records may store `bipap` or `v60` in `equipment_type`; the UI normalizes both to `BiPAP V60`.

Delivered Date defaults to the current date. Delivered Time defaults to the current time in 24-hour input format.

Called In Date and Called In Time default to the current date/time on the Order Rental form and are presented as compact metadata inside Order Details. Delivery Date defaults to the current date. Delivery Time defaults to the current time in 24-hour input format on the delivery confirmation screen.

Current location defaults to `RT Equipment Room`. Available locations are:

- RT Equipment Room
- ED
- ICU
- 2nd Floor
- 3rd Floor
- Other

If `Other` is selected, staff can enter a short custom location. Patient names, MRNs, and clinical details must not be entered.

Notes are optional and limited to 140 characters.

## Barcode and Serial Number

`Barcode #` and `Serial Number` are separate fields.

- The scanner fills `Barcode #` only.
- `Barcode #` is required for delivery confirmation.
- `Serial Number` is optional and is entered manually if available.
- New active rentals should always have a `Barcode #`.
- Legacy test records may only have the old `serial_number` value; the UI displays those safely without crashing.

## Duplicate Protection

Before saving a delivered check in, the app checks for an existing in-hospital rental with the same department and matching `Barcode #` or `Serial Number`.

If an active or called-for-pickup rental already exists, the app does not create a duplicate. It shows:

- Company
- Equipment type
- Barcode #
- Serial Number, if entered
- Current location
- Delivered date/time
- Delivered staff member

The user can view Active Rentals or cancel the check in.

## Active Rentals

Active Rentals shows equipment that is still physically in the hospital:

- `active` records display green as `Active`.
- `pickup_requested` / `pickup_called` / `called_for_pickup` records display yellow as `Called for Pickup`.

Pending Delivery records are shown in the dashboard `Pending` section only when pending records exist, and they also appear in Rental History. Called-for-pickup rentals show as yellow pending pickup cards on the dashboard and are counted under Pending until scanned out or canceled. Picked-up records (`returned` / `picked_up`) and delivery-canceled records are excluded from Active Rentals and remain available in Rental History.

The list is sorted by `checked_in_at` ascending so the equipment that has been in the hospital the longest appears first.

The Rental Management dashboard shows a compact summary only:

- Active Rentals count for delivered/active rentals only
- Pending count for pending deliveries and pending pickups
- Oldest Rental `MM/DD` date

The full Active Rentals details live on `/operations/rental-management/active`, opened by the `View Active Rentals` button in `Rental Actions`.

Each detail card shows:

- Equipment type
- Barcode #
- Serial Number
- Company
- Last known location
- Days in hospital
- Called-in date/time, if available
- Delivered date/time
- Delivered staff member

Called-for-pickup cards also show the pickup call time and staff member when a pickup event exists.

## Return Rental

Return Rental is available at `/operations/rental-management/return`.

This page starts a new pickup request for equipment that is currently green `Active`.

The Return Rental selection list only shows active rentals that have not already been called for pickup. Yellow `Called for Pickup` rentals are completed or canceled from the dashboard `Pending` section instead.

Staff can find equipment by scanning a 1D barcode, manually entering a barcode or serial number, or selecting from active rentals. A single barcode/serial match highlights the active rental automatically. Pending Delivery, Called for Pickup, and Picked Up records are not selectable for new pickup requests.

Barcode/manual serial lookup uses these messages for non-active matches:

- Called for Pickup: use the `Pending` section to confirm pickup or cancel the pickup request.
- Picked Up: view Rental History for details.
- Pending Delivery: this rental has not been delivered yet.
- No match: no active rental was found for that barcode / serial number.

The Return Rental screen remains the starting point when staff need to scan or select equipment from scratch. It does not show a large selected-rental detail page; selected cards reveal a compact `Call for Pickup` action, and the confirmation details live in the modal. Pending Pickup dashboard cards bypass this screen and go straight to the picked-up confirmation modal.

### Call for Pickup

For green `Active` rentals, `Call for Pickup` records that the vendor was called but the equipment is still physically in the hospital. The selected rental opens a centered `Call for Pickup` modal instead of a long inline detail form.

The modal shows the equipment, Barcode #, optional Serial Number, company, current location, delivered date/time, in-hospital duration, and vendor phone when available. Pickup request date/time/by are auto-captured from the current user and current time.

`Edit pickup details` expands optional fields for:

- Date called
- Time called
- Called by current logged-in staff member
- Optional pickup confirmation / reference number
- Optional note

Saving with `Confirm Pickup Request` changes the rental status to `pickup_called`, turns the card yellow as `Called for Pickup`, creates a `pickup_called` rental event, returns to Rental Management, and counts the equipment under Pending until pickup is completed or canceled.

Command Center pickup requests require a selected staff member before saving.

Called-for-pickup rentals also appear in the dashboard `Pending` section as yellow pending pickup cards. When staff start from a Pending Pickup card, the `BiPAP V60 Picked Up` button opens a centered `Confirm Picked Up` modal immediately because the rental has already been selected. Staff do not need to scan, search, or re-select the rental from that path.

### Confirm Picked Up

For yellow `Called for Pickup` rentals, `Confirm Picked Up` records that the equipment physically left the hospital. It is also available as a secondary option for Active rentals if pickup happens without the pickup call being logged first.

The form captures:

- Date picked up
- Time picked up
- Picked up confirmed by current logged-in staff member
- Optional note

Saving changes the rental status to `picked_up`, sets `returned_at`, creates a `picked_up` rental event, removes the equipment from Active Rentals, and keeps it visible in Rental History.

If a pickup request was created by mistake, `Cancel Pickup` opens a confirmation form. Confirming it changes the rental back to `active`, clears the current pickup request fields, creates a `pickup_cancelled` rental event, keeps the original pickup event in history, and leaves the equipment in Active Rentals as green Active.

Command Center picked-up confirmation and cancellation require selected staff attribution.

Full transfer workflow remains future work.

## Pending Section

The dashboard `Pending` section is hidden when there are no pending deliveries or pending pickups.

Pending Delivery cards are blue and appear when rentals have been ordered but not delivered. Each card shows:

- Equipment type
- Rental company
- Called-in date/time
- Called-in staff member
- Optional note
- Delivered action button
- Cancel Delivery button

Pending Delivery does not count as Active Rentals because the equipment is not physically in the hospital yet.

`BiPAP V60 Delivered` opens the direct `Confirm Delivery` modal with barcode scanning, manual Barcode # entry, optional Serial Number entry, current location, delivered date/time, and delivered-by metadata.

`Cancel Delivery` opens a confirmation form. Confirming it changes the rental status to `delivery_cancelled`, creates a `delivery_cancelled` event, removes the blue pending card, does not add the rental to Active Rentals, and keeps the record visible in Rental History.

Pending Pickup cards are yellow and appear when a rental has been called for pickup but is still physically in the hospital. Each card shows:

- Equipment type
- Barcode #
- Serial Number
- Rental company
- Current location
- Pickup requested date/time
- Pickup requested staff member
- Optional confirmation/reference number
- Optional note
- Picked Up action button
- Cancel Pickup button

## Rental History

Rental History is available at `/operations/rental-management/history` and replaces the old Transfer Room placeholder.

It is the permanent searchable record of BiPAP V60 rental records in the app. It includes:

- Active rental records
- Pending Delivery records
- Called-for-pickup rental records
- Picked-up rental records
- Multiple rental cycles for the same Barcode # or Serial Number
- Pickup call and picked-up lifecycle events

Search supports Barcode #, Serial Number, company, equipment type, last known location, called-in staff, delivered staff, picked-up-by staff when a pickup event exists, and notes.

Rental History uses a compact filter card so records appear quickly on mobile:

- Search bar at the top
- Dropdown-style Status filter
- Dropdown-style Date filter
- Dropdown-style Equipment filter
- More Filters panel for company/vendor and clearing filters

Filter options include:

- Status: All, Pending Delivery, Active, Called for Pickup, Picked Up
- Equipment: All Equipment, BiPAP V60
- Company/vendor
- Date range: All Time, Today, Last 7 Days, Last 30 Days, Custom Range

Date range matching includes a rental if it was active at any point during the selected range or if a lifecycle event occurred during that range:

- called in during the range
- delivered during the range
- picked up during the range
- delivered before the range and picked up after the range
- delivered before the range and still active

History rows are compact by default. Each row shows status color, status label, equipment type, Barcode #, Serial Number when entered, company, location when delivered, date range, and an expand chevron.

Expanded history rows show:

- Equipment type
- Barcode #
- Serial Number
- Company
- Status
- Called-in date/time
- Called-in staff member
- Delivered date/time
- Delivered staff member
- Last known location
- Called-for-pickup date/time, when present
- Pickup confirmation / reference number, when present
- Pickup note, when present
- Picked-up date/time, when present
- Picked-up-by staff member, when a picked-up event exists
- Return note, when present
- Total time in hospital
- Notes, if present
- Rental event timeline, when events exist

Active Rental cards include a `View History` action that opens Rental History filtered to that machine serial number.

### Rental History Export

Rental History includes manual CSV exports formatted as a compact printable respiratory rental equipment log:

- `Export Current View` exports records matching the current search, status, equipment, company, and date filters.
- `Export All History` exports all rental history records the user can access for the department.

Export filenames use:

- `whhs-rental-equipment-log-YYYY-MM-DD.csv`
- `whhs-rental-equipment-log-all-YYYY-MM-DD.csv`

The app and Supabase database remain the source of truth. CSV files are paper-trail copies only. This phase does not sync with Google Drive, Google Sheets, OneDrive, SharePoint, Excel Online, or any personal cloud account.

Exported columns match the printable paper log layout:

- Rental Company
- Qty
- Barcode #
- Serial Number
- Equipment Description
- Ordered Date
- Ordered Time
- Ordered Initials
- Delivered Date
- Delivered Time
- Delivered Initials
- Called for Return Date
- Called for Return Time
- Called for Return Initials
- Picked Up Date
- Picked Up Time
- Picked Up Initials

Staff names export as initials only. Dates export as `MM/DD/YYYY`; times export as military `HH:mm`. Serial Number can be blank when it was not entered.

Exports intentionally exclude rental record IDs, user-facing status, notes, created/updated timestamps, patient information, MRNs, clinical details, staff full names, staff usernames, auth IDs, staff phone numbers, and staff emails.

Command Center rental actions export the initials of the selected staff attribution.

### Rental History Excel Sync Feed

Rental History also has a secure CSV feed for desktop Excel Power Query / Data From Web:

- `/api/rental-history/excel-feed?token=...`
- protected by the server-only `RENTAL_EXCEL_SYNC_TOKEN` environment variable
- returns the same printable rental equipment log columns as the manual paper-trail export
- intended for refreshable Excel reporting on the department desktop

The app does not write directly to a local Excel file. Excel pulls the feed when the workbook opens or refreshes. See `docs/rental-excel-sync.md` for setup steps.

## Go-Live Note

Before official department use, run the deployed smoke test for Order Rental, Pending Delivery, Confirm Delivery, Return Rental, Pending Pickup, Confirm Picked Up, Rental History, and export. After that smoke test passes, run the one-time rental test-data wipe so production starts with a clean rental history.

### One-time test-data wipe before go-live

Manual SQL script:

`supabase/manual/one_time_wipe_rental_test_data.sql`

Run this script manually in the Supabase SQL editor only after final deployed smoke testing. It is a one-time go-live cleanup, not a routine app feature and not a user-facing delete-history workflow.

The script deletes Rental Management test data from:

- `rental_events`
- `rental_records`
- `rental_equipment`
- optional rental helper/export/sync tables if they exist

The script preserves:

- `rental_vendors`
- users and staff profiles
- role assignments and operations permissions
- schedules and availability
- Cover/Switch requests
- Gossip posts
- app settings

After running it, verify the included count queries:

- `rental_events_count = 0`
- `rental_records_count = 0`
- `rental_equipment_count = 0`
- `rental_vendors_count > 0`

Expected app state after the wipe: Active Rentals count is `0`, Oldest Rental shows `—` or `None`, the Pending section is hidden, Return Rental has no active rentals, Rental History has no records, and Order Rental still shows the seeded vendor list with US Med Equipment available.

Only Admin, Lead, and Aide users can export Rental History. The export route validates access server-side.

## Privacy

Do not enter patient information, clinical notes, MRNs, account numbers, or patient identifiers.

This phase does not store room numbers or patient-linked data.

## Future Phases

- Transfer Room
- Rental analytics
- Notifications
