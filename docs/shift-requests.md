# Shift Requests And Shift Board

Washington-Schedule uses persistent Supabase rows for staff coordination.

## Terminology

Use only:

- Switch Requested
- Coverage Requested
- Short Shift

Do not use:

- Wants Off
- Shift Available
- Need Covered ASAP
- Urgent Need
- Short Shift Open

## Switch Requested

Switch Requested is employee-level.

Staff can create or cancel their own active `shift_requests` row with:

- `request_type = switch_requested`
- `status = active` or `cancelled`

The request does not modify the published baseline schedule.

## Coverage Requested

Coverage Requested is employee-level.

Staff can create or cancel their own active `shift_requests` row with:

- `request_type = coverage_requested`
- `status = active` or `cancelled`

Staff can have both Switch Requested and Coverage Requested active on the same shift.

## Notes

Request notes live on `shift_requests.note`.

Notes are capped at 140 characters and display on Manage Schedule, Schedule employee cards, and Shift Board posts.

## Self-Managed Shift Targets

Requests can attach to either:

- `schedule_entry_id` for a published baseline shift
- `user_schedule_override_id` for a self-added shift

Exactly one target is required.

## Shift Board

The Shift Board reads active Supabase data:

- Active Switch Requested rows
- Active Coverage Requested rows
- Active Short Shift alerts

Inactive, cancelled, or resolved rows are hidden from active screens.

## Coverage Offers

Staff can offer help from the Shift Board.

Offers are stored in `coverage_offers` and link to either:

- `shift_request_id`
- `shift_shortage_id`

One staff member cannot create duplicate active offers for the same request or shortage.

Admin accept/decline workflow remains out of scope for this phase.

## Short Shift

Short Shift is shift-level only.

- `severity = short` renders yellow.
- `severity = urgent` renders red.
- Short Shift never appears on an employee card.
- Staff cannot create Short Shift alerts.
- Lead and admin users can create, resolve, or cancel Short Shift alerts.

## Roles

Staff can:

- View the schedule
- View the Shift Board
- Create/cancel their own Switch Requested rows
- Create/cancel their own Coverage Requested rows
- Add/edit their own request notes
- Create/cancel their own coverage offers

Lead users can:

- Do everything staff can do
- Create, resolve, and cancel Short Shift alerts

Admin users can:

- Do everything lead users can do
- Manage the Staff Directory
- Manage schedule versions

## Future

Push notifications are future work after the backend workflows are stable.
