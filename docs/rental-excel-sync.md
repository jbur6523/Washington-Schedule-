# Rental Excel Sync Feed

The WHHS RT Schedule app and Supabase database remain the source of truth for Rental Management. Excel is a refreshable paper-trail and reporting copy only.

Browsers and PWAs cannot silently write to a local Excel file. For desktop Excel syncing, the app exposes a secure CSV feed that Excel can pull with Power Query / Data From Web.

## Feed URL

Route:

```text
/api/rental-history/excel-feed
```

Access requires a long random server-side token:

```text
RENTAL_EXCEL_SYNC_TOKEN=
```

The token must not use a `NEXT_PUBLIC_` prefix. Store it only in server environment variables. Rotate it by replacing the environment value and updating the saved Excel Power Query URL.

Excel-friendly URL format:

```text
https://your-app-domain.example/api/rental-history/excel-feed?token=YOUR_LONG_RANDOM_TOKEN
```

The route also supports `Authorization: Bearer ...`, but the query string form is simplest for Excel desktop.

## Exported Columns

The feed returns the printable rental equipment log columns:

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

Dates use `MM/DD/YYYY`. Times use military `HH:mm`. Missing values are blank.

The feed intentionally excludes rental record IDs, status, notes, created/updated timestamps, usernames, auth IDs, staff full names, staff phone numbers, staff emails, patient names, MRNs, and clinical details.

## Excel Desktop Setup

1. Open Excel.
2. Go to `Data`.
3. Choose `Get Data` / `From Web`.
4. Paste the secure feed URL.
5. Load the CSV as a table.
6. Open the query/table properties.
7. Enable `Refresh data when opening the file`.
8. Optional: enable refresh every selected number of minutes.
9. Save the workbook on the department desktop.

Excel pulls from the app. The app does not write directly to the local workbook.

If the workbook is closed, it refreshes the next time it opens. A future Windows Task Scheduler / PowerShell workflow could periodically download the feed to a desktop or shared-drive CSV/XLSX file, but that is not implemented in this phase.

## Security Notes

- The feed is denied when the token is missing or invalid.
- The token should be long, random, and treated like a password.
- The feed exposes operational rental log data only.
- No patient information belongs in Rental Management records or exports.
- Do not paste the token into screenshots, chats, or public documentation.
