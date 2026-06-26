# Status Updates

Staff status updates are general profile-level messages.

They are not tied to a specific shift, date, request, or schedule entry.

## Behavior

- Each logged-in staff member can set one status message.
- The status appears under that staff member's name on every Schedule card where they appear.
- The status remains visible until the staff member edits or clears it.
- Empty or cleared status values do not render on Schedule cards.
- Status messages do not appear on Cover/Switch cards or Admin Roster Management by default.

## Limits

- Maximum length: 100 characters.
- Whitespace is trimmed before save.
- Blank values clear the status.

## Permissions

Users can update only their own status through the protected `/api/settings/status` route.

The route verifies the signed-in user, resolves their linked `staff_profiles` row, and updates only:

- `status_message`
- `status_updated_at`

Admins do not manage staff status messages in this phase.

## Privacy

Status messages are visible to authenticated department users through Schedule cards.

Do not include:

- Patient names
- Patient information
- Clinical details
- Phone numbers
- Protected health information

