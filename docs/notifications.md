# Notifications

WHHS RT Schedule uses in-app notifications plus Web Push. Notifications are app/push based only; the app does not send email or SMS notifications.

Notifications are device-specific. Staff must enable notifications on each device where they want alerts.

## First-Time Notification Setup

After an unclaimed user creates their password and finishes or skips Contact Info, the app shows a Notification Settings step.

The step includes:

- Enable notifications on this device
- Short Shift alerts
- Coverage request alerts
- Switch request alerts
- Coverage offer alerts

Users can skip notification setup. Notifications are never required to use the app. If push is unsupported or permission is denied, the app shows a friendly fallback and continues into the app.

The onboarding copy includes: `For best notification support on iPhone, add this app to your Home Screen.`

Preferences are saved to `notification_preferences` when the user continues. Device push subscriptions are saved to `push_subscriptions` only after the user enables browser push permission on that device.

Returning claimed users are not forced through notification setup every login. Existing notification settings can be changed later from `My Settings`.

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

Stores in-app notification records and delivery state without sensitive content.

Important fields:

- `recipient_staff_profile_id`: intended recipient.
- `read_at`: set when the recipient marks the notification read.
- `dismissed_at`: reserved for hiding notifications later.
- `delivery_status`: queued, sent, failed, or skipped.

Only the intended recipient can read or update their own notification events through RLS.

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

## Cover/Switch Notification Flow

Offer-related notifications are sent server-side through `/api/notifications/offer-events`.

Events:

- `coverage_offer_created`
  - Recipient: original request owner.
  - Title: `Coverage Offer`.
  - Body: `[Offerer name] offered to cover your [date] [shift type] shift.`
- `switch_offer_created`
  - Recipient: original request owner.
  - Title: `Switch Offer`.
  - Body: `[Offerer name] offered to switch [offered date] for your [requested date] shift.`
- `offer_accepted`
  - Recipient: offerer.
  - Title: `Offer Accepted`.
  - Body: `Your offer was accepted.`
- `offer_declined`
  - Recipient: offerer.
  - Title: `Offer Declined`.
  - Body: `Your offer was declined.`

Push click targets:

- Coverage and switch offer notifications open Manage Schedule.
- Accepted and declined offer notifications open Manage Schedule.
- Short Shift notifications open Cover/Switch.

## Notification Center

The app header includes a bell notification center. `My Settings` sits between Alerts and Sign out and includes notification preferences.

The center shows:

- unread count
- unread and read notifications
- title and body
- created time
- View action
- Mark read
- Mark all read

The Notification Center remains useful even when browser push permission is denied.

## Preferences

Notification preferences control push delivery:

- `short_shift_alerts` controls Short Shift push.
- `coverage_request_alerts` controls Coverage Offer push to request owners.
- `switch_request_alerts` controls Switch Offer push to request owners.
- `coverage_offer_alerts` controls accepted/declined offer push to offerers.

In-app notification records may still be created so users can see important events in the app.

## Privacy Rules

Notifications must not include:

- Patient information
- Clinical notes
- Payroll data
- EMR data
- Phone numbers
- Private reasons or sensitive notes

The app does not send email or SMS notifications. Staff Directory email is contact information only unless a future phase intentionally adds email features.

## App Behavior

If push is unsupported or denied, the app remains usable and shows friendly fallback text:

`Notifications are not enabled on this device. You can still check Cover/Switch manually.`

The settings UI also shows:

`Notifications are not supported on this device/browser.`

For iPhone, staff should add the app to the Home Screen and open it from the app icon for best notification support.

## Future Work

Native mobile apps remain future work.

