# Respiratory Command Center

The Respiratory Command Center is a simplified department-phone experience inside WHHS RT Schedule. It is for shared respiratory department operations, not personal schedule management.

## Access Types

### Command Center

`staff_profiles.operations_role = command_center`

Seeded username:

- `sputum`

Shared-device temporary password:

- `2000`

The `sputum` account routes directly to `/command-center` after login. It does not show the normal Schedule tab, bottom navigation, Gossip, Staff Directory, Admin settings, staff management, or personal staff tools.

The department phone can use `Keep me signed in on this device` so the command-center session survives normal app closes and PWA reopens. This stores a Supabase session, not the password.

Command Center can access only:

- Shift Update
- Rental Management
- Short Shift Alert

Because this is a shared login, actions must ask who completed the work. Visible history and exports should show the selected staff member or initials, not `sputum`.

### Director

`staff_profiles.operations_role = director`

Seeded username:

- `aloha`

The Director account routes directly to `/director/shift-status` after login. The Director should choose or set his own password through the normal password setup/reset process. Do not hard-code a permanent director password.

Director sessions can also use `Keep me signed in on this device`; restored sessions still route to `/director/shift-status` and remain read-only.

Director access is read-only. It can view Shift Status numbers but cannot edit shift updates, use Command Center workflows, manage rentals, access Admin tools, use personal staff tools, open Staff Directory, or access Gossip by default.

## Command Center Menu

Route:

`/command-center`

Menu cards:

- `Shift Update`: update current shift staffing and equipment numbers.
- `Rental Management`: order rentals, confirm delivery, and manage pickups.
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
- Vent count
- BiPAP count
- C-Section count
- CABG count
- Bronch count
- Sputum Induction count
- Other count
- Optional other procedure note, max 100 characters
- Updated by lead selector, with a secondary manual initials/name fallback

The `Updated By` selector shows active Lead users only. It excludes Staff, Aide, Director, Command Center, inactive users, and the shared `Respiratory Command Center` account. The command phone must not use the shared account as the visible updated-by person.

The manual initials/name fallback is secondary and should be used only when the appropriate Lead cannot be selected from the dropdown. The Shift Update form is optimized for mobile shared-phone use with aligned two-column field pairs and shortened labels.

## Normal Schedule Current Shift Status

Authenticated department users see a compact `Current Shift Status` card directly under the Schedule page `Shift View` selector. This replaces the older main-header summary row for Scheduled, Available, Coverage, Short Shifts, and Switch Requests.

The card comes from Command Center shift updates and shows:

- RTs Scheduled
- RTs Needed
- Vent count
- Last updated time
- Updated by, when available

The compact card shows only those three number tiles. `Staffed`, `Short`, or `No Update` appears only in the title line. `Staffed` uses green, `Short` uses red, and `No Update` uses neutral gray.

The compact Schedule card does not follow the `Day`, `Night`, or `All` schedule filter. Those controls continue to filter schedule cards only. Current Shift Status uses the same Command Center update source as the Director dashboard. It first looks for the active department shift window:

- Day Shift: `08:00-19:59`
- Night Shift: `20:00-07:59`

At `08:00` the card starts looking for the new day-shift update. At `20:00` it starts looking for the new night-shift update. During the day window, if the day update has not been submitted yet but a same-day night update exists, the card can show that latest same-day Command Center update so Staff and Director do not disagree about whether data exists. After the night reset, it does not fall back to stale day-shift data. If no eligible Command Center update exists, the card shows `Current Shift Status · No Update` and a single compact no-update message. The normal Schedule page intentionally omits BiPAP counts and procedure counts.

## Director Shift Status

Route:

`/director/shift-status`

The Director Shift Status page is the primary live visual reporting dashboard for current respiratory department numbers. Email is secondary/future; the app dashboard is the source of truth for this phase.

The Director view is read-only and uses a polished mobile dashboard layout:

- Compact header with visible `Refresh` and `Sign Out` controls
- `Current Shift Status` card with `Staffed`, `Short`, or `No Update` status pill
- Main stat cards for Scheduled and RTs Needed
- `Department Snapshot` card with Vent count, BiPAP count, scheduled procedure total, and delivered/active Active Rentals count
- Scheduled procedure detail cards for C-Sections, CABG, Bronchs, Sputum Inductions, and Other
- Last updated freshness text and updated-by initials/display name
- Compact shift selector with Today Day Shift, Today Night Shift, Tomorrow Day Shift, Tomorrow Night Shift, and Previous Shift options
- `View Text Report` and `Copy Summary` actions

If the selected current shift has no submitted update, the page can show the most recent Command Center update with a clear fallback label. It does not allow editing.

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

## Privacy

Do not enter patient names, MRNs, clinical details, or patient identifiers.

The Command Center and Director experiences must not expose staff usernames, auth IDs, personal phone numbers, or staff emails.
