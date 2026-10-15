# Washington Hospital Schedule — eTime Exception Forms

**Status:** Trial implementation and deployment authorized by the owner on October 15, 2026. Official go-live is not authorized.
**Prepared:** October 15, 2026  
**Source document:** Washington Hospital, *eTime – Time and Attendance Exceptions* (one-page landscape form, revised 6/17; original scanned copy held outside this public repository).  
**Stakeholder review:** Ramon and Olive must review the final workflow, signature placement, access approach and official template before production use.

> **Public-repository note:** This document intentionally does not include a scan of internal hospital paperwork, employee identifiers or actual employee exception records. Obtain the official blank source form through the project owner via an approved private channel. Do not store real employee names, IDs, signatures, timecards, or generated submissions in this public repository.

## Approved decisions — October 15, 2026

These owner-approved decisions supersede the earlier planning questions below.

- Build to completion, push main, and deploy the **trial**. All data is temporary trial data, retained without automatic deletion. Official go-live will start a fresh, separate record store; do not migrate trial submissions automatically.
- The owner explicitly approved employee-ID-only QR access for this trial, including prior trial forms. No PIN or extra enrollment is added. Bulk lists and reviewer actions require authenticated, explicit grants. Official go-live still requires review of the access approach and signature acceptance.
- App navigation: **Time Card** replaces the visible Cover/Switch tab and opens two choices: **Cover Switch** and **Enter Exception**. Existing Cover/Switch deep links keep working.
- Ramon reaches **Timecard Management** from his leadership hamburger menu using his existing account. Olive has an eTime-only account, username **aoli**, with no ordinary staff assignment or scheduling/ICU access. Future reviewers require explicit grants; ordinary admin/leadership roles do not grant payroll access.
- Jonathan has a separate identity-correction grant and a backend admin page. Correct identities in place by stable UUID; retain forms and immutable historical identities/signatures. Current form signatures are invalidated on correction; existing QR sessions are revoked.
- Approved template: the owner-approved landscape fillable final PDF is stored privately. Keep both skinny sample rows and the original instructional text **permanently printed**, including 12/25/07 examples. They are examples, never database records or fillable data rows. Keep cost center 7720–7730, the approved timekeeper name, and manager name permanently printed. This supersedes instructions below to remove examples.
- Ten regular rows per physical page. Continue onto the same approved layout when needed. Long reasons can continue into labeled rows with no duplicate hours or punches. Row fields use 10pt, header fields 12pt where they fit, and signatures use embedded cursive lettering. Exception input reasons are limited to 90 characters; long names are fitted to their available header space.
- **24-hour times only** in entered data and generated PDFs. Typing 2130 produces 21:30; a typed colon is also accepted. 2400 is accepted as 24:00 (end-of-day midnight), with no automatic date change. Preserve exact missing lunch punches independently; never assume 30 minutes.
- Pay periods run **Sunday–Saturday**, 14 days, anchored **October 11–24, 2026**. Monday is only the schedule-display week boundary. The grace period ends Tuesday 11:59 p.m. America/Los_Angeles: October 27 for that example. Employees may add/edit both the current period and a prior period still in grace. Closed periods remain read-only.
- **Exception Entered** initials acknowledge actual entry into eTime payroll, not review. The reviewer explicitly confirms each action. Reversal is audited. Editing a row clears only its active initials and invalidates the manager signature.
- Employees and the manager type their full name, see a cursive preview, explicitly adopt it, and sign the form revision. Employees reconfirm all pay-period entries when submitting an addition/edit. Managers can sign after employee attestation and all rows are entered. Olive's acknowledgment is her initials on each row; do not add a timekeeper signature line.
- Structured data, signatures, and revision history are saved transactionally before PDF generation. A PDF failure does not lose entries. First successful PDF rendering archives a static private revision PDF; historical issued PDFs are never replaced.
- See [trial operations and validation](ETIM-TRIAL-OPERATIONS.md) for implementation, grants, storage, and go-live boundaries.

## 0. Codex handoff and scope

1. Read the complete specification; inspect the actual existing Washington Schedule app before choosing routes, UI, database schema, access roles or PDF libraries. This is an **extension of the existing app**, not a separate app.
2. The owner reviewed the plan and authorized implementation, main push, and trial deployment. Official go-live remains a separate decision.
3. Keep the existing Schedule app styling, user session, permissions and departmental access restrictions. Ramon already has an account with access to the **leadership dashboard**; reuse that account. Olive needs appropriately scoped eTime management access.
4. Preserve existing **Cover/Switch** behavior even if its navigation position changes. Leave ICU Command Center, staffing boards, schedule functions and aide/ICU restrictions undisturbed.
5. Respect the owner's requested first-iteration employee-ID workflow. Do **not silently introduce** a PIN, password, verification code or other enrollment layer. The risks and any changes to this approach are explicitly deferred for discussion with Ramon; they are an **unresolved pre-release decision**, not permission to publish a vulnerable feature.
6. The final printed artifact is the **actual approved hospital eTime exception sheet** with its original columns and fields, not a redesigned substitute.

## 1. Overall outcome and architecture

Employees can submit exceptions through either their signed-in Washington Schedule app profile or a departmental QR code linking to a sign-in-free webpage. Both routes share one exception database and the same minimal entry wizard.

Ramon and Olive receive an **eTime portal** offering current pay period, previous pay periods, an alphabetically sorted employee list, category filters and direct viewing/printing of the completed official sheet. They can initial individual exception rows and electronically sign or acknowledge the form. Employees can check which rows have been initialed.

**Recommended architecture:** Structured database records for official employee payroll identities, pay periods, individual exception rows, attestations, reviewer initials, signatures, edit history and PDF revision metadata. Generate or regenerate the PDF from this data. Do not make fillable Acrobat files the sole source of record. Existing PDF-generation libraries may be reused if suitable.

## 2. Faithful official form mapping

The approved printed PDF must retain the official headings, column order, signature spaces and layout.

- Header: **Pay Period End Date; Cost Center #; EE #; EE Name; EE Signature**.
- Every row: **Date**.
- Missed punches / transfers: **IN; Missed Lunch OUT; Missed Lunch IN; OUT; Dept/Cost Center #; Job Code Transfer**.
- Paid Time Off: **ETO 1 Vacation (hours); ETO 2 Sick (hours)**.
- Other Hours: **Bereavement (hours); Paid Ed Leave (hours); Jury Duty (hours); Holiday (hours); Other hours (specify in Reason)**.
- Wide **Reason for Edit** column.
- Far-right **Exception Entered (Initial)** column: a separate entry for **each individual exception row**.
- Footer: **Timekeeper** printed name, **Date Reviewed**, **Manager/Director Name**, and **Manager/Director Signature**.

The uploaded scan is **not** currently an interactive Acrobat PDF. It also includes blue/red example entries; these must **not** be interpreted as real records or appear on generated forms. Prefer a clean original blank official form. Otherwise create a cleaned faithful template, with Ramon/Olive's approval before release. Preserve print legibility, cell alignment, landscape dimensions and continuation pages if there are more rows than fit on the original sheet.

The names printed on the sample are of the department timekeeper and manager. In production, derive current authorized names, initials and signatures from actual reviewer account configuration, not hard-coded screenshots or sample text.

## 3. Employee navigation and identity

### A. Signed-in Schedule app

Add an easily discoverable **Timecard Management** entry. The owner suggests replacing the visible **Cover/Switch** navigation position or using a clear menu/hamburger; if replaced, relocate Cover/Switch rather than removing its functionality.

**One-time official payroll identity setup** in the signed-in profile:

1. First name.
2. Last name.
3. Employee ID number.
4. Confirm employee ID number (must match).

Persist these as **absolute/stable official payroll-form values associated with the app account** and keep them separate from the nickname/display name used elsewhere in the Schedule app. Do not silently change them when a display name changes. Later submissions reuse them without reentry.

### B. QR-code webpage without app sign-in

The department displays a QR code to the same employee eTime flow, accessible even to staff who do not have a Schedule app account.

**First use when employee ID is unknown:**
1. Enter employee ID number.
2. Show a one-time confirmation notice: **"Please verify this is your correct employee ID."**
3. Confirm, then re-enter employee ID number.
4. Enter official first and last name.
5. Save the name/ID as the employee's absolute form identity.

**Returning QR user:** Enter matching employee ID; display/reuse the saved official name and proceed straight to their eTime portal without repeating enrollment.

**Product decision pending Ramon:** No additional sign-in, PIN, one-time code, identity verification service or extra security enrollment in this initial UX proposal. Identity/impersonation/privacy risks and authorization of access to historical exception documents **must be discussed before any production rollout**. Do not quietly redesign the requested process. Also do not expose bulk employee listings, employee IDs, unrelated documents or manager functions to unauthenticated APIs.

If a staff member uses both the app and the QR route, unify their forms under the same official payroll identity; do not duplicate records or merge unrelated people merely because their names match.

### Employee landing page (both methods)

- **Enter New Exception**
- **View Exceptions for Current Pay Period** (see, edit, and re-confirm own current entries)
- **View Past Exception Forms** → select previous pay period → view/print past official PDF, read-only
- Display per-row reviewer initials/review status so the employee can see when an exception was entered/initialed.

## 4. Simple one-page-at-a-time exception wizard

Use a short mobile-friendly step flow, with each page sliding to the next:

1. **Date of exception.**
2. **Exception type**, using readable names but mapping precisely to the corresponding official form field.
3. **Actual clock time(s) or exact hours**, based on type.
4. **Reason for Edit** (user-supplied description; place on official PDF).
5. **Review and signature/confirmation** — e.g. "I confirm the information provided is correct", with recorded time and an appropriate representation for **EE Signature**. Final typed vs drawn e-signature method to be confirmed with Ramon.

**Critical: Do not automatically assume lunch is 30 minutes.** Users may have a longer or shorter lunch, have forgotten just Lunch OUT, just Lunch IN, or both. When applicable, collect the exact missing punches independently and preserve what the employee entered. An extended 50-minute lunch should remain 50 minutes, not be adjusted or rounded.

Other hour-based types (ETO Vacation/Sick, Paid Education Leave, Holiday, Jury Duty, Bereavement, Other Hours) take the actual number of hours, and Other Hours also captures the particular type/reason. Missed IN/OUT take exact clock times. Department and job-code transfer cases require their particular fields rather than a generic hours input.

Allow **multiple dated exception entries** per employee within a pay period, including mixed categories. They populate **one logical official PDF per employee per period**, not a separate PDF for each submission. New rows initially need initials.

## 5. Pay periods, editing, history, review revisions

- Resolve official **pay-period boundaries and cutoff dates** using existing app data or stakeholders. Do not invent them. Show the correct **Pay Period End Date** on the PDF.
- One logical employee form for each pay period; add pages of the same official form layout when rows exceed capacity.
- Employees can add and edit current-period entries. Past/closed periods are selectable and viewable but not employee-editable in the regular flow.
- A changed exception row previously initialed becomes **uninitialed/yellow again** for re-review. Other unchanged rows retain their initials.
- Where a material edit alters content already covered by an employee or manager signature, require that applicable signature to be reconfirmed. Never leave signatures misleadingly attached to revised content.
- Preserve an audit trail of entry versions, time, and who edited, initialed, uninitialed or signed each record. Historical signed records should not silently be overwritten.
- Late corrections after a period closes require a separately authorized amendment process or explicit stakeholder direction; do not mutate closed forms without controls.
- Store individual exceptions as structured data; generating a PDF is an output operation. If PDF rendering fails, do not lose the entered record; report failure and permit retry.

## 6. Ramon & Olive eTime management portal

The management portal should stay **very simple**, using the existing role/account system.

**Landing page:**
- **Current Pay Period** (expand/click)
- **Previous Pay Periods** (choose previous pay period/date range, then drill down)

Within a period, employees display **alphabetically by official last name by default**, with concise exception summaries and the total number of entries:

- Adams, Jane — Missed Lunch — **View Exception Form (2 entries)**
- Brown, Sam — ETO — **View Exception Form (1 entry)**
- Chavez, Alex — Other Hours — **View Exception Form (2 entries)**

Offer optional lightweight search/filter by employee and exception type, including **Missed Lunch, Holiday, Paid Education Leave, ETO**, and other official categories. If a form has multiple types, it should appear under all matching category filters.

Clicking the employee opens the **completed digital version of the actual hospital exception sheet** (not another custom review form), with options to **view, print, download PDF, initial rows and sign/acknowledge** as authorized. Keep an indication of which rows are outstanding without building a complex approval dashboard.

Ramon uses his existing leadership-login account. Olive receives appropriately scoped access to the portal. Both may only access the relevant department's records under existing role/department constraints.

## 7. Yellow per-row click-to-initial boxes

The official far-right column is **Exception Entered (Initial)**.

- In the browser's digital rendition of an employee's official form, each not-yet-initialed row has a **yellow clickable box** at this location.
- Ramon or Olive clicks it; the system inserts that **logged-in reviewer's configured initials** into precisely that official row, records reviewer identity and timestamp, and removes the yellow highlight.
- The printed/downloaded PDF displays the proper initials in their correct cells. **Yellow is only a UI overlay** and need not print.
- The employee sees the result when revisiting their current-period form.
- Authorized reviewers can reverse mistaken initialing with the reversal captured in audit history.
- When an employee edits an initialed row during the open period, only **that modified row** loses its previous active initial and becomes yellow again; other rows remain unchanged.
- **Stakeholder decision before release:** The original printed wording means "Exception Entered", potentially confirmation of entry into the actual eTime payroll system rather than mere review. Confirm exactly when it is legitimate to apply initials. **Do not rename or repurpose the official form field without approval.**

## 8. Manager and timekeeper signatures

Ramon and Olive need convenient ability to electronically sign or acknowledge the appropriate fields.

- The official form has an explicit **Manager/Director Signature** line and a **Timekeeper** printed-name line plus **Date Reviewed**; it does not obviously include a dedicated timekeeper signature line.
- Ramon can explicitly sign the manager field in the portal.
- Olive can explicitly sign/acknowledge in the portal; discuss whether this belongs in an approved area on the official PDF or is recorded as an in-app acknowledgment rather than altering the form's layout.
- Signing must be an **explicit action** with signature representation (approved typed attestation or drawn electronic signature), identity, time and associated form revision; do not silently stamp a person's name merely because they logged in.
- Properly populate the original PDF signature/name/date fields; keep signatures consistent with active revisions and re-confirmation requirements.

## 9. PDF generation / storage / printing

- Start from a clean blank, hospital-approved version of the **exact official form**; the available scan is a visual reference and includes sample text to remove.
- Place dates, exact times, hour amounts, transfer fields, narrative reasons, employee identification, employee signature, per-row initials, timekeeper/manager information and manager signature into their proper official positions.
- PDF updates as database records change. Retain meaningful prior revisions/action audit; provide the latest correct printable version in employee and management views.
- Use access-protected existing app storage/data patterns, not publicly enumerable static PDF URLs.
- Test line alignment, unusual/long names, long reasons, >1 row, continuation pages, landscape scaling, different time formats, exact-hours handling and signed printouts.
- Do not upload the original scan, employee data, generated forms or test records with real identities to this public code repository.

## 10. Suggested minimum data model (adapt to existing schema)

- **Payroll identity:** official first and last name, employee ID, linked app user ID if present, created/updated timestamps. Never substitute app nickname for official name.
- **Pay period:** official start/end, active/closed state; end date prints on PDF.
- **Exception entry:** payroll identity, pay period, exception date/type, separate punch time columns, separate numeric hour columns, department/job transfers, reason, revision and timestamps.
- **Employee signature/attestation:** signer, date/time, entries/form revision covered, representation.
- **Row initial:** specific exception row and revision, reviewer account identity, actual reviewer initials, time, active/reversed state and audit record.
- **Management signature:** reviewer role/identity, form revision, signature representation, signed time, active/invalidated state.
- **PDF:** employee/period linkage, render revision, object path and render date, appropriate authorization checks.

Do not merge employees on identical names. Resolve app-linked and QR-created identities carefully and avoid duplicate employee-period PDFs.

## 11. Integration safeguards and product boundaries

- Preserve unrelated scheduling, staffing, shift coverage, communication board, ICU Command Center, navigation and access rules.
- Preserve existing employee/manager sessions, departmental permission checks and manager action audit. Respect aide restrictions on ICU access.
- Relocating Cover/Switch is acceptable; deleting it is not.
- Use the existing look and feel; no extra dashboard metrics or payroll approval bureaucracy.
- Do not implement payroll calculations, payroll-system integration, alerts or notifications unless separately requested.
- Maintain the no-extra-enrollment product proposal while identifying the unresolved privacy and access risks for Ramon's review. No rollout until approved.

## 12. Acceptance demonstrations

1. A signed-in employee enters first/last official name and matching twice-entered employee ID once; a later visit reuses those values even if the Schedule display nickname differs.
2. A new QR visitor enters ID, sees the verify-ID notice, repeats it and records first/last name. Returning QR visitor enters ID and sees their linked official name and portal.
3. A missed lunch exception supports Lunch OUT only, Lunch IN only, both, and a non-30-minute lunch with exact clock times; all map to correct official cells.
4. Two missed lunches and one Paid Education Leave entry appear as **three rows on one official employee form** for the relevant period.
5. Other Hours captures exact hours and particular reason/type on the official document.
6. Management gets an alphabetical employee list and working exception-type filters including Holiday, Missed Lunch and Paid Education Leave; mixed forms appear in relevant categories.
7. Olive initials one of two rows: that row loses yellow, other remains yellow; both views and PDF correctly show the initials on the intended row.
8. Employee edits one previously initialed current-period row: only that row reverts to yellow, dependent signatures need renewal, previous actions remain auditable.
9. Ramon signs the manager line and Olive completes the agreed timekeeper acknowledgment; PDF displays only authorized, applicable fields.
10. Employee can select and view old pay periods but cannot freely edit closed periods; management can retrieve and print authorized historical forms.
11. PDF excludes the scan's sample entries, prints long content legibly and uses continuation pages if needed.
12. Existing schedule, leadership dashboard, Cover/Switch, ICU and aide restrictions still work after integration.

## 13. Questions for Ramon and Olive before production

1. What are the exact current/pay-period dates, period boundaries and deadlines? How are late amendments handled?
2. Does "Exception Entered" mean physically entered into the payroll eTime system versus just reviewed? When may the initials be applied?
3. Does Olive require a visible PDF signature or a logged portal acknowledgment in addition to the printed Timekeeper name / Date Reviewed fields?
4. What e-signature style is accepted by hospital policy for employee and reviewers, and does the official form need preapproval for any change?
5. Can a clean official blank PDF template be supplied, without the demonstration/sample entries?
6. Review employee-ID-only QR access, privacy and impersonation concerns; added verification is **deferred pending stakeholder decision**.
7. For edits to an otherwise signed form, which particular employee/manager/timekeeper attestations must be renewed?

## 14. Suggested phased plan for Codex

1. Inspect the current repository and identify routes, role checks, existing sessions, library choices and navigation constraints; produce a proposed plan **first**.
2. Plan payroll identity, actual pay-period model, exception schema and audit/revisions.
3. Add one employee wizard with signed-in and QR entry paths plus current/past views.
4. Render the original cleaned official PDF and validate sample/continuation layouts.
5. Add the simple Ramon/Olive management portal, alphabetical/filter views, row initials and explicit signatures.
6. Validate end-to-end on nonproduction data, review unresolved decisions with stakeholders, and deploy **only after separate approval**.

**Definition of done:** Several exact employee exception rows become one faithful official PDF per employee/pay period, Ramon and Olive can find, review, initial and sign it, employees can see initial status and make permitted current-period edits with re-review, previous periods remain retrievable, and existing Washington Schedule app functions remain intact.
