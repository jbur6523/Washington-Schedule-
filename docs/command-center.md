# Respiratory Command Center

The Respiratory Command Center is a simplified department-phone experience inside WHHS RT Schedule. It is for shared respiratory department operations, not personal schedule management.

## Access Types

### Command Center

`staff_profiles.operations_role = command_center`

Seeded username:

- `sputum`

Shared-device setup password:

- Provided out of band by the department administrator. Do not publish the shared-device password in app UI or documentation.

The `sputum` account routes directly to `/command-center` after login. It does not show the normal Schedule tab, bottom navigation, Gossip, Staff Directory, Admin settings, staff management, or personal staff tools.

The department phone can use `Keep me signed in on this device` so the command-center session survives normal app closes and PWA reopens. This stores a Supabase session, not the password.

Command Center can access only:

- Shift Update
- Rental Management
- ICU Snapshot
- Short Shift Alert
- RT Aide Notes

Because this is a shared login, actions must ask who completed the work. Visible history and exports should show the selected staff member or initials, not `sputum`.

### Director

`staff_profiles.operations_role = director`

Seeded username:

- `aloha`

The Director account routes directly to `/director/shift-status` after login. The Director should choose or set his own password through the normal password setup/reset process. Do not hard-code a permanent director password.

Director sessions can also use `Keep me signed in on this device`; restored sessions still route to `/director/shift-status` and remain read-only.

Director access is read-only. It can view Shift Status numbers but cannot edit shift updates, use Command Center workflows, manage rentals, access Admin tools, use personal staff tools, open Staff Directory, or access Gossip by default.

### ICU Command Center

`staff_profiles.operations_role = icu_command_center`

Seeded username:

- `ventilator`

The ICU Command Center account routes directly to `/icu-command-center` after login. It can add, update, discontinue, toggle Critical Vent status, view per-record history, review Today's ICU Activity, and search previous ICU operational dates for respiratory device entries. It does not use the normal Schedule tab, bottom navigation, Gossip, Staff Directory, or personal staff tools.

ICU Command Center entries are operational bed/device snapshots only. Do not enter patient names, MRNs, DOBs, diagnoses, or patient-identifying notes.

Discontinue actions require Discontinued Date and Discontinued Time for all device types. Vent discontinue actions also require Ventilator Outcome. Daily activity and previous-date searches use America/Los_Angeles date boundaries.

## Command Center Menu

Route:

`/command-center`

Menu cards:

- `Shift Update`: update current shift staffing and equipment numbers.
- `Rental Management`: order rentals, confirm delivery, and manage pickups.
- `RT Aide Notes`: send notes or questions to RT Aides.
- `ICU Snapshot`: view ICU respiratory devices and settings in read-only mode.
- `Short Shift Alert`: post a staffing need for the current shift.

The Command Center route is mobile-first and does not render the normal app bottom nav.

## Shift Update

Route:

`/command-center/shift-update`

Shift Update saves operational numbers to `shift_status_updates`.

Fields:

- Shift date
- Shift type: Day Shift or Night Shift
- RTs Scheduled
- RTs Needed, which can include decimals such as `6.9`
- Vent count, which uses ICU Command Center active Vent count when available and falls back to the Command Center shift update value only if the ICU aggregate count is unavailable.
- BiPAP count
- C-Section count
- Vaginal Delivery count
- CABG count
- Bronch count
- Sputum Induction count
- Other count
- Optional other procedure note, max 100 characters
- Updated by lead selector, with a secondary manual initials/name fallback

The `Updated By` selector shows active Lead and Admin users who can act as shift updaters. It excludes Staff, Aide, Director, Command Center, inactive users, and the shared `Respiratory Command Center` account. The command phone must not use the shared account as the visible updated-by person.

The manual initials/name fallback is secondary and should be used only when the appropriate Lead cannot be selected from the dropdown. The Shift Update form is optimized for mobile shared-phone use with aligned two-column field pairs and shortened labels.

## Normal Schedule Current Shift Status

Authenticated department users see a compact `Current Shift Status` card directly under the Schedule page `Shift View` selector. This replaces the older main-header summary row for Scheduled, Available, Coverage, Short Shifts, and Switch Requests.

The card comes from Command Center shift updates and shows:

- RTs Scheduled
- RTs Needed
- Vent count
- Last updated time
- Updated by, when available

The compact card shows only those three number tiles. `Staffed`, `Short`, or `No Update` appears only in the title line. `Staffed` uses green, `Short` uses red, and `No Update` uses neutral gray. `Short` only appears when `RTs Needed - RTs Scheduled >= 0.5`; smaller gaps such as `8 scheduled / 8.4 needed` remain `Staffed`.

The compact Schedule card does not follow the `Day`, `Night`, or `All` schedule filter. Those controls continue to filter schedule cards only. Current Shift Status uses the same Command Center update source as the Director dashboard. It first looks for the active department shift window:

- Day Shift: `08:00-19:59`
- Night Shift: `20:00-07:59`

At `08:00` the card starts looking for the new day-shift update. At `20:00` it starts looking for the new night-shift update. During the day window, if the day update has not been submitted yet but a same-day night update exists, the card can show that latest same-day Command Center update so Staff and Director do not disagree about whether data exists. After the night reset, it does not fall back to stale day-shift data. If no eligible Command Center update exists, the card shows `Current Shift Status · No Update` and a single compact no-update message. The normal Schedule page intentionally omits BiPAP counts and procedure counts. The displayed Vent count is prioritized from the ICU Command Center aggregate count so Staff, Director, and ICU Snapshot vent totals stay aligned.

## Director Shift Status

Route:

`/director/shift-status`

The Director Shift Status page is the primary live visual reporting dashboard for current respiratory department numbers. Email is secondary/future; the app dashboard is the source of truth for this phase.

The Director view is read-only and uses a polished mobile dashboard layout:

- Compact header with visible top-right `Sign Out` control
- `Respiratory Directory` action for a read-only staff contact modal
- `Current Shift Status` card with `Staffed`, `Short`, or `No Update` status pill
- Main stat cards for Scheduled and RTs Needed
- `Department Snapshot` card with left-aligned shift/date context, Vent count, BiPAP count, scheduled procedure total, delivered/active Active Rentals count, and last-updated metadata
- Scheduled procedure detail cards for C-Sections, Vaginal Delivery, CABG, Bronchs, Sputum Inductions, and Other with left-aligned shift/date context
- Last updated freshness text and updated-by initials/display name
- `View Shift` action inside the Current Shift Status card. It opens a read-only modal schedule preview where the Director can choose an uploaded schedule date and Day Shift or Night Shift.
- `View Text Report` and `Copy Summary` actions

If the selected current shift has no submitted update, the page can show the most recent Command Center update with a clear fallback label. It does not allow editing.

The `Respiratory Directory` modal reads `staff_profiles` and includes active and inactive staff sorted by display name. It shows display names and phone numbers only, with phone numbers linked by `tel:` when present. It does not show usernames, auth IDs, email addresses, edit buttons, or admin controls.

The Director page includes an `ICU Snapshot` section with Vents, HFNC, BiPAP, and Critical Vents. `View All` opens a read-only ICU detail report with bed, device, airway when relevant, settings, Critical Vent flag, and last updated time. Director users cannot edit, discontinue, toggle Critical Vent status, or view internal ICU lifecycle controls.

The `View Shift` modal uses the active uploaded schedule data. It defaults to the current `America/Los_Angeles` calendar date when that date exists in the uploaded schedule, then the closest future uploaded date, then the previous shift date if no future date exists. The date dropdown shows the previous shift date when uploaded, the current date when uploaded, and all future uploaded dates. Older past uploaded dates stay out of the dropdown and can be entered manually as `MMDDYY`; if no uploaded schedule exists for that date, the modal shows `No uploaded schedule found for this date.` The modal defaults to Day Shift from `07:00-18:59` Pacific and Night Shift from `19:00-06:59` Pacific. It shows scheduled staff names, shift times, FT/PD/Aide badges, and Shift Lead indicators only. It does not expose request, coverage, delete, remove, or other staff schedule actions. The modal uses the top `Close` control only, and the staff list has extra bottom padding so the final card remains fully visible when scrolled.

Scheduled Procedures reset separately from the Department Snapshot. At `07:30` and `19:30` in `America/Los_Angeles`, the procedure counts show `0` until a new Command Center update is submitted after the reset boundary. The Department Snapshot continues to show the latest known Vent, BiPAP, and Active Rentals numbers, while its Scheduled Procedures total follows the reset procedure counts.

A fuller `Next 3 Days` grid can be added later if the director needs a multi-shift board. For now, the compact selector keeps the mobile dashboard short while still allowing the director to check today, tomorrow, and the previous shift.

## Rental Attribution

For `command_center` users, Rental Management actions require staff attribution:

- Order Rental
- Confirm Delivery
- Cancel Delivery
- Call for Pickup
- Confirm Picked Up
- Cancel Pickup

Normal Admin, Lead, and Aide personal logins continue to use the current logged-in user automatically.

Rental History and printable export initials should reflect the selected staff attribution for command-center actions.

## Short Shift Alert

Route:

`/command-center/short-shift-alert`

The command phone can post a Short Shift alert using the existing Short Shift infrastructure. The form requires staff attribution and includes a no-patient-information warning.

## RT Aide Notes

The Respiratory Command Center dashboard includes `RT Aide Notes` for lightweight notes and questions to RT Aides/equipment techs.

- Command Center users can create notes from the Respiratory Command Center dashboard. RLS also permits department Lead/Admin accounts to create/view notes when surfaced through an authorized workflow.
- Note creation requires `Added by`; the form lists active Lead/Admin staff names and includes `Not listed? Type name manually` for fallback attribution. The selected or typed name is shown as the note's visible creator.
- Each note requires note text, supports Normal or Urgent priority, and shows `No patient information.`
- Notes appear in Order Management for Aide/Admin users as distinct task/message cards with a `status = new` badge count.
- Aide/Admin users can acknowledge notes with a compact checkbox-style action and can optionally expand `+ Add Note` when a reply/detail is needed.
- Aide note text appears directly under the original RT note, while acknowledgement metadata sits at the bottom of each card.
- Command Center users can reopen RT Aide Notes to view New, Acknowledged, and Responded status, including optional Aide note text and responder display name.
- This workflow is for the Respiratory Command Center only. It is not shown in the ICU Command Center.

## Privacy

Do not enter patient names, MRNs, clinical details, or patient identifiers.

The Command Center and Director experiences must not expose staff usernames, auth IDs, personal phone numbers, or staff emails.
