# Rental Management

Rental Management is a department operations tool for tracking rented BiPAP/V60 equipment.

This phase implements Rental Check In, Pending Delivery cards, Active Rentals, and Rental History.

## Access

Rental Management is available to:

- Admin
- Lead
- Aide Dashboard users

Regular staff cannot access Rental Management routes.

## Rental Check In Workflow

Rental Check In opens as a dedicated workflow at `/operations/rental-management/check-in` instead of expanding inline on the main Rental Management page.

It now logs the called-in rental order only:

1. Select the rental company.
2. Select the BiPAP type.
3. Enter the called-in date and time.
4. Add an optional note.
5. Save the pending delivery.

Saving creates a blue `Pending Delivery` record. It does not require a serial number because the equipment has not arrived yet.

The Rental Management dashboard shows no Pending Delivery section when there are zero pending rentals. When pending records exist, it shows one compact blue card per pending rental.

## Delivery Confirmation

Delivery confirmation starts from a Pending Delivery card on the main Rental Management dashboard.

1. Tap `V60 Delivered`, `BiPAP Delivered`, or `Mark Delivered`.
2. Scan the equipment barcode or enter the serial / asset ID manually.
3. Enter current location.
4. Confirm delivered date and time.
5. Confirm delivery.

Confirming delivery updates the pending record to `active`, sets the delivered timestamp in `checked_in_at`, records the current location and serial / asset ID, creates delivery events, and returns to the main Rental Management page with a `Rental delivered and active.` success message. The Active Rentals summary reloads so newly delivered equipment is included in the count.

Cancel and Back to Rental Management leave the active workflow without creating partial delivery records.

## Rental Lifecycle

Rental records use four user-facing lifecycle states:

- `Pending Delivery` displays blue. The rental was called in, but the equipment has not arrived.
- `Active` displays green. The equipment has been delivered and is physically in the hospital.
- `Called for Pickup` displays yellow. The vendor has been called, but the equipment is still physically in the hospital.
- `Picked Up` displays gray. The equipment has physically left the hospital.

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

If camera access is denied or scanning is unsupported, staff can enter `Serial Number / Asset ID` manually.

The scanner shows camera permission and scanning status. After a successful scan, the scanned asset value is shown with a green confirmation state and can be rescanned if needed.

## Equipment Details

Supported BiPAP type in this phase:

- V60

Delivered Date defaults to the current date. Delivered Time defaults to the current time in 24-hour input format.

Called In Date and Called In Time default to the current date/time on the Rental Check In order form. Delivery Date defaults to the current date. Delivery Time defaults to the current time in 24-hour input format on the delivery confirmation screen.

Current location defaults to `RT Equipment Room`. Available locations are:

- RT Equipment Room
- ED
- ICU
- 2nd Floor
- 3rd Floor
- Other

If `Other` is selected, staff can enter a short custom location. Patient names, MRNs, and clinical details must not be entered.

Notes are optional and limited to 140 characters.

## Duplicate Protection

Before saving a delivered check in, the app checks for an existing in-hospital rental with the same department and serial number / asset ID.

If an active or called-for-pickup rental already exists, the app does not create a duplicate. It shows:

- Company
- BiPAP type
- Serial number / asset ID
- Current location
- Delivered date/time
- Delivered staff member

The user can view Active Rentals or cancel the check in.

## Active Rentals

Active Rentals shows equipment that is still physically in the hospital:

- `active` records display green as `Active`.
- `pickup_requested` / `pickup_called` records display yellow as `Called for Pickup`.

Pending Delivery records are shown separately on the Rental Management dashboard only when pending records exist, and they also appear in Rental History. Picked-up records (`returned` / `picked_up`) and cancelled rentals are excluded from Active Rentals and remain available in Rental History.

The list is sorted by `checked_in_at` ascending so the equipment that has been in the hospital the longest appears first.

The Rental Management dashboard shows a compact summary only:

- Active Rentals count
- Oldest Rental duration

The full Active Rentals details live on `/operations/rental-management/active`, opened by the `View Active Rentals` button.

Each detail card shows:

- BiPAP type
- Serial / Asset ID
- Company
- Last known location
- Days in hospital
- Called-in date/time, if available
- Delivered date/time
- Delivered staff member

Called-for-pickup cards also show the pickup call time and staff member when a pickup event exists.

Full return and transfer workflows remain future work.

## Pending Delivery Cards

Pending Delivery cards are blue and appear only when rentals have been ordered but not delivered. Each card shows:

- BiPAP type
- Rental company
- Called-in date/time
- Called-in staff member
- Optional note
- Delivered action button

Pending Delivery does not count as Active Rentals because the equipment is not physically in the hospital yet.

## Rental History

Rental History is available at `/operations/rental-management/history` and replaces the old Transfer Room placeholder.

It is the permanent searchable record of BiPAP/V60 rental records in the app. It includes:

- Active rental records
- Pending Delivery records
- Called-for-pickup rental records
- Picked-up rental records
- Multiple rental cycles for the same serial number / asset ID

Search supports serial number / asset ID, company, equipment type, last known location, called-in staff, delivered staff, picked-up-by staff when a pickup event exists, and notes.

Filters include:

- Status: All, Pending Delivery, Active, Called for Pickup, Picked Up
- Equipment: All Equipment, BiPAP, V60
- Company/vendor
- Date range: All Time, Today, Last 7 Days, Last 30 Days, Custom Range

Date range matching includes a rental if it was active at any point during the selected range or if a lifecycle event occurred during that range:

- called in during the range
- delivered during the range
- picked up during the range
- delivered before the range and picked up after the range
- delivered before the range and still active

History rows are compact by default and expand to show:

- Equipment type
- Serial / Asset ID
- Company
- Status
- Called-in date/time
- Called-in staff member
- Delivered date/time
- Delivered staff member
- Last known location
- Called-for-pickup date/time, when present
- Picked-up date/time, when present
- Picked-up-by staff member, when a picked-up event exists
- Total time in hospital
- Notes, if present
- Rental event timeline, when events exist

Active Rental cards include a `View History` action that opens Rental History filtered to that machine serial number.

## Privacy

Do not enter patient information, clinical notes, MRNs, account numbers, or patient identifiers.

This phase does not store room numbers or patient-linked data.

## Future Phases

- Return Equipment
- Transfer Room
- Barcode-driven lookup and history
- Rental analytics
- Notifications
