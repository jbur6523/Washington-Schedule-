# eTime trial operations

The owner authorized the trial deployment on October 15, 2026. This is not official payroll record retention. There is no automatic go-live toggle or migration of trial records into official records.

## Entry points

- Employee app: Time Card → Enter Exception; Time Card → Cover Switch preserves the existing shift board.
- Employee QR: `/etime`, with employee-ID-only access and an eight-hour HttpOnly, SameSite=Strict trial session. Returning users can access their own trial history. The owner explicitly accepted ID-only access for the trial.
- Reviewers: `/etime/portal`; a link appears in the leadership hamburger menu only for explicitly granted reviewers.
- Identity administrator: `/etime/admin`; the link appears in the existing admin dashboard only for the identity administrator grant.
- Olive's assigned username is `aoli`. She uses the existing username activation screen to choose her password. Her grant has `portal_only=true`, and she receives no staff row, profile, or department membership. Signing in opens the portal directly.

## Data and authorization

Migration `20261015175511_etime_trial.sql` creates only `etime_trial_*` tables and the private `etime-trial-private` Storage bucket. No official record tables are created. Trial forms/revisions are not automatically deleted. Sessions and request-rate counters expire independently of records.

All trial tables have RLS enabled, no anon/authenticated table grants, and no permissive browser policies. Server handlers validate the active Supabase user/grant or the hashed, unexpired QR session before using the server-only service client. Do not copy broad department RLS from scheduling onto these records. No payroll details enter the app's general audit log.

`etime_trial_grants` is a separate allowlist:

| Role | Authority |
| --- | --- |
| timekeeper | List department forms, print, initial/reverse entered rows |
| manager | Same review access plus explicit manager signature |
| identity_admin | Correct payroll names/IDs, without payroll review privileges |

Grants bind to verified Auth UUIDs. Non-portal-only grants additionally require current active staff membership in the same department. Provisioning initial grants is a private deployment operation; no generated account IDs or employee data belong in the public migration. Future grants must be explicitly assigned to an existing verified user or an intentional portal-only invitation. Do not reuse a staff username for a portal-only invitation. Deactivating a grant blocks subsequent requests. Never automatically rebind a previously claimed invitation after an Auth account deletion.

Employee identities use stable UUIDs; account deletion only clears nullable Auth links. Name/ID corrections update identity and all current forms in one transaction, add restricted identity audit and form revisions, invalidate signatures, and revoke QR sessions. Historical revision snapshots keep their original identity and signatures. No merging by name, deletion, or cascaded loss of forms occurs. Conflicting app/QR identities require administrator review.

Form writes acquire an identity/form row lock and compare the expected revision. Stale edits fail and ask the user to refresh. The transaction checks current payroll identity and the employee cutoff again before writing. Every successful change inserts an immutable revision snapshot; the application service cannot update/delete these snapshots or identity audit records.

## PDFs and template provisioning

The reviewer’s yellow-cell click immediately applies their account-configured initials; green-cell reversal still requires confirmation. The manager’s first successful signing saves `saved_signature_name` on their private grant in the same transaction as the signed revision. Later forms display that name, but never reuse adoption consent: every form/revision requires a fresh checkbox and **Sign Timecard** click. Timekeepers continue to initial only.

The actual approved blank template is not in this public repository. Provision its base64 bytes and SHA-256 in `etime_trial_templates`, id `approved-v1`, using an authorized private client/connector. The data API does not expose this table to browsers. Do not alter this template version after issuing trial forms; create a new version for future changes.

The server loads the private template, uses `pdf-lib` and an OFL-licensed Allura font, and writes revision-specific static PDFs to `forms/<form UUID>/revision-<n>.pdf` in the private bucket with `upsert=false`. Access is through `/api/etime/forms/[id]`, which checks authorization each time and sends `Cache-Control: private, no-store`. No public PDF URLs or signed URLs are exposed. The original interactive template remains unchanged. The service worker does not cache payroll data.

The browser renders the exact PDF with a same-origin PDF.js worker. Yellow overlays align with the actual Exception Entered column; they do not print. A long reason uses clearly labeled continuation rows without repeating punches, hours, or initials. Continuation pages repeat the approved landscape template. The printed example rows remain unchanged and are never treated as submissions.

## Validation

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `supabase/tests/etime_trial.test.sql`: direct browser access denied, RLS enabled, immutable audit/revisions, private storage, restricted RPC grants.
- `src/lib/etime/model.test.ts`: Sunday anchors, Tuesday Pacific grace boundaries including DST, independent exact lunch punches, 24-hour formatting/midnight, rejected dates/signatures, long-reason continuation.
- `scripts/etime-local-e2e.mjs`: local-only integration test (hard rejects anything except `http://127.0.0.1:61321`). Run a local app on port 3100 first, set `ETIME_TEMPLATE_PATH` to the private approved template, and run the script. It creates synthetic QA accounts/records and checks enrollment, multiple entries, roles, initials, signatures, stale edits, PDF archive, document ownership, identity correction/history, and portal-only isolation. Fixtures stay local for browser inspection; temporary QA credentials are never committed or printed.
- Optional private-template rendering test: set `ETIME_TEMPLATE_PATH`, then run `npx vitest run src/lib/etime/pdf.test.ts`. It is skipped in public CI because the hospital template is private. Render the temporary output with Poppler for visual review.

## Go-live boundary

Before official go-live, obtain the owner's explicit instruction, stakeholder acceptance of the ID access model and typed signatures, and an agreed retention/access/backup policy. Create a fresh official data store and access configuration. Preserve trial data separately; do not relabel trial submissions as official records. Late corrections to closed periods need a separately authorized amendment process.

For an urgent trial stop, set `etime_trial_config.enabled=false`. This blocks trial data endpoints, including PDFs. Restore it only when authorized. Existing scheduling and ICU functionality are independent.
