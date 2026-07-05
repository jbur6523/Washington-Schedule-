# Rental Management

Rental Management is a department operations tool for tracking rented BiPAP and V60 equipment.

This phase implements Rental Check In only.

## Access

Rental Management is available to:

- Admin
- Lead
- Aide Dashboard users

Regular staff cannot access Rental Management routes.

## Rental Check In Workflow

1. Select the rental company.
2. Scan the equipment barcode or enter the serial number manually.
3. Enter equipment details.
4. Confirm the check in.

After confirmation, the app creates an active rental record and event log.

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

## Equipment Details

Supported equipment types in this phase:

- BiPAP
- V60

Date defaults to the current date. Time defaults to the current time in 24-hour input format.

Notes are optional and limited to 140 characters.

## Active Rentals Preview

After check in, the rental appears in a simple Active Rentals preview with:

- Company
- Equipment type
- Serial number
- Checked-in date/time
- Checked-in staff member

Full Active Rentals management remains future work.

## Privacy

Do not enter patient information, clinical notes, MRNs, account numbers, or patient identifiers.

This phase does not store room numbers or patient-linked data.

## Future Phases

- Active Rentals detail view
- Transfer Room
- Return Equipment
- Barcode-driven lookup and history
- Rental analytics
- Notifications
