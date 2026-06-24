# Self-Managed Schedule

Washington-Schedule is not the official hospital schedule.

It is a staff-managed coordination view layered on top of the published baseline schedule.

## Baseline Schedule

The published `schedule_versions` record remains the baseline schedule. Staff self-managed changes do not edit `schedule_entries`.

## Staff-Managed Changes

Staff can adjust their own app schedule view with `user_schedule_overrides`.

Supported override types:

- `remove_self`: hide one of the staff member's own baseline schedule entries.
- `add_self`: add the staff member to another shift in the app view.
- `move_self`: reserved for future structure. The current UI represents moves as one `remove_self` plus one `add_self`.

No manager approval workflow exists for these personal schedule changes. The app intentionally avoids pending, approved, or denied language.

## Manage Schedule

The Manage Schedule tab shows the signed-in user's active shifts.

For each shift, staff can:

- Request Switch
- Request Coverage
- Add/Edit Note
- Remove Myself
- Move Myself
- Undo a self-added shift
- Undo a removed shift

Notes are capped at 140 characters.

## Schedule Screen

The Schedule screen renders:

- Published baseline schedule entries
- Minus active `remove_self` overrides
- Plus active `add_self` overrides
- Active Switch Requested chips
- Active Coverage Requested chips
- Self-added chips where appropriate

Phone numbers are not shown on Schedule cards.

## Security

RLS limits staff to creating and updating their own schedule overrides. Admins can view department activity. All rows remain department-scoped.

## Out Of Scope

This phase does not include:

- Official hospital schedule editing
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
