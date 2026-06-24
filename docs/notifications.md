# Notifications

Washington-Schedule uses Web Push as the notification foundation.

Notifications are device-specific. Staff must enable notifications on each device where they want alerts.

## Required Environment Variables

Set these in Vercel:

```text
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

`VAPID_PRIVATE_KEY` must remain server-only. Do not expose it to browser code.

## Database Tables

### `push_subscriptions`

Stores active device push subscriptions:

- `department_id`
- `staff_profile_id`
- `endpoint`
- `p256dh`
- `auth`
- `user_agent`
- `platform`
- `is_active`
- `revoked_at`

Staff can manage only their own push subscriptions.

### `notification_preferences`

Stores per-staff preferences:

- Short Shift alerts
- Coverage Requested alerts
- Switch Requested alerts
- Coverage offer alerts
- Optional quiet hours

Short Shift alerts default to enabled.

### `notification_events`

Stores delivery records without sensitive content.

Do not log:

- Passwords
- Access tokens
- Refresh tokens
- Service keys
- Private VAPID key
- Full push auth secrets

## Short Shift Notification Flow

1. Lead or admin creates an active Short Shift alert.
2. The protected server route inserts the `shift_shortages` row.
3. Server-side notification code selects active staff in the department.
4. Staff without active push subscriptions are skipped.
5. Staff with `short_shift_alerts = false` are skipped.
6. Staff in quiet hours are skipped.
7. Web Push notifications are sent.
8. Delivery results are written to `notification_events`.

Example notification titles:

- Short Shift
- Urgent Short Shift

Notification body text stays short and generic.

## Privacy Rules

Notifications must not include:

- Patient information
- Clinical notes
- Payroll data
- EMR data
- Phone numbers
- Private reasons or sensitive notes

## App Behavior

If push is unsupported or denied, the app remains usable and shows friendly fallback text:

`Notifications are not enabled on this device. You can still check the Shift Board manually.`

## Future Work

Possible next notification triggers:

- New Coverage Requested
- New Switch Requested
- New coverage offer

Native mobile apps remain future work.
