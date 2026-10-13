# Rental Management

Rental Management is a single compact equipment list at `/operations/rental-management`. The previous check-in, active, delivery, return, and history URLs render this same interface for existing bookmarks. The history URL opens the inline history section.

## Everyday workflow

- **+ Order BiPAP** opens the inline company, quantity, employee, date, and time fields. US Med Equipment and quantity 1 are defaults. One atomic order creates one persistent row per unit (1–20).
- **Ordered → Delivered** requires a serial number. Barcode entry and the existing ZXing scanner remain available under Barcode / Scan. The equipment location defaults to RT Equipment Room.
- **Active → Return** records who called for collection and when. The equipment remains in the list as **Pending Pick-up**.
- **Awaiting Pickup → Picked Up** records actual collection and moves the row to **Returned** in Rental History.

Status dots are blue for Pending Delivery, green for Active, and yellow for Pending Pick-up. Find / Scan sits below Order BiPAP, and Update controls are centered. Only one row editor is open at a time. Saving changes the existing row and collapses the editor. Find / Scan supports barcode or serial lookup without leaving the screen. Cancel order and cancel pickup request remain in Edit / Details.

Every action uses the same employee selector: active Schedule employees with `assigned_role = lead`, `operations_role = aide`, or `home_assignment = rt_aide`, then Insert Name. Insert Name opens a text field. Eligible signed-in employees are preselected; shared accounts and other users explicitly choose the operational employee.

Date and Time are plain text fields, `MM/DD/YYYY` and `HH:mm` (24-hour). Defaults use the department's hospital timezone. Validation rejects invalid dates, invalid clock values, skipped spring DST times, and out-of-order lifecycle timestamps. Repeated autumn DST times use the shared time helper's deterministic earlier occurrence. Unchanged historical timestamps are not round-tripped through the editor, preserving their exact instant and precision.

## History and corrections

Rental History is an expandable list on the same screen, searchable by company, serial, barcode, employee, and displayed dates/times. Completed and cancelled rentals remain available. Details show all four stages and an expandable audit trail, including original event data. CSV export and the existing Excel feed remain available.

Edit allows company, serial, barcode, and already-recorded employee/date/time corrections. Only changed stages are submitted. Corrections append an `edited` event containing the full before/after rental record; original events are never changed. The equipment directory is corrected only if the edited rental is the newest rental for that equipment.

## Access and audit

Existing route authorization and department RLS are retained: Admin, Lead, Aide, and Command Center users can manage rentals; ordinary staff cannot. Existing Director/Leadership snapshot access is unchanged.

Operational employee attribution is stored in `rental_records.attribution` and the existing staff foreign keys where a Schedule employee was selected. Manual names do not create staff accounts. New rental events separately store the authenticated updater through `actor_staff_profile_id` and `authenticated_user_id`. Older events and legacy staff/name fallbacks remain readable. Historical audit payloads preserve original names even if the employee directory changes.

## Database compatibility and rollout

Apply `20261013235049_simplify_rental_list.sql` **before deploying the new frontend/export handlers**. This additive migration:

- Adds rental attribution and an order request/item identity, with a uniqueness index for idempotent order retries.
- Adds the authenticated user ID on new events; old authenticated IDs are not invented. Allows an event's staff link to be null for authorized accounts without a linked staff profile.
- Adds a guarded `update_rental_list` RPC, with the same existing department access predicate, server-resolved employee eligibility, validation, departmental serialization of duplicate identity checks, and optimistic row-version checks.
- Uses a monotonic update timestamp so successive writes cannot share a version.

No rentals, vendors, equipment, or audit records are deleted. Stored statuses and old RPC signatures remain compatible. Legacy `called_in`, `delivered`, `pickup_requested`, `called_for_pickup`, `returned`, and cancellation aliases are mapped to the simplified labels. Existing rentals without serials remain readable; new delivery requires a serial. Barcodes are optional and remain separate from serials.

Orders carry a stable UUID per form submission, so a network retry returns the original rows. A synchronous client lock also blocks rapid submission. Transitions and edits require the original row version and expected status. An audit failure rolls back the record change in the same transaction. Stale forms close and reload the current rows rather than advancing a newer state.

The new UI and exports require this migration; deploy the database first. The previous application remains able to read the additive schema. Production deployment was separately authorized on 2026-10-13.

## Validation

- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test`.
- `src/components/RentalManagementClient.test.tsx`: multi-unit ordering, selector scope, manual names, required serial, text date/time validation, scanner input, lifecycle/history, one open row, duplicate clicks, and denied UI access.
- `src/lib/rental-management/lifecycle.test.ts`: hospital-local midnight, UTC conversion, invalid dates/times, DST gaps, and old status aliases.
- `supabase/tests/rental_list_test.sql`: atomic ordering and retries, guarded delivery/pickup/completion, required serials, duplicate identifiers, scan audit, staff/authenticated attribution, before/after corrections, rollback on audit failure, department/role restrictions, and anonymous denial. Tests run in a transaction and roll back.

Local browser verification uses synthetic records only. Physical camera decoding still requires a camera/device smoke test; automated checks cover scanner integration and cleanup/fallback behavior.

## Verified implementation (2026-10-13)

- Full Vitest suite: **97 files, 645 tests passed**.
- Targeted final rental tests: **12 passed**.
- Database pgTAP suite: **28 assertions passed**, using the explicitly local `supabase_db_whhs-schedule-local` container. All test transactions rolled back.
- TypeScript, ESLint, production build, and `git diff --check`: passed.
- Real browser against local Supabase: two-unit order; delivery; Active; return request; Awaiting Pickup persisted after reload; pickup moved to history; serial correction; CSV download with corrected serial, manual employee initials, and 24-hour times.
- Responsive checks: 320px and 390px viewport widths, no horizontal overflow. Preview: `artifacts/rental-list-mobile.png` (synthetic QA records).
- Database inspection confirmed the correction event retained original and corrected serial values and did not alter the unchanged order timestamp.
- New RPC access/search-path/grants and existing RLS were inspected; anonymous, ordinary staff, and cross-department denial are covered by the SQL tests.
- Supabase's security advisor command could not run because the installed CLI and an alternate advisor-capable version both failed with `LegacyProfileLoadError` / unsupported profile configuration. This limitation did not affect local SQL execution or tests.
- Camera decoding with physical equipment remains a device smoke test. Decoder callbacks, camera-denial fallback, late camera startup cleanup, and form integration are automated.

Changed source files:

- `src/components/RentalManagementClient.tsx`
- `src/components/RentalBarcodeScanner.tsx`
- `src/lib/rental-management/lifecycle.ts`
- `src/lib/time/zoned-date-time.ts`
- `src/app/api/rental-history/export/route.ts`
- `src/app/api/rental-history/excel-feed/route.ts`
- `supabase/migrations/20261013235049_simplify_rental_list.sql`
- `src/components/RentalManagementClient.test.tsx`
- `src/components/RentalBarcodeScanner.test.tsx`
- `src/lib/rental-management/lifecycle.test.ts`
- `supabase/tests/rental_list_test.sql`
- `docs/rental-management.md`

Production migration applied on 2026-10-13 as version 20261013235049 before the application release. Verified all 23 rentals and 98 audit events were retained; anonymous RPC execution is denied. The connector security advisor ran successfully: the new RPC has the intentional authenticated SECURITY DEFINER advisory and enforces existing department permissions. Other advisor findings concern existing functions and Auth settings outside this change. See https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable .
