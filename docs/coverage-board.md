# Coverage Board

The Coverage Board is the live staff coordination board.

Washington-Schedule is not the official hospital schedule. It is a staff-managed coordination view only.

## What Appears

The Coverage Board shows active:

- Switch Requested posts
- Coverage Requested posts
- Short Shift alerts

Cancelled, resolved, accepted, or declined records are hidden from active board surfaces unless a status view later adds them.

## Offer Coverage

Coverage Requested cards include `Offer Coverage`.

Flow:

1. Staff taps Offer Coverage.
2. App shows a confirmation with the requester, date, shift type, and shift time.
3. Staff can add an optional note up to 140 characters.
4. Staff taps Send Offer.
5. App creates a `shift_request_offers` row with `offer_type = coverage`.
6. App creates an in-app notification event for the requester.

Duplicate active coverage offers from the same staff member on the same request are blocked.

## Offer Switch

Switch Requested cards include `Offer Switch`.

Flow:

1. Staff taps Offer Switch.
2. App asks what shift they want to switch.
3. App auto-populates the current user's eligible shifts from the same Sunday-through-Saturday week as the requested shift.
4. Staff selects an eligible shift or uses Add Date.
5. App shows a confirmation statement.
6. Staff taps Send Switch Offer.
7. App creates a `shift_request_offers` row with `offer_type = switch`.
8. App creates an in-app notification event for the requester.

## Same-Week Rule

The department week starts Sunday and ends Saturday.

Switch offers must stay within the same Sunday-through-Saturday week as the requested shift.

If the requested shift is Wednesday, the eligible switch window is the Sunday before through the Saturday after.

Out-of-week manual dates are blocked with:

`Switches must be within the same week, Sunday through Saturday.`

## Add Date

Add Date lets staff manually enter a shift when the app schedule is not current.

Fields:

- Date
- Shift type
- Shift start
- Shift end
- Optional note, max 140 characters

The manually entered date must still be in the same Sunday-through-Saturday week.

## Accept Or Decline Offers

Request owners see received offers on Manage Schedule.

Coverage offer:

- `[Offerer name] offered to cover this shift.`
- Accept Offer
- Decline Offer

Switch offer:

- `[Offerer name] offered to switch [offered date/shift] for your [requested date/shift].`
- Accept Offer
- Decline Offer

Accepting an offer:

- Sets the offer status to `accepted`.
- Resolves the original shift request.
- Does not rewrite the official baseline schedule.

Declining an offer:

- Sets the offer status to `declined`.
- Leaves the request active.

## Short Shift

Short Shift is shift-level only.

- Lead and admin users can create, resolve, or cancel Short Shift alerts.
- Staff cannot create Short Shift alerts.
- Short Shift never appears on an employee card.
- Yellow means short.
- Red means urgent.

## Out Of Scope

This phase does not include:

- Manager approval workflow
- Phone push notifications for offer events
- OCR
- Schedule photo import
- Native mobile app
- Payroll integration
- EMR integration
- Patient information
- Clinical notes
- Billing
- Workday integration
