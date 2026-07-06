# Self-Managed Schedule

WHHS RT Schedule is not the official hospital schedule.

It is a staff-managed coordination view layered on top of the published baseline schedule.

## Baseline Schedule

The published `schedule_versions` record remains the baseline schedule. Staff self-managed changes do not edit `schedule_entries`.

## Staff-Managed Changes

Staff can adjust their own app schedule view with `user_schedule_overrides`.

Supported override types:

- `remove_self`: hide one of the staff member's own baseline schedule entries.
- `add_self`: add the staff member to another shift in the app view.
- `add_available`: mark the staff member available for a specific day/shift in the app view.
- `move_self`: reserved for future structure. The current UI represents moves as one `remove_self` plus one `add_self`.

No manager approval workflow exists for these personal schedule changes. The app intentionally avoids pending, approved, or denied language.

Self-reported availability does not update the published baseline schedule.

## Manage Schedule

The Manage Schedule tab shows the signed-in user's active shifts that can still be acted on. Past shifts are hidden after their shift end time. Day shifts use the `06:30` to `19:00` window, and night shifts use the `18:30` to `07:00` next-day window so a night shift remains visible after midnight until it ends.

For each shift, staff can:

- Request Switch
- Request Coverage
- Toggle Wants Off on or off
- Delete Shift with confirmation
- Remove Myself
- Add Myself Available
- Remove their own active availability
- Remove a self-added shift
- Undo a removed shift

`Wants Off` is a persisted toggle. Turning it on creates one active wants-off request for the shift. Turning it off cancels that active request and removes the Wants Off indicator from the main Schedule page after refresh/reload of schedule state. Duplicate active wants-off requests are prevented by the existing unique request indexes.

The Manage Schedule card no longer exposes Add/Edit Note or Move Myself actions. Existing request notes remain stored, but notes are not edited from this card UI.

`Delete Shift` opens a confirmation modal before changing the user's app schedule. For published baseline shifts, the app uses the existing staff-owned `remove_self` override so the baseline schedule is not deleted, and delete-created removals are not shown in the undo list. For self-added shifts, the app deactivates the user's active self-added override.

The Add Myself Available form asks for date, shift type, start time, end time, and an optional note. It creates an active `add_available` override for the signed-in staff member only.

Standard department shift defaults use military time:

- Day Shift: `06:30` to `19:00`
- Night Shift: `18:30` to `07:00`

Changing the shift type to `day_shift` or `night_shift` auto-fills those standard times. Staff can still edit the times afterward for a self-managed exception.

## Schedule Screen

The Schedule screen renders:

- Published baseline schedule entries
- Minus active `remove_self` overrides
- Plus active `add_self` overrides
- Plus active `add_available` overrides as available staff
- Active Switch Requested chips
- Active Coverage Requested chips
- Self-added chips where they add source context

Phone numbers are not shown on Schedule cards.

Expanded shift sections include an `Add Myself Available` action at the bottom. If the signed-in staff member already has active self-reported availability for that same date, shift type, start time, and end time, the action becomes `Remove My Availability`.

The main app header is not sticky. It appears at the top of the page and scrolls away normally. Bottom navigation remains fixed for mobile use.

## Security

RLS limits staff to creating and updating their own schedule overrides. Admins can view department activity. All rows remain department-scoped.

A unique active availability index prevents duplicate active `add_available` overrides for the same staff member, date, shift type, start time, and end time.

## Out Of Scope

This phase does not include:

- Published baseline schedule editing
- Personal change approval workflow
- OCR
- Schedule photo import
- Push notifications
- Native mobile app
- Payroll integration
- EMR integration
- Patient information
- Clinical notes
- Billing
- Workday integration
