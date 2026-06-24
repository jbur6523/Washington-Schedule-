# Shift Requests And Coverage Board

Washington-Schedule uses persistent Supabase rows for staff coordination. The app is not the official hospital schedule; it is a staff-managed coordination view layered on top of the published baseline schedule.

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

The request does not modify the published baseline schedule. A staff member may have Switch Requested and Coverage Requested active on the same shift.

## Coverage Requested

Coverage Requested is employee-level.

Staff can create or cancel their own active `shift_requests` row with:

- `request_type = coverage_requested`
- `status = active` or `cancelled`

Coverage Requested remains attached to the employee's own shift and does not mean the official schedule has changed.

## Notes

Request notes live on `shift_requests.note`.

Notes are capped at 140 characters and display on Manage Schedule, Schedule employee cards, and Coverage Board posts.

## Request Targets

Requests can attach to either:

- `schedule_entry_id` for a published baseline shift
- `user_schedule_override_id` for a self-added shift

Exactly one target is required.

## Coverage Board

The Coverage Board reads active Supabase data:

- Active Switch Requested rows
- Active Coverage Requested rows
- Active Short Shift alerts

Inactive, cancelled, or resolved rows are hidden from active screens.

## Offer Coverage

Staff can offer coverage from a Coverage Requested post.

Coverage offers for employee requests are stored in `shift_request_offers` with:

- `offer_type = coverage`
- `shift_request_id`
- `offered_by_staff_profile_id`
- `status = offered`

The app prevents duplicate active coverage offers from the same staff member on the same request.

## Offer Switch

Staff can offer a switch from a Switch Requested post.

Switch offers are stored in `shift_request_offers` with:

- `offer_type = switch`
- `shift_request_id`
- `offered_by_staff_profile_id`
- an existing offered shift target or manually entered offered shift fields
- `status = offered`

Switch offers must stay within the same department week as the requested shift. The department week starts Sunday and ends Saturday.

If the staff member's app schedule is not current, the Add Date flow allows a manual offered shift with:

- date
- shift type
- shift start
- shift end
- optional note up to 140 characters

Manual offered dates are blocked if they fall outside the same Sunday-through-Saturday week.

## Offer Responses

The request owner can see received offers on Manage Schedule.

- Accept Offer updates the offer to `accepted` and resolves the related request.
- Decline Offer updates the offer to `declined`; the request remains active.
- Accepted offers do not rewrite the official baseline schedule automatically.

Offer-created, accepted, and declined events create in-app `notification_events` and attempt Web Push delivery when the recipient has enabled notifications and preferences allow it.

## Short Shift

Short Shift is shift-level only.

- `severity = short` renders yellow.
- `severity = urgent` renders red.
- Short Shift never appears on an employee card.
- Staff cannot create Short Shift alerts.
- Lead and admin users can create, resolve, or cancel Short Shift alerts.

Short Shift coverage offers still use the existing `coverage_offers` path.

## Roles

Staff can:

- View the schedule
- View the Coverage Board
- Create/cancel their own Switch Requested rows
- Create/cancel their own Coverage Requested rows
- Add/edit their own request notes
- Offer coverage or switch
- Accept/decline offers on their own requests

Lead users can:

- Do everything staff can do
- Create, resolve, and cancel Short Shift alerts

Admin users can:

- Do everything lead users can do
- Manage the Staff Directory
- Manage schedule versions

## Future

Email, SMS, native mobile, OCR, payroll, and EMR integrations remain out of scope.
