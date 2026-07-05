# Rental Management

Rental Management is a department operations tool for tracking rented BiPAP/V60 equipment.

This phase implements Rental Check In only.

## Access

Rental Management is available to:

- Admin
- Lead
- Aide Dashboard users

Regular staff cannot access Rental Management routes.

## Rental Check In Workflow

Rental Check In opens as a dedicated workflow at `/operations/rental-management/check-in` instead of expanding inline on the main Rental Management page.

1. Select the rental company.
2. Scan the equipment barcode or enter the serial number manually.
3. Enter equipment details and current location.
4. Confirm the check in.

After confirmation, the app creates an active rental record and event log, then returns to the main Rental Management page with a `Rental checked in.` success message. The Active Rentals summary reloads on the main page so the newly checked-in equipment is included in the count.

Cancel and Back to Rental Management leave the workflow without creating rental records.

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

Date defaults to the current date. Time defaults to the current time in 24-hour input format.

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

Before saving a check in, the app checks for an existing active rental with the same department and serial number / asset ID.

If an active rental already exists, the app does not create a duplicate. It shows:

- Company
- BiPAP type
- Serial number / asset ID
- Current location
- Checked-in date/time
- Checked-in staff member

The user can view Active Rentals or cancel the check in.

## Active Rentals

Active Rentals shows every `rental_records.status = active` row for the department. Returned and cancelled rentals are excluded.

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
- Checked-in date/time
- Checked-in staff member

Full return and transfer workflows remain future work.

## Privacy

Do not enter patient information, clinical notes, MRNs, account numbers, or patient identifiers.

This phase does not store room numbers or patient-linked data.

## Future Phases

- Transfer Room
- Return Equipment
- Barcode-driven lookup and history
- Rental analytics
- Notifications
